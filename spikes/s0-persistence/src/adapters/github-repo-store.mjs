// GitHub backing path via the GitHub REST API, behind the common IWorkspaceStore
// contract. Each workspace is a file `<workspaceId>.json` on a per-run branch
// `tippani-s0/<runId>`; the file's blob `sha` is the CAS token.
//
// CAS is provider-native: an update PUTs the contents with the `sha` we read. If
// a competing writer changed the file, GitHub rejects the update (409) and we
// surface a typed stale-writer conflict. The default branch is never touched.
//
// Two modes on one code path, mirroring the other provider transports:
//   dryRun (default) - records the intended GitHub operations against an
//                      in-memory model; zero network calls.
//   live             - issues GitHub REST calls with a runtime-supplied token.
//
// Host-agnostic: owner, repo, and token come from the environment.

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

const API = "https://api.github.com";
const RUN_MARKER_PATH = ".tippani-s0-run";

function b64encode(text) { return Buffer.from(text, "utf8").toString("base64"); }
function b64decode(text) { return Buffer.from(text, "base64").toString("utf8"); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRYABLE_NETWORK_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);
const MAX_RETRY_AFTER_MS = 30_000;

export class GitHubRepoStore {
  constructor({
    dryRun = true,
    owner,
    repo,
    runId,
    githubToken,
    getToken,
    configurationId = "CFG-GITHUB",
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
    this.owner = owner || process.env.S0_GITHUB_OWNER || null;
    this.repo = repo || process.env.S0_GITHUB_REPO || null;
    this.runId = runId || "s0-github";
    this.branch = `tippani-s0/${this.runId}`;
    this._getToken = getToken
      || (githubToken ? async () => githubToken : null)
      || (process.env.S0_GITHUB_TOKEN ? async () => process.env.S0_GITHUB_TOKEN : null);
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
      provider: "github",
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
    this.shas = new Map();
    this._fault = null;
    this._maxGen = new Map(); // highest generation observed/written per workspace
    this.offline = false;
    this.pendingQueue = new PersistentPendingQueue({
      storeRoot,
      provider: "github",
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
      provider: "github",
      identity,
      coordinates: { owner: this.owner, repository: this.repo },
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
        "Effective GitHub target is not covered by a structured preflight approval",
        "preflight_required",
      );
    }
    this.credentialBinding.approveIdentity(identity);
  }

  record(op, detail = {}) {
    this.operations.push({ op, backingPath: "github", namespace: `tippani-s0/${this.runId}`, ...detail });
  }

  repoBase() {
    return `${API}/repos/${this.owner}/${this.repo}`;
  }

  runMarker(baseSha) {
    return {
      schemaVersion: 1,
      syntheticData: true,
      kind: "tippani-s0-github-run",
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      namespace: `tippani-s0/${this.runId}`,
      branch: `refs/heads/${this.branch}`,
      owner: this.owner,
      repository: this.repo,
      baseSha,
      effectiveTargetHash: this.effectiveTargetHash,
      cleanupManifestId: this.cleanupManifestId,
      manifestNonce: this.cleanupManifestNonce,
    };
  }

  runMarkerContent(baseSha) {
    return JSON.stringify(this.runMarker(baseSha));
  }

  runMarkerBlobSha(baseSha) {
    const content = this.runMarkerContent(baseSha);
    return crypto.createHash("sha1")
      .update(`blob ${Buffer.byteLength(content)}\0${content}`)
      .digest("hex");
  }

  async createRunMarker(baseSha) {
    await this.safetyBudget?.recordObjects(1);
    this.record("put-run-marker", {
      item: RUN_MARKER_PATH,
      precondition: "create-only",
    });
    const response = await this.gh("PUT", `${this.repoBase()}/contents/${RUN_MARKER_PATH}`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `s0 claim ${this.runId}`,
        content: b64encode(this.runMarkerContent(baseSha)),
        branch: this.branch,
      }),
    });
    if (!response.ok) {
      throw new WorkspaceStoreError(
        `run ownership marker create failed: ${response.status}`,
        "branch_ownership_conflict",
      );
    }
  }

  async verifyRunMarker() {
    const refResponse = await this.gh(
      "GET",
      `${this.repoBase()}/git/ref/heads/${this.branch}`,
    );
    if (!refResponse.ok) {
      throw new WorkspaceStoreError(
        `existing run branch lookup failed: ${refResponse.status}`,
        "branch_ownership_conflict",
      );
    }
    const tip = (await refResponse.json())?.object?.sha;
    if (!tip) {
      throw new WorkspaceStoreError(
        "existing run branch has no immutable tip",
        "branch_ownership_conflict",
      );
    }
    const markerResponse = await this.gh(
      "GET",
      `${this.repoBase()}/contents/${RUN_MARKER_PATH}?ref=${encodeURIComponent(tip)}`,
    );
    if (!markerResponse.ok) {
      throw new WorkspaceStoreError(
        "existing run branch lacks the approved ownership marker",
        "branch_ownership_conflict",
      );
    }
    const body = await markerResponse.json();
    let marker;
    try {
      marker = JSON.parse(b64decode(body.content));
    } catch {
      throw new WorkspaceStoreError(
        "existing run branch ownership marker is invalid",
        "branch_ownership_conflict",
      );
    }
    if (typeof marker.baseSha !== "string" || !marker.baseSha) {
      throw new WorkspaceStoreError(
        "existing run branch ownership marker has no creation base",
        "branch_ownership_conflict",
      );
    }
    const expected = this.runMarker(marker.baseSha);
    if (JSON.stringify(marker) !== JSON.stringify(expected) ||
        (body.sha && body.sha !== this.runMarkerBlobSha(marker.baseSha))) {
      throw new WorkspaceStoreError(
        "existing run branch is not owned by this approved run",
        "branch_ownership_conflict",
      );
    }
  }

  async gh(method, url, { headers = {}, body } = {}) {
    if (this.dryRun) throw new Error("gh() must not be called in dry-run");
    if (!this._getToken) throw new WorkspaceStoreError("No GitHub token supplied", "no_token");
    if (!this.owner || !this.repo) throw new WorkspaceStoreError("owner/repo required for a live run", "no_coordinates");
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
            headers: this.headers(token0, headers),
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
            headers: this.headers(token, headers),
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
        const retryable = method === "GET" && attempt < 2 &&
          (error instanceof TypeError || RETRYABLE_NETWORK_CODES.has(error?.code) ||
            RETRYABLE_NETWORK_CODES.has(error?.cause?.code));
        if (!retryable) throw error;
        const delayMs = 250 * (attempt + 1);
        this.telemetry.recordRetry();
        this.telemetry.recordBackoff(delayMs);
        await sleep(delayMs);
      }
    }
  }

  headers(token, extra) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "tippani-s0",
      ...extra,
    };
  }

  async initialize() {
    await this.assertEffectiveTargetApproved();
    this.ensureCleanupManifestNonce();
    this.record("connect");
    if (this.dryRun) {
      this.record("put-run-marker", {
        item: RUN_MARKER_PATH,
        precondition: "create-only-or-verify",
      });
      await this.model.initialize();
      this.initialized = true;
      return { backingPath: "github", dryRun: true, branch: this.branch };
    }
    // Create the per-run branch off the default branch; the default is untouched.
    const repoResp = await this.gh("GET", this.repoBase());
    if (!repoResp.ok) throw new WorkspaceStoreError(`repo lookup failed: ${repoResp.status}`, "provider_error");
    const defaultBranch = (await repoResp.json()).default_branch;
    const refResp = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${defaultBranch}`);
    if (!refResp.ok) throw new WorkspaceStoreError(`default ref lookup failed: ${refResp.status}`, "provider_error");
    const baseSha = (await refResp.json()).object.sha;
    await this.safetyBudget?.recordObjects(1);
    const createResp = await this.gh("POST", `${this.repoBase()}/git/refs`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: baseSha }),
    });
    if (createResp.status === 422) {
      await this.verifyRunMarker();
    } else if (!createResp.ok) {
      throw new WorkspaceStoreError(`branch create failed: ${createResp.status}`, "provider_error");
    } else {
      await this.createRunMarker(baseSha);
    }
    this.initialized = true;
    return { backingPath: "github", dryRun: false, branch: this.branch };
  }

  ensureInitialized() {
    if (!this.initialized) throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    await this.safetyBudget?.recordObjects(1);
    this.record("put-contents", { changeType: "create", item: `${workspace.workspaceId}.json` });
    if (this.dryRun) return this.model.createWorkspace(workspace);
    const resp = await this.gh("PUT", `${this.repoBase()}/contents/${workspace.workspaceId}.json`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `s0 create ${workspace.workspaceId}`, content: b64encode(JSON.stringify(workspace)), branch: this.branch }),
    });
    if (resp.status === 422) throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
    if (!resp.ok) throw new WorkspaceStoreError(`create failed: ${resp.status}`, "provider_error");
    this.shas.set(workspace.workspaceId, (await resp.json()).content.sha);
    this._noteGen(workspace.workspaceId, workspace.generation);
    return deepClone(workspace);
  }

  // The branch tip commit sha, resolved via the strongly-consistent git-refs
  // API. The Contents API can serve a stale blob for a few seconds after a
  // write when read by mutable branch name; reading the immutable commit sha
  // instead reflects a committed generation deterministically.
  async tipSha() {
    const resp = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${this.branch}`);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`branch ref resolve failed: ${resp.status}`);
    return (await resp.json()).object.sha;
  }

  _noteGen(workspaceId, generation) {
    const seen = this._maxGen.get(workspaceId) ?? -1;
    if (generation > seen) this._maxGen.set(workspaceId, generation);
  }

  // A read that never observes a generation lower than one this store has
  // already seen or written. GitHub's ref/contents endpoints can lag briefly
  // after a write, so a read below the required floor can only be replication
  // lag - retry (bounded). Genuine advances by other writers are >= the floor
  // and returned immediately.
  async _consistentRead(workspaceId, minGeneration = 0) {
    const floor = Math.max(minGeneration, this._maxGen.get(workspaceId) ?? 0);
    let last = null;
    for (let i = 0; i < 12; i++) {
      try {
        const res = await this.readItem(workspaceId);
        if (res.workspace.generation >= floor) return res;
        last = res;
      } catch (error) {
        if (!(error instanceof WorkspaceNotFoundError)) throw error;
        last = error;
      }
      this.telemetry.recordRetry();
      await sleep(150);
    }
    if (last instanceof Error) throw last;
    return last; // best effort: below the floor after retries (e.g. an intentional restore rewind)
  }

  async readItem(workspaceId, ref = this.branch) {
    const pin = ref === this.branch ? await this.tipSha() : ref;
    const resp = await this.gh("GET", `${this.repoBase()}/contents/${workspaceId}.json?ref=${encodeURIComponent(pin)}`);
    if (resp.status === 404) throw new WorkspaceNotFoundError(workspaceId);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`read failed: ${resp.status}`);
    const body = await resp.json();
    let ws;
    try { ws = JSON.parse(b64decode(body.content)); } catch { throw new CorruptWorkspaceStoreError(`workspace ${workspaceId} is not valid JSON`); }
    this.shas.set(workspaceId, body.sha);
    const record = validateWorkspaceRecord(ws);
    if (ref === this.branch) this._noteGen(workspaceId, record.generation);
    return { workspace: record, sha: body.sha };
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    this.record("get-contents", { item: `${workspaceId}.json` });
    if (this.dryRun) return this.model.readWorkspace(workspaceId);
    return (await this._consistentRead(workspaceId)).workspace;
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    this.record("list-contents");
    if (this.dryRun) return this.model.resolveAlias(alias);
    const tip = await this.tipSha();
    const matches = [];
    for (const id of await this.listWorkspacesAt(tip)) {
      const { workspace } = await this.readItem(id, tip);
      if (workspace.aliases.includes(alias)) matches.push(workspace);
    }
    if (matches.length > 1) {
      throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
    }
    return matches[0] || null;
  }

  async listWorkspacesAt(ref) {
    const resp = await this.gh("GET", `${this.repoBase()}/contents/?ref=${encodeURIComponent(ref)}`);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`list failed: ${resp.status}`);
    const body = await resp.json();
    return (Array.isArray(body) ? body : [])
      .filter((i) => i.type === "file" && i.name.endsWith(".json"))
      .map((i) => i.name.replace(/\.json$/, ""))
      .sort();
  }

  async listWorkspaces() {
    this.ensureInitialized();
    this.record("list-contents");
    if (this.dryRun) return this.model.listWorkspaces();
    return this.listWorkspacesAt(await this.tipSha());
  }

  async compareAndSwap({ workspaceId, expectedGeneration, operation }) {
    this.ensureInitialized();
    if (this.dryRun) {
      this.record("put-contents", { changeType: "update", item: `${workspaceId}.json`, precondition: "sha=<blob>" });
      return this.model.compareAndSwap({ workspaceId, expectedGeneration, operation });
    }
    const { workspace: current, sha } = await this._consistentRead(workspaceId, expectedGeneration);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    assertReconcilable(current, operation);
    const next = applyWorkspaceOperation(current, operation);
    this.record("put-contents", { changeType: "update", item: `${workspaceId}.json`, precondition: `sha=${sha}` });
    let resp;
    try {
      resp = await this.gh("PUT", `${this.repoBase()}/contents/${workspaceId}.json`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `s0 update ${workspaceId}`, content: b64encode(JSON.stringify(next)), branch: this.branch, sha }),
      });
    } catch (error) {
      // A lost response means the write may have landed; record its durability
      // so a follow-up read waits for the advanced generation.
      if (error && error.code === "indeterminate_write") this._noteGen(workspaceId, next.generation);
      throw error;
    }
    if (!resp.ok) {
      // A blob-sha precondition failure (409) proves the tip advanced past our
      // read: another writer won. Re-read past our expectation and surface a
      // typed conflict with the true generation.
      if (resp.status === 409) {
        const latest = await this._consistentRead(workspaceId, expectedGeneration + 1);
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, latest.workspace.generation);
      }
      let latest = null;
      try { latest = (await this.readItem(workspaceId)).workspace; } catch { /* fall through */ }
      if (latest && latest.generation !== expectedGeneration) {
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, latest.generation);
      }
      throw new WorkspaceStoreError(`update failed: ${resp.status}`, "provider_error");
    }
    this.shas.set(workspaceId, (await resp.json()).content.sha);
    this._noteGen(workspaceId, next.generation);
    return deepClone(next);
  }

  async backup() {
    this.ensureInitialized();
    this.record("list-contents");
    if (this.dryRun) return this.model.backup();
    const tip = await this.tipSha();
    const ids = await this.listWorkspacesAt(tip);
    const workspaces = [];
    for (const id of ids) workspaces.push((await this.readItem(id, tip)).workspace);
    return { schemaVersion: 1, syntheticData: true, configurationId: this.configurationId, workspaces };
  }

  async restore(snapshot) {
    this.ensureInitialized();
    this.record("put-contents", { changeType: "restore" });
    if (this.dryRun) return this.model.restore(snapshot);
    validateWorkspaceSnapshot(snapshot);
    throw new WorkspaceStoreError(
      "GitHub Contents API writes cannot atomically replace the complete workspace set",
      "restore_atomicity_unsupported",
    );
  }

  async readGeneration(workspaceId, targetGeneration) {
    this.ensureInitialized();
    this.record("list-commits", { item: `${workspaceId}.json` });
    if (this.dryRun) throw new WorkspaceStoreError("history requires a live repo", "dryrun_no_history");
    const resp = await this.gh("GET", `${this.repoBase()}/commits?path=${encodeURIComponent(`${workspaceId}.json`)}&sha=${encodeURIComponent(this.branch)}`);
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`commits failed: ${resp.status}`);
    const commits = await resp.json();
    for (const commit of commits) {
      try {
        const { workspace } = await this.readItem(workspaceId, commit.sha);
        if (workspace.generation === targetGeneration) return workspace;
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
    let sha = this.shas.get(workspaceId);
    if (!sha) { try { sha = (await this.readItem(workspaceId)).sha; } catch { return { deleted: workspaceId }; } }
    const resp = await this.gh("DELETE", `${this.repoBase()}/contents/${workspaceId}.json`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: `s0 delete ${workspaceId}`, branch: this.branch, sha }),
    });
    return { deleted: workspaceId, status: resp.status };
  }

  // Delete the per-run branch; never touches the default branch.
  cleanupResource() {
    return {
      kind: "github-ref",
      id: `refs/heads/${this.branch}`,
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      coordinatesHash: cleanupCoordinatesHash("github", {
        owner: this.owner,
        repository: this.repo,
      }),
      effectiveTargetHash: this.effectiveTargetHash || "dry-run-unapproved",
      manifestNonce: this.cleanupManifestNonce,
    };
  }

  async prepareCleanup({ manifest, resource } = {}) {
    await this.assertEffectiveTargetApproved();
    const expected = { ...this.cleanupResource(), manifestId: this.cleanupManifestId };
    assertCleanupAuthorized(manifest, resource, expected);
    if (this.dryRun) {
      manifest.bindCondition(resource, { expectedSha: "<ref-sha>" });
      return resource.condition;
    }
    const lookup = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${this.branch}`);
    if (lookup.status === 404) {
      manifest.bindCondition(resource, { absent: true });
      return resource.condition;
    }
    if (!lookup.ok) throw new WorkspaceStoreError(`cleanup lookup failed: ${lookup.status}`, "provider_error");
    const expectedSha = (await lookup.json())?.object?.sha;
    if (!expectedSha) {
      throw new WorkspaceStoreError("cleanup precondition unavailable", "cleanup_precondition_unavailable");
    }
    manifest.bindCondition(resource, { expectedSha });
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
    if (phase === "deleted") {
      if (!this.dryRun) {
        const current = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${this.branch}`);
        if (current.status !== 404) {
          if (!current.ok) {
            throw new WorkspaceStoreError(`cleanup lookup failed: ${current.status}`, "provider_error");
          }
          throw new WorkspaceStoreError("cleanup target was recreated after deletion", "cleanup_conflict");
        }
      }
      manifest.markCleaned(resource);
      return { deleted: this.branch, reconciled: true };
    }
    if (resource.condition.absent === true) {
      if (this.dryRun) {
        manifest.markDeleted(resource);
        manifest.markCleaned(resource);
        return { deleted: this.branch, absent: true, dryRun: true };
      }
      const current = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${this.branch}`);
      if (current.status !== 404) {
        if (!current.ok) {
          throw new WorkspaceStoreError(`cleanup lookup failed: ${current.status}`, "provider_error");
        }
        throw new WorkspaceStoreError("cleanup target appeared after preparation", "cleanup_conflict");
      }
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.branch, absent: true };
    }
    this.record("cleanup-unsupported", {
      ref: `refs/heads/${this.branch}`,
      reason: "GitHub REST ref deletion has no expected-SHA precondition",
    });
    throw new WorkspaceStoreError(
      "GitHub REST cleanup is unsupported without an atomic expected-SHA ref delete",
      "cleanup_unsupported",
    );
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
