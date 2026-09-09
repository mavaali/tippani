// Azure DevOps (Git) backing path via the ADO REST API, behind the common
// IWorkspaceStore contract. Each workspace is one file `<workspaceId>.json` on a
// per-run branch `tippani-s0/<runId>`; the branch's tip commit is the CAS token.
//
// CAS is provider-native: a push carries `oldObjectId` = the branch tip we read.
// If a competing writer advanced the ref, the push is rejected and we surface a
// typed stale-writer conflict. The default branch is never touched.
//
// Two modes on one code path, mirroring the OneDrive transport:
//   dryRun (default) - records the intended ADO operations against a coherent
//                      in-memory model; zero network calls.
//   live             - issues ADO REST calls with a runtime-supplied bearer token.
//
// Host-agnostic: org, project, repo, and token come from the environment.

import crypto from "node:crypto";
import {
  CorruptWorkspaceStoreError,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WorkspaceStoreError,
  applyWorkspaceOperation,
  assertReconcilable,
  deepClone,
  validateWorkspaceSnapshot,
  validateWorkspaceRecord,
} from "../workspace-contract.mjs";
import { assertCleanupAuthorized, cleanupCoordinatesHash } from "../cleanup-manifest.mjs";
import { providerTargetHash } from "../preflight.mjs";
import { ProviderCredentialBinding } from "../provider-identity.mjs";
import { ReferenceMemoryWorkspaceStore } from "./reference-memory-store.mjs";
import { PersistentPendingQueue } from "./persistent-pending-queue.mjs";
import { ProviderTelemetry, retryAfterMilliseconds } from "./provider-telemetry.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ZERO_OID = "0000000000000000000000000000000000000000";
const API = "api-version=7.1";
const RUN_MARKER_PATH = ".tippani-s0-run";
const MAX_RETRY_AFTER_MS = 30_000;

export class AdoGitStore {
  constructor({
    dryRun = true,
    org,
    project,
    repo,
    runId,
    adoToken,
    getToken,
    configurationId = "CFG-ADO",
    fetchImpl,
    storeRoot,
    safetyBudget = null,
    signal = null,
    identityResolver = null,
    preflightApproval = null,
    effectiveTargetHash = null,
    enforcePreflight = false,
    ownershipMarker,
    cleanupManifestId = null,
    cleanupManifestNonce = null,
  } = {}) {
    this.dryRun = dryRun !== false;
    this.org = org || process.env.S0_ADO_ORG || null;
    this.project = project || process.env.S0_ADO_PROJECT || null;
    this.repo = repo || process.env.S0_ADO_REPO || null;
    this.runId = runId || "s0-ado";
    this.branch = `tippani-s0/${this.runId}`;
    this._getToken = getToken
      || (adoToken ? async () => adoToken : null)
      || (process.env.S0_ADO_TOKEN ? async () => process.env.S0_ADO_TOKEN : null);
    this.configurationId = configurationId;
    this.fetchImpl = fetchImpl || globalThis.fetch;
    this.safetyBudget = safetyBudget;
    this.signal = signal;
    this.identityResolver = identityResolver;
    this.resolvedIdentity = null;
    this.preflightApproval = preflightApproval;
    this.effectiveTargetHash = effectiveTargetHash;
    this.enforcePreflight = enforcePreflight === true;
    this.ownershipMarker = ownershipMarker || `tippani-s0:${this.runId}`;
    this.cleanupManifestId = cleanupManifestId;
    this.cleanupManifestNonce = cleanupManifestNonce;
    this.operations = [];
    this.liveProviderCalls = 0;
    this.telemetry = new ProviderTelemetry({ safetyBudget });
    this.credentialBinding = new ProviderCredentialBinding({
      provider: "ado",
      getToken: this._getToken,
      fetchImpl: this.fetchImpl,
      signal: this.signal,
      identityResolver: this.identityResolver,
      beforeAttempt: async () => {
        await this.telemetry.recordRequest();
        this.liveProviderCalls++;
      },
      wrapResponse: (response, context) => this.telemetry.wrapResponse(response, context),
    });
    this.model = new ReferenceMemoryWorkspaceStore({ configurationId });
    this._fault = null;
    this.offline = false;
    this.pendingQueue = new PersistentPendingQueue({
      storeRoot,
      provider: "ado",
      runId: this.runId,
    });
    this.initialized = false;
  }

