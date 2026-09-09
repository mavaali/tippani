// OneDrive / SharePoint backing path via Microsoft Graph, behind the common
// IWorkspaceStore contract. Each workspace is one drive item
// `<folder>/tippani-s0/<runId>/<workspaceId>.json`; provider-native ETag
// preconditions give the compare-and-swap:
//   create  - PUT .../content?@microsoft.graph.conflictBehavior=fail
//   update  - PUT .../content with `If-Match: <eTag>`  (412 => stale writer)
//
// Two modes, one code path:
//   dryRun (default) - records the exact Graph request it WOULD issue against a
//                      coherent in-memory model; makes ZERO network calls.
//   live             - issues the requests with a runtime-supplied bearer token.
//
// Host-agnostic: the token, driveId, and base folder are supplied at
// construction/runtime (never hardcoded), so no corporate coordinate or
// credential lives in the repo.

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

const GRAPH = "https://graph.microsoft.com/v1.0";
const RUN_MARKER_NAME = ".tippani-s0-run";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_RETRY_AFTER_MS = 30_000;

function encodePath(p) {
  return p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export class OneDriveGraphStore {
  constructor({
    dryRun = true,
    driveId,
    folderPath,
    runId,
    graphToken,
    getToken,
    configurationId = "CFG-ONEDRIVE",
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
    this.driveId = driveId || process.env.S0_ONEDRIVE_DRIVE_ID || null;
    this.baseFolder = folderPath || process.env.S0_ONEDRIVE_FOLDER || null;
    this.runId = runId || "s0-onedrive";
    this.subfolder = `${this.baseFolder ?? "<folder>"}/tippani-s0/${this.runId}`;
    this._getToken = getToken
      || (graphToken ? async () => graphToken : null)
      || (process.env.S0_ONEDRIVE_TOKEN ? async () => process.env.S0_ONEDRIVE_TOKEN : null);
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
      provider: "onedrive",
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
    this.etags = new Map();
    this._fault = null;
    this.offline = false;
    this.pendingQueue = new PersistentPendingQueue({
      storeRoot,
      provider: "onedrive",
      runId: this.runId,
    });
    this.initialized = false;
  }

  // One-shot fault for the next write. Reads pass through, so the fault lands on
  // the compare-and-swap write regardless of how many reads precede it. Kinds:
  // throttle (429), auth-expiry (401), outage (network throw), lost-response (the
  // write lands but the client never sees the acknowledgement).
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

  runMarkerPath() {
    return `${this.subfolder}/${RUN_MARKER_NAME}`;
  }

  runMarker() {
    return {
      schemaVersion: 1,
      syntheticData: true,
      kind: "tippani-s0-onedrive-run",
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      namespace: `tippani-s0/${this.runId}`,
      effectiveTargetHash: this.effectiveTargetHash || "dry-run-unapproved",
      manifestNonce: this.cleanupManifestNonce,
      driveId: this.driveId,
      folder: this.baseFolder,
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
      provider: "onedrive",
      identity,
      coordinates: { driveId: this.driveId, folder: this.baseFolder },
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
        "Effective OneDrive target is not covered by a structured preflight approval",
        "preflight_required",
      );
    }
    this.credentialBinding.approveIdentity(identity);
  }

  record(op, detail = {}) {
    this.operations.push({ op, backingPath: "onedrive", namespace: `tippani-s0/${this.runId}`, ...detail });
  }

  itemPath(workspaceId) {
    return `${this.subfolder}/${workspaceId}.json`;
  }

  async graph(method, path, { headers = {}, body } = {}) {
    if (this.dryRun) throw new Error("graph() must not be called in dry-run");
    if (!this._getToken) throw new WorkspaceStoreError("No Graph token supplied", "no_token");
    if (!this.driveId || !this.baseFolder) throw new WorkspaceStoreError("driveId and folder are required for a live run", "no_coordinates");
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
          json: async () => ({}),
          text: async () => "throttled",
        }, { method, sent: false });
      }
      if (fault.kind === "auth-expiry") return this.telemetry.wrapResponse({ ok: false, status: 401, json: async () => ({}), text: async () => "unauthorized" }, { method, sent: false });
      if (fault.kind === "permission-loss") return this.telemetry.wrapResponse({ ok: false, status: 403, json: async () => ({}), text: async () => "forbidden" }, { method, sent: false });
      if (fault.kind === "quota") return this.telemetry.wrapResponse({ ok: false, status: 507, json: async () => ({}), text: async () => "quota exceeded" }, { method, sent: false });
      if (fault.kind === "outage") {
        this.telemetry.recordFailure("outage");
        throw new WorkspaceStoreError("network outage (injected)", "provider_unreachable");
      }
      if (fault.kind === "lost-response") {
        const token0 = await this.credentialToken();
        try {
          await this.fetchImpl(`${GRAPH}${path}`, {
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
    const resolvedPath = path.replace(
      `/drives/${this.driveId}/`,
      this.driveId === "me" ? "/me/drive/" : `/drives/${this.driveId}/`,
    );
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
          const resp = await this.fetchImpl(`${GRAPH}${resolvedPath}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, ...headers },
            body,
            signal: this.signal,
          });
          response = await this.telemetry.wrapResponse(resp, { method });
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

  async ensureSubfolder() {
    const parts = `tippani-s0/${this.runId}`.split("/");
    let parent = this.baseFolder;
    for (const [index, part] of parts.entries()) {
      await this.safetyBudget?.recordObjects(1);
      const listUrl = `/drives/${this.driveId}/root:/${encodePath(parent)}:/children`;
      const resp = await this.graph("POST", listUrl, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      });
      if (!resp.ok && resp.status !== 409) {
        throw new WorkspaceStoreError(`ensure-folder ${part} failed: ${resp.status}`, "provider_error");
      }
      parent = `${parent}/${part}`;
      if (index === parts.length - 1) {
        if (resp.status === 409) await this.verifyRunMarker();
        else await this.createRunMarker();
      }
    }
  }

  async createRunMarker() {
    await this.safetyBudget?.recordObjects(1);
    this.record("put-run-marker", {
      item: this.runMarkerPath(),
      precondition: "conflictBehavior=fail",
    });
    const response = await this.graph(
      "PUT",
      `/drives/${this.driveId}/root:/${encodePath(this.runMarkerPath())}:/content?@microsoft.graph.conflictBehavior=fail`,
      {
        headers: { "Content-Type": "application/json" },
        body: this.runMarkerContent(),
      },
    );
    if (response.status === 409) {
      await this.verifyRunMarker();
      return;
    }
    if (!response.ok) {
      throw new WorkspaceStoreError(
        `run ownership marker create failed: ${response.status}`,
        "cleanup_ownership_mismatch",
      );
    }
  }

  async verifyRunMarker() {
    const meta = await this.graph(
      "GET",
      `/drives/${this.driveId}/root:/${encodePath(this.runMarkerPath())}?$select=id,eTag`,
    );
    if (!meta.ok) {
      throw new WorkspaceStoreError(
        "OneDrive run folder lacks the persisted ownership marker",
        "cleanup_ownership_mismatch",
      );
    }
    const { id, eTag } = await meta.json();
    if (!id || !eTag) {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker identity is incomplete",
        "cleanup_ownership_mismatch",
      );
    }
    const content = await this.graph("GET", `/drives/${this.driveId}/items/${id}/content`);
    if (!content.ok) {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker content is unavailable",
        "cleanup_ownership_mismatch",
      );
    }
    let marker;
    try {
      marker = JSON.parse(await content.text());
    } catch {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker content is invalid",
        "cleanup_ownership_mismatch",
      );
    }
    if (JSON.stringify(marker) !== JSON.stringify(this.runMarker())) {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker does not match this approved run",
        "cleanup_ownership_mismatch",
      );
    }
    return { id, eTag, digest: this.runMarkerDigest() };
  }

  async initialize() {
    await this.assertEffectiveTargetApproved();
    this.ensureCleanupManifestNonce();
    this.record("ensure-folder", { path: `${this.baseFolder ?? "<folder>"}/tippani-s0/${this.runId}` });
    if (this.dryRun) {
      this.record("put-run-marker", {
        item: this.runMarkerPath(),
        precondition: "conflictBehavior=fail-or-verify",
      });
      await this.model.initialize();
      this.initialized = true;
      return { backingPath: "onedrive", dryRun: true, subfolder: this.subfolder };
    }
    await this.ensureSubfolder();
    this.initialized = true;
    return { backingPath: "onedrive", dryRun: false, subfolder: this.subfolder };
  }

  ensureInitialized() {
    if (!this.initialized) throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    await this.safetyBudget?.recordObjects(1);
    this.record("put-content", { precondition: "conflictBehavior=fail", item: `${workspace.workspaceId}.json` });
    if (this.dryRun) return this.model.createWorkspace(workspace);

    const url = `/drives/${this.driveId}/root:/${encodePath(this.itemPath(workspace.workspaceId))}:/content?@microsoft.graph.conflictBehavior=fail`;
    const resp = await this.graph("PUT", url, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspace),
    });
    if (resp.status === 409) throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
    if (!resp.ok) throw new WorkspaceStoreError(`create failed: ${resp.status}`, "provider_error");
    const item = await resp.json();
    this.etags.set(workspace.workspaceId, item.eTag);
    return deepClone(workspace);
  }

  async readItem(workspaceId) {
    // Metadata (for the eTag) then content.
    const metaUrl = `/drives/${this.driveId}/root:/${encodePath(this.itemPath(workspaceId))}?$select=id,eTag`;
    const metaResp = await this.graph("GET", metaUrl);
    if (metaResp.status === 404) throw new WorkspaceNotFoundError(workspaceId);
    if (!metaResp.ok) throw new CorruptWorkspaceStoreError(`read meta failed: ${metaResp.status}`);
    const meta = await metaResp.json();
    const contentResp = await this.graph("GET", `/drives/${this.driveId}/items/${meta.id}/content`);
    if (!contentResp.ok) throw new CorruptWorkspaceStoreError(`read content failed: ${contentResp.status}`);
    let workspace;
    try {
      workspace = JSON.parse(await contentResp.text());
    } catch {
      throw new CorruptWorkspaceStoreError(`workspace ${workspaceId} is not valid JSON`);
    }
    this.etags.set(workspaceId, meta.eTag);
    return { workspace: validateWorkspaceRecord(workspace), itemId: meta.id, eTag: meta.eTag };
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    this.record("get-content", { item: `${workspaceId}.json` });
    if (this.dryRun) return this.model.readWorkspace(workspaceId);
    return (await this.readItem(workspaceId)).workspace;
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    this.record("list-children");
    if (this.dryRun) return this.model.resolveAlias(alias);
    const matches = [];
    for (const id of await this.listWorkspaces()) {
      const { workspace } = await this.readItem(id);
      if (workspace.aliases.includes(alias)) matches.push(workspace);
    }
    if (matches.length > 1) {
      throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
    }
    return matches[0] || null;
  }

  async listWorkspaces() {
    this.ensureInitialized();
    this.record("list-children");
    if (this.dryRun) return this.model.listWorkspaces();
    const url = `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}:/children?$select=name`;
    const resp = await this.graph("GET", url);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`list failed: ${resp.status}`);
    const body = await resp.json();
    return (body.value || [])
      .map((i) => i.name)
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -".json".length))
      .sort();
  }

  async compareAndSwap({ workspaceId, expectedGeneration, operation }) {
    this.ensureInitialized();
    if (this.dryRun) {
      this.record("put-content", { precondition: "If-Match:<etag>", item: `${workspaceId}.json` });
      return this.model.compareAndSwap({ workspaceId, expectedGeneration, operation });
    }

    const { workspace: current, itemId, eTag } = await this.readItem(workspaceId);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
    }
    assertReconcilable(current, operation);
    const next = applyWorkspaceOperation(current, operation);
    this.record("put-content", { precondition: `If-Match:${eTag}`, item: `${workspaceId}.json` });
    const resp = await this.graph("PUT", `/drives/${this.driveId}/items/${itemId}/content`, {
      headers: { "Content-Type": "application/json", "If-Match": eTag },
      body: JSON.stringify(next),
    });
    if (!resp.ok) {
      // A precondition/concurrency failure can surface as 412, 409, 423, etc.
      // depending on the backend, so classify by re-reading: if a competing
      // writer advanced the generation, this is a typed stale-writer conflict.
      let latest = null;
      try { latest = (await this.readItem(workspaceId)).workspace; } catch { /* fall through */ }
      if (latest && latest.generation !== expectedGeneration) {
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, latest.generation);
      }
      throw new WorkspaceStoreError(`update failed: ${resp.status}`, "provider_error");
    }
    const item = await resp.json();
    this.etags.set(workspaceId, item.eTag);
    return deepClone(next);
  }

  async backup() {
    this.ensureInitialized();
    this.record("export-history");
    if (this.dryRun) return this.model.backup();
    const ids = await this.listWorkspaces();
    const workspaces = [];
    for (const id of ids) workspaces.push((await this.readItem(id)).workspace);
    return { schemaVersion: 1, syntheticData: true, configurationId: this.configurationId, workspaces };
  }

  async listCleanupChildren() {
    const response = await this.graph(
      "GET",
      `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}:/children?$select=id,name,eTag,folder`,
    );
    if (response.status === 404) return [];
    if (!response.ok) {
      throw new WorkspaceStoreError(
        `cleanup child enumeration failed: ${response.status}`,
        "provider_error",
      );
    }
    const body = await response.json();
    if (body["@odata.nextLink"]) {
      throw new WorkspaceStoreError(
        "cleanup child enumeration is paged and cannot prove completeness",
        "cleanup_precondition_unavailable",
      );
    }
    const children = (body.value || []).map((child) => {
      if (!child?.id || !child?.name || !child?.eTag || child.folder) {
        throw new WorkspaceStoreError(
          "cleanup child identity or precondition is unavailable",
          "cleanup_precondition_unavailable",
        );
      }
      return { id: child.id, name: child.name, eTag: child.eTag };
    });
    return children.sort((left, right) => left.id.localeCompare(right.id));
  }

  async restore(snapshot) {
    this.ensureInitialized();
    this.record("restore-head");
    if (this.dryRun) return this.model.restore(snapshot);
    validateWorkspaceSnapshot(snapshot);
    throw new WorkspaceStoreError(
      "OneDrive item writes cannot atomically replace the complete workspace set",
      "restore_atomicity_unsupported",
    );
  }

  // Delete only this run's subfolder. Used by cleanup; never touches siblings.
  cleanupResource() {
    return {
      kind: "onedrive-folder",
      id: this.subfolder,
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      coordinatesHash: cleanupCoordinatesHash("onedrive", {
        driveId: this.driveId,
        folder: this.baseFolder,
      }),
      effectiveTargetHash: this.effectiveTargetHash || "dry-run-unapproved",
      manifestNonce: this.cleanupManifestNonce,
      marker: {
        kind: "onedrive-item",
        id: this.runMarkerPath(),
        digest: this.runMarkerDigest(),
      },
    };
  }

  async prepareCleanup({ manifest, resource } = {}) {
    await this.assertEffectiveTargetApproved();
    const expected = { ...this.cleanupResource(), manifestId: this.cleanupManifestId };
    assertCleanupAuthorized(manifest, resource, expected);
    if (this.dryRun) {
      manifest.bindCondition(resource, {
        expectedItemId: "<folder-id>",
        expectedChildren: [{
          id: "<child-id>",
          name: "<manifest-enumerated-child>",
          eTag: "<child-etag>",
        }],
      });
      return resource.condition;
    }
    const meta = await this.graph(
      "GET",
      `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}?$select=id,eTag`,
    );
    if (meta.status === 404) {
      manifest.bindCondition(resource, { absent: true });
      return resource.condition;
    }
    if (!meta.ok) throw new WorkspaceStoreError(`cleanup lookup failed: ${meta.status}`, "provider_error");
    const { id, eTag } = await meta.json();
    if (!id || !eTag) {
      throw new WorkspaceStoreError("cleanup precondition unavailable", "cleanup_precondition_unavailable");
    }
    const marker = await this.verifyRunMarker();
    const children = await this.listCleanupChildren();
    const markerChild = children.find((child) => child.id === marker.id);
    if (!markerChild || markerChild.eTag !== marker.eTag) {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker is absent from the cleanup child manifest",
        "cleanup_ownership_mismatch",
      );
    }
    manifest.bindCondition(resource, {
      expectedItemId: id,
      expectedMarkerItemId: marker.id,
      expectedMarkerDigest: marker.digest,
      expectedChildren: children,
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
      this.record("delete-manifest-enumerated-children", {
        path: this.subfolder,
        precondition: "If-Match:<child-etag>",
      });
      this.record("delete-folder", {
        path: this.subfolder,
        precondition: "only-after-proving-empty; live transport fails closed",
      });
      manifest.markMutating(resource);
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.subfolder, dryRun: true };
    }
    if (phase === "deleted") {
      const current = await this.graph(
        "GET",
        `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}?$select=id,eTag`,
      );
      if (current.status !== 404) {
        if (!current.ok) {
          throw new WorkspaceStoreError(`cleanup lookup failed: ${current.status}`, "provider_error");
        }
        throw new WorkspaceStoreError("cleanup target was recreated after deletion", "cleanup_conflict");
      }
      manifest.markCleaned(resource);
      return { deleted: this.subfolder, reconciled: true };
    }
    if (resource.condition.absent === true) {
      const current = await this.graph(
        "GET",
        `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}?$select=id,eTag`,
      );
      if (current.status !== 404) {
        if (!current.ok) {
          throw new WorkspaceStoreError(`cleanup lookup failed: ${current.status}`, "provider_error");
        }
        throw new WorkspaceStoreError("cleanup target appeared after preparation", "cleanup_conflict");
      }
      manifest.markDeleted(resource);
      manifest.markCleaned(resource);
      return { deleted: this.subfolder, absent: true };
    }
    const meta = await this.graph(
      "GET",
      `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}?$select=id,eTag`,
    );
    if (meta.status === 404) {
      if (phase === "mutating") {
        manifest.markDeleted(resource);
        manifest.markCleaned(resource);
        return { deleted: this.subfolder, reconciled: true };
      }
      throw new WorkspaceStoreError("cleanup target disappeared", "cleanup_conflict");
    }
    if (!meta.ok) throw new WorkspaceStoreError(`cleanup lookup failed: ${meta.status}`, "provider_error");
    const { id } = await meta.json();
    if (id !== resource.condition.expectedItemId ||
        !Array.isArray(resource.condition.expectedChildren)) {
      throw new WorkspaceStoreError("cleanup target identity changed concurrently", "cleanup_conflict");
    }
    const currentChildren = await this.listCleanupChildren();
    if (JSON.stringify(currentChildren) !==
        JSON.stringify(resource.condition.expectedChildren)) {
      throw new WorkspaceStoreError("cleanup children changed concurrently", "cleanup_conflict");
    }
    const marker = await this.verifyRunMarker();
    if (marker.id !== resource.condition.expectedMarkerItemId ||
        marker.digest !== resource.condition.expectedMarkerDigest) {
      throw new WorkspaceStoreError(
        "OneDrive ownership marker changed after cleanup preparation",
        "cleanup_ownership_mismatch",
      );
    }
    manifest.markMutating(resource);
    for (const child of resource.condition.expectedChildren) {
      const response = await this.graph("DELETE", `/drives/${this.driveId}/items/${child.id}`, {
        headers: { "If-Match": child.eTag },
      });
      if (response.status === 412) {
        throw new WorkspaceStoreError(
          `cleanup child changed concurrently: ${child.name}`,
          "cleanup_conflict",
        );
      }
      if (response.status === 404) {
        throw new WorkspaceStoreError(
          `cleanup child disappeared concurrently: ${child.name}`,
          "cleanup_conflict",
        );
      }
      if (!response.ok) {
        throw new WorkspaceStoreError(
          `cleanup child failed: ${child.name} (${response.status})`,
          "provider_error",
        );
      }
    }
    const remaining = await this.listCleanupChildren();
    if (remaining.length > 0) {
      throw new WorkspaceStoreError(
        "cleanup child appeared during deletion",
        "cleanup_conflict",
      );
    }
    throw new WorkspaceStoreError(
      "OneDrive cannot condition recursive folder deletion on the folder remaining empty",
      "cleanup_precondition_unavailable",
    );
  }

  async deleteWorkspace(workspaceId) {
    if (this.dryRun) { await this.model.close?.(); return { deleted: workspaceId, dryRun: true }; }
    const url = `/drives/${this.driveId}/root:/${encodePath(this.itemPath(workspaceId))}`;
    const resp = await this.graph("DELETE", url);
    if (!resp.ok && resp.status !== 404) {
      throw new WorkspaceStoreError(`delete ${workspaceId} failed: ${resp.status}`, "provider_error");
    }
    return { deleted: workspaceId };
  }

  // Recover an earlier generation from the drive item's own version history.
  async readGeneration(workspaceId, targetGeneration) {
    this.ensureInitialized();
    this.record("list-versions", { item: `${workspaceId}.json` });
    if (this.dryRun) throw new WorkspaceStoreError("version history requires a live drive", "dryrun_no_versions");
    const metaUrl = `/drives/${this.driveId}/root:/${encodePath(this.itemPath(workspaceId))}?$select=id`;
    const metaResp = await this.graph("GET", metaUrl);
    if (metaResp.status === 404) throw new WorkspaceNotFoundError(workspaceId);
    const { id: itemId } = await metaResp.json();
    const versResp = await this.graph("GET", `/drives/${this.driveId}/items/${itemId}/versions`);
    if (!versResp.ok) throw new CorruptWorkspaceStoreError(`versions failed: ${versResp.status}`);
    const versions = (await versResp.json()).value || [];
    for (const v of versions) {
      let contentResp;
      try {
        contentResp = await this.graph("GET", `/drives/${this.driveId}/items/${itemId}/versions/${v.id}/content`);
      } catch {
        continue;
      }
      if (!contentResp.ok) continue;
      let ws;
      try { ws = JSON.parse(await contentResp.text()); } catch { continue; }
      if (ws?.generation === targetGeneration) return validateWorkspaceRecord(ws);
    }
    throw new WorkspaceStoreError(`generation ${targetGeneration} not found in history`, "generation_not_in_history");
  }

  // Offline authoring: a staged write is pending until reconnect confirms it via
  // CAS. It is never labelled shared and never silently overwrites newer state.
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
