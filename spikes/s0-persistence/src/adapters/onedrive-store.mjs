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

import {
  CorruptWorkspaceStoreError,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WorkspaceStoreError,
  applyWorkspaceOperation,
  assertReconcilable,
  deepClone,
  validateWorkspaceRecord,
} from "../workspace-contract.mjs";
import { ReferenceMemoryWorkspaceStore } from "./reference-memory-store.mjs";

const GRAPH = "https://graph.microsoft.com/v1.0";

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
    this.operations = [];
    this.liveProviderCalls = 0;
    this.model = new ReferenceMemoryWorkspaceStore({ configurationId });
    this.etags = new Map();
    this._fault = null;
    this.offline = false;
    this.pending = [];
    this.initialized = false;
  }

  // One-shot fault for the next write. Reads pass through, so the fault lands on
  // the compare-and-swap write regardless of how many reads precede it. Kinds:
  // throttle (429), auth-expiry (401), outage (network throw), lost-response (the
  // write lands but the client never sees the acknowledgement).
  injectFault(kind) {
    this._fault = { kind };
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
    this.liveProviderCalls++;
    const fault = this._fault;
    if (fault && method !== "GET") {
      this._fault = null;
      if (fault.kind === "throttle") return { ok: false, status: 429, json: async () => ({}), text: async () => "throttled" };
      if (fault.kind === "auth-expiry") return { ok: false, status: 401, json: async () => ({}), text: async () => "unauthorized" };
      if (fault.kind === "outage") throw new WorkspaceStoreError("network outage (injected)", "provider_unreachable");
      if (fault.kind === "lost-response") {
        const token0 = await this._getToken();
        await this.fetchImpl(`${GRAPH}${path}`, { method, headers: { Authorization: `Bearer ${token0}`, ...headers }, body });
        throw new WorkspaceStoreError("response lost (injected)", "provider_response_lost");
      }
    }
    const token = await this._getToken();
    const resp = await this.fetchImpl(`${GRAPH}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...headers },
      body,
    });
    return resp;
  }

  async ensureSubfolder() {
    // Idempotent create of the per-run subfolder chain under the base folder.
    const parts = `tippani-s0/${this.runId}`.split("/");
    let parent = this.baseFolder;
    for (const part of parts) {
      const listUrl = `/drives/${this.driveId}/root:/${encodePath(parent)}:/children`;
      const resp = await this.graph("POST", listUrl, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
      });
      if (!resp.ok && resp.status !== 409) {
        throw new WorkspaceStoreError(`ensure-folder ${part} failed: ${resp.status}`, "provider_error");
      }
      parent = `${parent}/${part}`;
    }
  }

  async initialize() {
    this.record("ensure-folder", { path: `${this.baseFolder ?? "<folder>"}/tippani-s0/${this.runId}` });
    if (this.dryRun) {
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
    for (const id of await this.listWorkspaces()) {
      const { workspace } = await this.readItem(id);
      if (workspace.aliases.includes(alias)) return workspace;
    }
    return null;
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

  async restore(snapshot) {
    this.ensureInitialized();
    this.record("restore-head");
    if (this.dryRun) return this.model.restore(snapshot);
    if (snapshot?.schemaVersion !== 1 || snapshot?.syntheticData !== true || !Array.isArray(snapshot?.workspaces)) {
      throw new CorruptWorkspaceStoreError("Backup is invalid");
    }
    for (const workspace of snapshot.workspaces) {
      validateWorkspaceRecord(workspace);
      const url = `/drives/${this.driveId}/root:/${encodePath(this.itemPath(workspace.workspaceId))}:/content?@microsoft.graph.conflictBehavior=replace`;
      const resp = await this.graph("PUT", url, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      if (!resp.ok) throw new WorkspaceStoreError(`restore ${workspace.workspaceId} failed: ${resp.status}`, "provider_error");
    }
    return { workspaceCount: snapshot.workspaces.length };
  }

  // Delete only this run's subfolder. Used by cleanup; never touches siblings.
  async cleanup() {
    if (this.dryRun) {
      this.record("delete-folder", { path: this.subfolder });
      return { deleted: this.subfolder, dryRun: true };
    }
    const url = `/drives/${this.driveId}/root:/${encodePath(this.subfolder)}`;
    const resp = await this.graph("DELETE", url);
    if (!resp.ok && resp.status !== 404) {
      throw new WorkspaceStoreError(`cleanup failed: ${resp.status}`, "provider_error");
    }
    // Remove the shared tippani-s0 namespace folder too, but only if this was
    // the last run left in it (never disturbs a concurrent run's subfolder).
    try {
      const nsPath = `${this.baseFolder}/tippani-s0`;
      const list = await this.graph("GET", `/drives/${this.driveId}/root:/${encodePath(nsPath)}:/children?$select=name`);
      if (list.ok && ((await list.json()).value || []).length === 0) {
        await this.graph("DELETE", `/drives/${this.driveId}/root:/${encodePath(nsPath)}`);
      }
    } catch { /* best effort */ }
    return { deleted: this.subfolder };
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
      const contentResp = await this.graph("GET", `/drives/${this.driveId}/items/${itemId}/versions/${v.id}/content`);
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

  stageOffline(request) {
    if (!this.offline) throw new WorkspaceStoreError("stageOffline requires offline mode", "not_offline");
    this.pending.push(request);
    return { status: "pending", pendingCount: this.pending.length };
  }

  async reconnect() {
    this.offline = false;
    const applied = [];
    const conflicts = [];
    const queued = this.pending;
    this.pending = [];
    for (const request of queued) {
      try {
        const next = await this.compareAndSwap(request);
        applied.push({ workspaceId: request.workspaceId, generation: next.generation });
      } catch (error) {
        if (error instanceof WorkspaceConflictError) {
          conflicts.push({ workspaceId: request.workspaceId, expected: error.expectedGeneration, actual: error.actualGeneration });
        } else {
          throw error;
        }
      }
    }
    return { applied, conflicts };
  }

  providerOperationManifest() {
    return this.operations.map((op) => ({ ...op }));
  }

  liveProviderCallCount() {
    return this.liveProviderCalls;
  }

  async close() {
    this.initialized = false;
    if (this.dryRun) try { await this.model.close(); } catch { /* best effort */ }
  }
}