  injectFault(kind) {
    this._fault = { kind };
  }

  bindCleanupManifestNonce(nonce) {
    if (typeof nonce !== "string" || !nonce) {
      throw new WorkspaceStoreError("Cleanup manifest nonce is required", "cleanup_manifest_required");
    }
    if (this.cleanupManifestNonce && this.cleanupManifestNonce !== nonce) {
      throw new WorkspaceStoreError("Cleanup manifest nonce is immutable", "cleanup_manifest_mismatch");
    }
    this.cleanupManifestNonce = nonce;
  }

  ensureCleanupManifestNonce() {
    if (!this.cleanupManifestNonce) {
      if (this.enforcePreflight) {
        throw new WorkspaceStoreError(
          "Provider initialization requires a persisted cleanup manifest nonce",
          "cleanup_manifest_required",
        );
      }
      this.cleanupManifestNonce = `syn-test-${this.runId}`;
    }
  }

  runMarker() {
    return {
      schemaVersion: 1,
      syntheticData: true,
      kind: "tippani-s0-ado-run",
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      namespace: `tippani-s0/${this.runId}`,
      effectiveTargetHash: this.effectiveTargetHash || "dry-run-unapproved",
      manifestNonce: this.cleanupManifestNonce,
      organization: this.org,
      project: this.project,
      repository: this.repo,
    };
  }

  runMarkerContent() {
    return JSON.stringify(this.runMarker());
  }

  runMarkerDigest() {
    return `sha256:${crypto.createHash("sha256").update(this.runMarkerContent()).digest("hex")}`;
  }

  async resolveCredentialIdentity() {
    if (this.resolvedIdentity) return this.resolvedIdentity;
    this.resolvedIdentity = await this.credentialBinding.resolveIdentity();
    return this.resolvedIdentity;
  }

  async credentialToken() {
    if (!this.enforcePreflight) {
      return (await this.credentialBinding.issuePinned()).token;
    }
    return (await this.credentialBinding.issueApproved()).token;
  }

  async assertEffectiveTargetApproved() {
    if (this.dryRun || !this.enforcePreflight) return;
    const identity = await this.resolveCredentialIdentity();
    const targetHash = providerTargetHash({
      provider: "ado",
      identity,
      coordinates: {
        organization: this.org,
        project: this.project,
        repository: this.repo,
      },
      namespace: `tippani-s0/${this.runId}`,
    });
    const approval = this.preflightApproval || {};
    if (!targetHash ||
        targetHash !== this.effectiveTargetHash ||
        approval.targetHash !== targetHash ||
        typeof approval.approver !== "string" || !approval.approver.trim() ||
        typeof approval.approvedAt !== "string" || !Number.isFinite(Date.parse(approval.approvedAt)) ||
        Date.parse(approval.approvedAt) > Date.now() ||
        typeof approval.reference !== "string" || !approval.reference.trim()) {
      throw new WorkspaceStoreError(
        "Effective ADO target is not covered by a structured preflight approval",
        "preflight_required",
      );
    }
    this.credentialBinding.approveIdentity(identity);
  }

  record(op, detail = {}) {
    this.operations.push({ op, backingPath: "ado", namespace: `tippani-s0/${this.runId}`, ...detail });
  }

  base() {
    return `https://dev.azure.com/${this.org}/${encodeURIComponent(this.project)}/_apis/git/repositories/${encodeURIComponent(this.repo)}`;
  }

  refName() {
    return `refs/heads/${this.branch}`;
  }

