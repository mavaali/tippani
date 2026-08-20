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

const API = "https://api.github.com";

function b64encode(text) { return Buffer.from(text, "utf8").toString("base64"); }
function b64decode(text) { return Buffer.from(text, "base64").toString("utf8"); }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    this.operations = [];
    this.liveProviderCalls = 0;
    this.model = new ReferenceMemoryWorkspaceStore({ configurationId });
    this.shas = new Map();
    this._fault = null;
    this._maxGen = new Map(); // highest generation observed/written per workspace
    this.offline = false;
    this.pending = [];
    this.initialized = false;
  }

  injectFault(kind) {
    this._fault = { kind };
  }

  record(op, detail = {}) {
    this.operations.push({ op, backingPath: "github", namespace: `tippani-s0/${this.runId}`, ...detail });
  }

  repoBase() {
    return `${API}/repos/${this.owner}/${this.repo}`;
  }

  async gh(method, url, { headers = {}, body } = {}) {
    if (this.dryRun) throw new Error("gh() must not be called in dry-run");
    if (!this._getToken) throw new WorkspaceStoreError("No GitHub token supplied", "no_token");
    if (!this.owner || !this.repo) throw new WorkspaceStoreError("owner/repo required for a live run", "no_coordinates");
    this.liveProviderCalls++;
    const fault = this._fault;
    if (fault && method !== "GET") {
      this._fault = null;
      if (fault.kind === "throttle") return { ok: false, status: 429, text: async () => "throttled", json: async () => ({}) };
      if (fault.kind === "auth-expiry") return { ok: false, status: 401, text: async () => "unauthorized", json: async () => ({}) };
      if (fault.kind === "outage") throw new WorkspaceStoreError("network outage (injected)", "provider_unreachable");
      if (fault.kind === "lost-response") {
        const token0 = await this._getToken();
        await this.fetchImpl(url, { method, headers: this.headers(token0, headers), body });
        throw new WorkspaceStoreError("response lost (injected)", "provider_response_lost");
      }
    }
    const token = await this._getToken();
    return this.fetchImpl(url, { method, headers: this.headers(token, headers), body });
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
    this.record("connect");
    if (this.dryRun) { await this.model.initialize(); this.initialized = true; return { backingPath: "github", dryRun: true, branch: this.branch }; }
    // Create the per-run branch off the default branch; the default is untouched.
    const repoResp = await this.gh("GET", this.repoBase());
    if (!repoResp.ok) throw new WorkspaceStoreError(`repo lookup failed: ${repoResp.status}`, "provider_error");
    const defaultBranch = (await repoResp.json()).default_branch;
    const refResp = await this.gh("GET", `${this.repoBase()}/git/ref/heads/${defaultBranch}`);
    if (!refResp.ok) throw new WorkspaceStoreError(`default ref lookup failed: ${refResp.status}`, "provider_error");
    const baseSha = (await refResp.json()).object.sha;
    const createResp = await this.gh("POST", `${this.repoBase()}/git/refs`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: baseSha }),
    });
    if (!createResp.ok && createResp.status !== 422) {
      throw new WorkspaceStoreError(`branch create failed: ${createResp.status}`, "provider_error");
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
    for (const id of await this.listWorkspaces()) {
      const { workspace } = await this.readItem(id);
      if (workspace.aliases.includes(alias)) return workspace;
    }
    return null;
  }

  async listWorkspaces() {
    this.ensureInitialized();
    this.record("list-contents");
    if (this.dryRun) return this.model.listWorkspaces();
    const resp = await this.gh("GET", `${this.repoBase()}/contents/?ref=${encodeURIComponent(await this.tipSha())}`);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new CorruptWorkspaceStoreError(`list failed: ${resp.status}`);
    const body = await resp.json();
    return (Array.isArray(body) ? body : [])
      .filter((i) => i.type === "file" && i.name.endsWith(".json"))
      .map((i) => i.name.replace(/\.json$/, ""))
      .sort();
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
      if (error && error.code === "provider_response_lost") this._noteGen(workspaceId, next.generation);
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
    const ids = await this.listWorkspaces();
    const workspaces = [];
    for (const id of ids) workspaces.push((await this.readItem(id)).workspace);
    return { schemaVersion: 1, syntheticData: true, configurationId: this.configurationId, workspaces };
  }

  async restore(snapshot) {
    this.ensureInitialized();
    this.record("put-contents", { changeType: "restore" });
    if (this.dryRun) return this.model.restore(snapshot);
    if (snapshot?.schemaVersion !== 1 || snapshot?.syntheticData !== true || !Array.isArray(snapshot?.workspaces)) {
      throw new CorruptWorkspaceStoreError("Backup is invalid");
    }
    for (const workspace of snapshot.workspaces) {
      validateWorkspaceRecord(workspace);
      let sha;
      try { sha = (await this.readItem(workspace.workspaceId)).sha; } catch { sha = undefined; }
      const resp = await this.gh("PUT", `${this.repoBase()}/contents/${workspace.workspaceId}.json`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `s0 restore ${workspace.workspaceId}`, content: b64encode(JSON.stringify(workspace)), branch: this.branch, ...(sha ? { sha } : {}) }),
      });
      if (!resp.ok) throw new WorkspaceStoreError(`restore ${workspace.workspaceId} failed: ${resp.status}`, "provider_error");
      // Restore deliberately re-establishes a known head; reset the floor to it.
      this._maxGen.set(workspace.workspaceId, workspace.generation);
    }
    return { workspaceCount: snapshot.workspaces.length };
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
  async cleanup() {
    if (this.dryRun) { this.record("delete-ref", { ref: `refs/heads/${this.branch}` }); return { deleted: this.branch, dryRun: true }; }
    const resp = await this.gh("DELETE", `${this.repoBase()}/git/refs/heads/${this.branch}`);
    if (!resp.ok && resp.status !== 404 && resp.status !== 422) {
      throw new WorkspaceStoreError(`cleanup failed: ${resp.status}`, "provider_error");
    }
    return { deleted: this.branch };
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