  async ado(method, url, { headers = {}, body, accept = "application/json" } = {}) {
    if (this.dryRun) throw new Error("ado() must not be called in dry-run");
    if (!this._getToken) throw new WorkspaceStoreError("No ADO token supplied", "no_token");
    if (!this.org || !this.project || !this.repo) throw new WorkspaceStoreError("org/project/repo required for a live run", "no_coordinates");
    const fault = this._fault;
    let injectedThrottle = null;
    if (fault && method !== "GET") {
      await this.telemetry.recordRequest(body);
      this.liveProviderCalls++;
      this._fault = null;
      if (fault.kind === "throttle") {
        injectedThrottle = await this.telemetry.wrapResponse({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "1" }),
          text: async () => "throttled",
          json: async () => ({}),
        }, { method, sent: false });
      }
      if (fault.kind === "auth-expiry") return this.telemetry.wrapResponse({ ok: false, status: 401, text: async () => "unauthorized", json: async () => ({}) }, { method, sent: false });
      if (fault.kind === "permission-loss") return this.telemetry.wrapResponse({ ok: false, status: 403, text: async () => "forbidden", json: async () => ({}) }, { method, sent: false });
      if (fault.kind === "quota") return this.telemetry.wrapResponse({ ok: false, status: 507, text: async () => "quota exceeded", json: async () => ({}) }, { method, sent: false });
      if (fault.kind === "outage") {
        this.telemetry.recordFailure("outage");
        throw new WorkspaceStoreError("network outage (injected)", "provider_unreachable");
      }
      if (fault.kind === "lost-response") {
        const token0 = await this.credentialToken();
        try {
          await this.fetchImpl(url, {
            method,
            headers: { Authorization: `Bearer ${token0}`, ...headers },
            body,
            signal: this.signal,
          });
        } catch (error) {
          throw this.telemetry.indeterminateWrite(error, "transport_failure");
        }
        throw this.telemetry.indeterminateWrite(
          new Error("response lost (injected)"),
          "response_lost",
        );
      }
    }
    const token = await this.credentialToken();
    for (let attempt = 0; ; attempt++) {
      let transportStarted = false;
      try {
        let response;
        if (attempt === 0 && injectedThrottle) {
          response = injectedThrottle;
        } else {
          await this.telemetry.recordRequest(body);
          this.liveProviderCalls++;
          transportStarted = true;
          response = await this.telemetry.wrapResponse(await this.fetchImpl(url, {
            method,
            headers: { Authorization: `Bearer ${token}`, Accept: accept, ...headers },
            body,
            signal: this.signal,
          }), { method });
        }
        if (response.status === 429 && attempt < 2) {
          const retryAfterMs = retryAfterMilliseconds(response);
          const delayMs = retryAfterMs ?? (250 * (attempt + 1));
          if (delayMs <= MAX_RETRY_AFTER_MS) {
            this.telemetry.recordRetry();
            this.telemetry.recordBackoff(delayMs);
            await sleep(delayMs);
            continue;
          }
        }
        return response;
      } catch (error) {
        if (error?.code === "indeterminate_write") throw error;
        if (method !== "GET" && transportStarted) {
          throw this.telemetry.indeterminateWrite(error, "transport_failure");
        }
        if (method !== "GET" || attempt >= 2 || !(error instanceof TypeError)) throw error;
        const delayMs = 250 * (attempt + 1);
        this.telemetry.recordRetry();
        this.telemetry.recordBackoff(delayMs);
        await sleep(delayMs);
      }
    }
  }

  async getTip() {
    const resp = await this.ado("GET", `${this.base()}/refs?filter=heads/${this.branch}&${API}`);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`refs failed: ${resp.status}`);
    const body = await resp.json();
    return body.value?.[0]?.objectId ?? null;
  }

  async readRawAt(itemPath, version, versionType = "commit") {
    const url = `${this.base()}/items?path=/${encodeURIComponent(itemPath)}` +
      `&versionDescriptor.version=${version}&versionDescriptor.versionType=${versionType}&${API}`;
    const response = await this.ado("GET", url, { accept: "text/plain" });
    if (!response.ok) {
      throw new WorkspaceStoreError(
        "ADO run branch lacks the persisted ownership marker",
        "cleanup_ownership_mismatch",
      );
    }
    return response.text();
  }

  async verifyRunMarker(tip = null) {
    const pinnedTip = tip || await this.getTip();
    if (!pinnedTip) {
      throw new WorkspaceStoreError(
        "ADO run branch is missing",
        "cleanup_ownership_mismatch",
      );
    }
    let marker;
    try {
      marker = JSON.parse(await this.readRawAt(RUN_MARKER_PATH, pinnedTip));
    } catch (error) {
      if (error?.code === "cleanup_ownership_mismatch") throw error;
      throw new WorkspaceStoreError(
        "ADO ownership marker content is invalid",
        "cleanup_ownership_mismatch",
      );
    }
    if (JSON.stringify(marker) !== JSON.stringify(this.runMarker())) {
      throw new WorkspaceStoreError(
        "ADO ownership marker does not match this approved run",
        "cleanup_ownership_mismatch",
      );
    }
    return { path: RUN_MARKER_PATH, digest: this.runMarkerDigest(), tip: pinnedTip };
  }

  async createRunMarker() {
    await this.safetyBudget?.recordObjects(1);
    this.record("push-run-marker", {
      item: RUN_MARKER_PATH,
      precondition: "oldObjectId=zero",
    });
    const body = JSON.stringify({
      refUpdates: [{ name: this.refName(), oldObjectId: ZERO_OID }],
      commits: [{
        comment: `s0 claim ${this.runId}`,
        changes: [{
          changeType: "add",
          item: { path: `/${RUN_MARKER_PATH}` },
          newContent: { content: this.runMarkerContent(), contentType: "rawtext" },
        }],
      }],
    });
    const response = await this.ado("POST", `${this.base()}/pushes?${API}`, {
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!response.ok) {
      const concurrentTip = await this.getTip();
      if (concurrentTip) {
        await this.verifyRunMarker(concurrentTip);
        return;
      }
      throw new WorkspaceStoreError(
        `run ownership marker create failed: ${response.status}`,
        "cleanup_ownership_mismatch",
      );
    }
  }

  async readAt(workspaceId, version, versionType) {
    const url = `${this.base()}/items?path=/${encodeURIComponent(`${workspaceId}.json`)}` +
      `&versionDescriptor.version=${version}&versionDescriptor.versionType=${versionType}&${API}`;
    const resp = await this.ado("GET", url, { accept: "text/plain" });
    if (resp.status === 404) throw new WorkspaceNotFoundError(workspaceId);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`read failed: ${resp.status}`);
    try {
      return validateWorkspaceRecord(JSON.parse(await resp.text()));
    } catch (error) {
      if (error instanceof WorkspaceStoreError) throw error;
      throw new CorruptWorkspaceStoreError(`workspace ${workspaceId} is not valid JSON`);
    }
  }

  async pushChange(workspaceId, workspace, changeType, oldObjectId) {
    const body = JSON.stringify({
      refUpdates: [{ name: this.refName(), oldObjectId: oldObjectId ?? ZERO_OID }],
      commits: [{
        comment: `s0 ${changeType} ${workspaceId}`,
        changes: [{
          changeType,
          item: { path: `/${workspaceId}.json` },
          ...(changeType === "delete" ? {} : { newContent: { content: JSON.stringify(workspace), contentType: "rawtext" } }),
        }],
      }],
    });
    return this.ado("POST", `${this.base()}/pushes?${API}`, {
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  async initialize() {
    await this.assertEffectiveTargetApproved();
    this.ensureCleanupManifestNonce();
    this.record("connect");
    if (this.dryRun) {
      this.record("push-run-marker", {
        item: RUN_MARKER_PATH,
        precondition: "oldObjectId=zero-or-verify",
      });
      await this.model.initialize();
      this.initialized = true;
      return { backingPath: "ado", dryRun: true, branch: this.branch };
    }
    const tip = await this.getTip();
    if (tip) await this.verifyRunMarker(tip);
    else await this.createRunMarker();
    this.initialized = true;
    return { backingPath: "ado", dryRun: false, branch: this.branch };
  }

  ensureInitialized() {
    if (!this.initialized) throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    await this.safetyBudget?.recordObjects(1);
    this.record("push", { changeType: "add", item: `${workspace.workspaceId}.json`, precondition: "oldObjectId=tip" });
    if (this.dryRun) return this.model.createWorkspace(workspace);
    const tip = await this.getTip();
    await this.assertAliasesAvailable(workspace, tip);
    const resp = await this.pushChange(workspace.workspaceId, workspace, "add", tip);
    if (!resp.ok) {
      try {
        await this.assertAliasesAvailable(workspace, await this.getTip());
      } catch (error) {
        if (error?.code === "alias_conflict") throw error;
      }
      const text = await resp.text();
      if (/exists|TF401019|already/i.test(text)) throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
      throw new WorkspaceStoreError(`create failed: ${resp.status}`, "provider_error");
    }
    return deepClone(workspace);
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    this.record("read-item", { item: `${workspaceId}.json` });
    if (this.dryRun) return this.model.readWorkspace(workspaceId);
    return this.readAt(workspaceId, this.branch, "branch");
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    this.record("list-items");
    if (this.dryRun) return this.model.resolveAlias(alias);
    const tip = await this.getTip();
    const matches = [];
    for (const id of await this.listWorkspacesAt(tip, "commit")) {
      const workspace = await this.readAt(id, tip, "commit");
      if (workspace.aliases.includes(alias)) matches.push(workspace);
    }
    if (matches.length > 1) {
      throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
    }
    return matches[0] || null;
  }

  async listWorkspacesAt(version, versionType = "branch") {
    const url = `${this.base()}/items?scopePath=/&recursionLevel=OneLevel` +
      `&versionDescriptor.version=${version}&versionDescriptor.versionType=${versionType}&${API}`;
    const resp = await this.ado("GET", url);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`list failed: ${resp.status}`);
    const body = await resp.json();
    return (body.value || [])
      .filter((i) => !i.isFolder && typeof i.path === "string" && i.path.endsWith(".json"))
      .map((i) => i.path.replace(/^\//, "").replace(/\.json$/, ""))
      .sort();
  }

  async listWorkspaces() {
    this.ensureInitialized();
    this.record("list-items");
    if (this.dryRun) return this.model.listWorkspaces();
    return this.listWorkspacesAt(this.branch, "branch");
  }

  async assertAliasesAvailable(workspace, tip) {
    for (const id of await this.listWorkspacesAt(tip, "commit")) {
      if (id === workspace.workspaceId) continue;
      const candidate = await this.readAt(id, tip, "commit");
      const collision = candidate.aliases.find((alias) => workspace.aliases.includes(alias));
      if (collision) {
        throw new WorkspaceStoreError(`Alias collision: ${collision}`, "alias_conflict");
      }
    }
  }

  async compareAndSwap({ workspaceId, expectedGeneration, operation }) {
    this.ensureInitialized();
    if (this.dryRun) {
      this.record("push", { changeType: "edit", item: `${workspaceId}.json`, precondition: "oldObjectId=<tip>" });
      return this.model.compareAndSwap({ workspaceId, expectedGeneration, operation });
    }
    const tip = await this.getTip();
    const current = await this.readAt(workspaceId, tip, "commit");
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    assertReconcilable(current, operation);
    const next = applyWorkspaceOperation(current, operation);
    await this.assertAliasesAvailable(next, tip);
    this.record("push", { changeType: "edit", item: `${workspaceId}.json`, precondition: `oldObjectId=${tip}` });
    const resp = await this.pushChange(workspaceId, next, "edit", tip);
    if (!resp.ok) {
      try {
        await this.assertAliasesAvailable(next, await this.getTip());
      } catch (error) {
        if (error?.code === "alias_conflict") throw error;
      }
      // A non-fast-forward push (the ref moved) is the stale-writer signal.
      let latest = null;
      try { latest = await this.readAt(workspaceId, this.branch, "branch"); } catch { /* fall through */ }
      if (latest && latest.generation !== expectedGeneration) {
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, latest.generation);
      }
      throw new WorkspaceStoreError(`update failed: ${resp.status}`, "provider_error");
    }
    return deepClone(next);
  }

  async backup() {
    this.ensureInitialized();
    this.record("list-items");
    if (this.dryRun) return this.model.backup();
    const ids = await this.listWorkspaces();
    const workspaces = [];
    for (const id of ids) workspaces.push(await this.readAt(id, this.branch, "branch"));
    return { schemaVersion: 1, syntheticData: true, configurationId: this.configurationId, workspaces };
  }

  async restore(snapshot) {
    this.ensureInitialized();
    this.record("push", { changeType: "edit" });
    if (this.dryRun) return this.model.restore(snapshot);
    const validated = validateWorkspaceSnapshot(snapshot);
    const tip = await this.getTip();
    const existing = new Set(await this.listWorkspacesAt(tip, "commit"));
    const changes = validated.workspaces.map((workspace) => {
      return {
        changeType: existing.has(workspace.workspaceId) ? "edit" : "add",
        item: { path: `/${workspace.workspaceId}.json` },
        newContent: { content: JSON.stringify(workspace), contentType: "rawtext" },
      };
    });
    for (const workspaceId of existing) {
      if (!validated.workspaceIds.has(workspaceId)) {
        changes.push({
          changeType: "delete",
          item: { path: `/${workspaceId}.json` },
        });
      }
    }
    if (changes.length === 0) return { workspaceCount: 0 };
    await this.safetyBudget?.recordObjects(changes.length);
    const body = JSON.stringify({
      refUpdates: [{ name: this.refName(), oldObjectId: tip ?? ZERO_OID }],
      commits: [{ comment: "s0 restore", changes }],
    });
    const resp = await this.ado("POST", `${this.base()}/pushes?${API}`, { headers: { "Content-Type": "application/json" }, body });
    if (!resp.ok) throw new WorkspaceStoreError(`restore failed: ${resp.status}`, "provider_error");
    return { workspaceCount: validated.workspaces.length };
  }

  async readGeneration(workspaceId, targetGeneration) {
    this.ensureInitialized();
    this.record("list-commits", { item: `${workspaceId}.json` });
    if (this.dryRun) throw new WorkspaceStoreError("history requires a live repo", "dryrun_no_history");
    const url = `${this.base()}/commits?searchCriteria.itemPath=/${encodeURIComponent(`${workspaceId}.json`)}` +
      `&searchCriteria.itemVersion.version=${this.branch}&searchCriteria.itemVersion.versionType=branch&${API}`;
    const resp = await this.ado("GET", url);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`commits failed: ${resp.status}`);
    const commits = (await resp.json()).value || [];
    for (const commit of commits) {
      try {
        const ws = await this.readAt(workspaceId, commit.commitId, "commit");
        if (ws.generation === targetGeneration) return ws;
      } catch { /* keep scanning */ }
    }
    throw new WorkspaceStoreError(`generation ${targetGeneration} not found in history`, "generation_not_in_history");
  }

  goOffline() { this.offline = true; }

  async stageOffline(request) {
    if (!this.offline) throw new WorkspaceStoreError("stageOffline requires offline mode", "not_offline");
    await this.pendingQueue.append(request);
    return { status: "pending", pendingCount: await this.pendingQueue.count() };
  }

  async reconnect() {
    this.offline = false;
    const applied = [];
    const conflicts = [];
    const retained = [];
    for (;;) {
      const outcome = await this.pendingQueue.processHead(async (entry) => {
        const request = entry.request;
        try {
          const next = await this.compareAndSwap(request);
          return {
            remove: true,
            kind: "applied",
            value: { workspaceId: request.workspaceId, generation: next.generation },
          };
        } catch (error) {
          if (error instanceof WorkspaceConflictError) {
            return {
              remove: false,
              kind: "conflict",
              value: {
                headId: entry.id,
                headGeneration: entry.generation,
                workspaceId: request.workspaceId,
                expected: error.expectedGeneration,
                actual: error.actualGeneration,
              },
            };
          }
          return {
            remove: false,
            kind: "retained",
            value: { workspaceId: request.workspaceId, code: error?.code || "provider_error" },
          };
        }
      });
      if (outcome.empty) break;
      if (outcome.kind === "applied") applied.push(outcome.value);
      if (outcome.kind === "conflict") conflicts.push(outcome.value);
      if (outcome.kind === "retained") retained.push(outcome.value);
      if (outcome.remove !== true) break;
    }
    return { applied, conflicts, retained, pendingCount: await this.pendingQueue.count() };
  }

  async pendingCount() {
    return this.pendingQueue.count();
  }

  async inspectHead() {
    return this.pendingQueue.inspectHead();
  }

  async resolveHead(resolution) {
    return this.pendingQueue.resolveHead(resolution);
  }

  async deleteWorkspace(workspaceId) {
    if (this.dryRun) return { deleted: workspaceId, dryRun: true };
    const tip = await this.getTip();
    if (!tip) return { deleted: workspaceId };
    const resp = await this.pushChange(workspaceId, null, "delete", tip);
    if (!resp.ok && resp.status !== 404) {
      // A missing file is fine; anything else is best-effort during teardown.
      return { deleted: workspaceId, status: resp.status };
    }
    return { deleted: workspaceId };
  }

  // Delete the per-run branch; never touches the default branch.
  cleanupResource() {
    return {
      kind: "ado-ref",
      id: this.refName(),
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      coordinatesHash: cleanupCoordinatesHash("ado", {
        organization: this.org,
        project: this.project,
        repository: this.repo,
      }),
      effectiveTargetHash: this.effectiveTargetHash || "dry-run-unapproved",
      manifestNonce: this.cleanupManifestNonce,
      marker: {
        kind: "ado-git-item",
        id: RUN_MARKER_PATH,
        digest: this.runMarkerDigest(),
      },
    };
  }

  async prepareCleanup({ manifest, resource } = {}) {
    await this.assertEffectiveTargetApproved();
    const expected = { ...this.cleanupResource(), manifestId: this.cleanupManifestId };
    assertCleanupAuthorized(manifest, resource, expected);
    if (this.dryRun) {
      manifest.bindCondition(resource, { expectedObjectId: "<tip>" });
      return resource.condition;
    }
    const tip = await this.getTip();
    if (!tip) {
      manifest.bindCondition(resource, { absent: true });
      return resource.condition;
    }
    const marker = await this.verifyRunMarker(tip);
    manifest.bindCondition(resource, {
      expectedObjectId: tip,
      expectedMarkerPath: marker.path,
      expectedMarkerDigest: marker.digest,
    });
    return resource.condition;
  }

  async cleanup({ manifest, resource } = {}) {
    await this.assertEffectiveTargetApproved();
    const expected = { ...this.cleanupResource(), manifestId: this.cleanupManifestId };
    assertCleanupAuthorized(manifest, resource, expected);
    if (!resource.condition) {
      throw new WorkspaceStoreError("cleanup condition was not prepared", "cleanup_precondition_unavailable");
    }
    const phase = manifest.phase(resource);
    if (this.dryRun) {
      this.record("delete-ref", { ref: this.refName(), precondition: "oldObjectId=<tip>" });
      manifest.markMutating(resource);
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.branch, dryRun: true };
    }
    if (phase === "deleted") {
      if (await this.getTip() !== null) {
        throw new WorkspaceStoreError("cleanup target was recreated after deletion", "cleanup_conflict");
      }
      manifest.markCleaned(resource);
      return { deleted: this.branch, reconciled: true };
    }
    if (resource.condition.absent === true) {
      const current = await this.getTip();
      if (current !== null) {
        throw new WorkspaceStoreError("cleanup target appeared after preparation", "cleanup_conflict");
      }
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.branch, absent: true };
    }
    const tip = await this.getTip();
    if (tip === null && phase === "mutating") {
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.branch, reconciled: true };
    }
    if (tip !== resource.condition.expectedObjectId) {
      throw new WorkspaceStoreError("cleanup target changed concurrently", "cleanup_conflict");
    }
    const marker = await this.verifyRunMarker(tip);
    if (marker.path !== resource.condition.expectedMarkerPath ||
        marker.digest !== resource.condition.expectedMarkerDigest) {
      throw new WorkspaceStoreError(
        "ADO ownership marker changed after cleanup preparation",
        "cleanup_ownership_mismatch",
      );
    }
    manifest.markMutating(resource);
    const body = JSON.stringify([{
      name: this.refName(),
      oldObjectId: resource.condition.expectedObjectId,
      newObjectId: ZERO_OID,
    }]);
    const resp = await this.ado("POST", `${this.base()}/refs?${API}`, { headers: { "Content-Type": "application/json" }, body });
    if (!resp.ok) {
      manifest.markPrepared(resource);
      throw new WorkspaceStoreError(`cleanup failed: ${resp.status}`, "provider_error");
    }
    const outcome = await resp.json();
    const update = Array.isArray(outcome) ? outcome[0] : outcome.value?.[0];
    if (update?.success !== true) {
      manifest.markPrepared(resource);
      throw new WorkspaceStoreError("cleanup target changed concurrently", "cleanup_conflict");
    }
    manifest.markDeleted(resource);
    manifest.markCleaned(resource);
    return { deleted: this.branch };
  }

  providerOperationManifest() {
    return this.operations.map((op) => ({ ...op }));
  }

  liveProviderCallCount() {
    return this.liveProviderCalls;
  }

  providerTelemetry() {
    return this.telemetry.snapshot();
  }

  async close() {
    this.initialized = false;
    if (this.dryRun) try { await this.model.close(); } catch { /* best effort */ }
  }
}
