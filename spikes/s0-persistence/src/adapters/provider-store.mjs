// One backing-path facade in front of every storage engine.
//
// The spike's contract is that a single IWorkspaceStore fronts every backing
// path - local filesystem, OneDrive, ADO, GitHub - rather than local bypassing
// the provider abstraction. BackingPathStore is that facade: it records the
// backing-path operation it issues (connect, put-workspace with a precondition,
// get-workspace, ...) and then delegates the actual persistence to an inner
// engine.
//
//   local backing     - inner is a durable local engine; every operation really
//                        executes. No sandbox is required (private authority).
//   provider backing   - requires sandbox preflight. In dry-run the inner is a
//                        coherent in-memory model and zero network calls are
//                        made; in live mode every provider call is refused with
//                        a typed, fail-closed error until a sandbox is wired in.

import { WorkspaceStoreError } from "../workspace-contract.mjs";
import { ReferenceMemoryWorkspaceStore } from "./reference-memory-store.mjs";

const PROVIDER_BACKING_PATHS = new Set(["onedrive", "ado", "github"]);

export class ProviderLiveUnavailableError extends WorkspaceStoreError {
  constructor(operation, backingPath) {
    super(
      `Live provider operation '${operation}' requires an approved ${backingPath} sandbox`,
      "provider_live_unavailable",
    );
  }
}

export class ProviderPreflightError extends WorkspaceStoreError {
  constructor(problems) {
    super(`Provider sandbox preflight failed: ${problems.join("; ")}`, "preflight_required");
    this.problems = problems;
  }
}

export class BackingPathStore {
  constructor({ backingPath = "local", inner, sandbox = {}, dryRun = false, configurationId = "CFG-BACKING" } = {}) {
    if (!inner) throw new TypeError("BackingPathStore requires an inner engine");
    this.backingPath = backingPath;
    this.inner = inner;
    this.sandbox = sandbox;
    this.dryRun = dryRun === true;
    this.configurationId = configurationId;
    this.isProvider = PROVIDER_BACKING_PATHS.has(backingPath);
    this.operations = [];
    this.liveProviderCalls = 0;
  }

  // Fail closed before any provider interaction unless the sandbox is approved,
  // allow-listed, identity-verified, namespaced, and has a cleanup manifest.
  assertSandboxReady() {
    const sandbox = this.sandbox || {};
    const problems = [];
    if (sandbox.approved !== true) problems.push("sandbox not approved");
    if (sandbox.allowListed !== true) problems.push("sandbox not allow-listed");
    if (sandbox.identityVerified !== true) problems.push("effective identity not verified");
    if (sandbox.corporateFallbackDisabled !== true) problems.push("corporate fallback not disabled");
    if (!sandbox.namespace) problems.push("per-run namespace missing");
    if (!sandbox.coordinates || typeof sandbox.coordinates !== "object") problems.push("sandbox coordinates missing");
    if (!sandbox.defaultBranchExcluded) problems.push("default/protected branch not excluded");
    if (!sandbox.cleanup?.manifestId || !sandbox.cleanup?.expiresAt) problems.push("cleanup manifest/expiry missing");
    if (problems.length) throw new ProviderPreflightError(problems);
  }

  // Record the backing-path operation. A live provider path has no transport in
  // S0, so it refuses rather than fabricating a result; local and dry-run record
  // and proceed to the inner engine.
  gate(op, precondition = null) {
    this.operations.push({
      op,
      precondition,
      backingPath: this.backingPath,
      namespace: this.sandbox?.namespace ?? null,
    });
    if (this.isProvider && !this.dryRun) {
      this.liveProviderCalls++;
      throw new ProviderLiveUnavailableError(op, this.backingPath);
    }
  }

  async initialize() {
    if (this.isProvider) this.assertSandboxReady();
    this.gate("connect");
    return this.inner.initialize();
  }

  async createWorkspace(workspace) {
    this.gate("put-workspace", "if-none-match");
    return this.inner.createWorkspace(workspace);
  }

  async readWorkspace(workspaceId) {
    this.gate("get-workspace");
    return this.inner.readWorkspace(workspaceId);
  }

  async resolveAlias(alias) {
    this.gate("get-alias");
    return this.inner.resolveAlias(alias);
  }

  async listWorkspaces() {
    this.gate("list-workspaces");
    return this.inner.listWorkspaces();
  }

  async compareAndSwap(request) {
    this.gate("put-workspace", `if-match:generation=${request?.expectedGeneration}`);
    return this.inner.compareAndSwap(request);
  }

  async backup() {
    this.gate("export-history");
    return this.inner.backup();
  }

  async restore(snapshot, options) {
    this.gate("restore-head");
    return this.inner.restore(snapshot, options);
  }

  async close() {
    return this.inner.close();
  }

  // Engine test hooks pass straight through; they are not backing-path calls.
  injectCorruption(...args) { return this.inner.injectCorruption?.(...args); }
  injectReadFault(...args) { return this.inner.injectReadFault?.(...args); }
  seedLegacy(...args) { return this.inner.seedLegacy?.(...args); }
  migrate(...args) { return this.inner.migrate?.(...args); }
  importEnvelope(...args) { return this.inner.importEnvelope?.(...args); }
  diagnostics(...args) { return this.inner.diagnostics?.(...args); }
  strayTempFiles(...args) { return this.inner.strayTempFiles ? this.inner.strayTempFiles(...args) : []; }

  get root() { return this.inner.root; }

  providerOperationManifest() { return this.operations.map((op) => ({ ...op })); }
  liveProviderCallCount() { return this.liveProviderCalls; }
}

// A provider backing path with no live sandbox: the inner is a coherent
// in-memory model used only to make the dry-run operation manifest meaningful.
export class ProviderWorkspaceStore extends BackingPathStore {
  constructor({ backingPath = "ado", sandbox = {}, dryRun = false, configurationId = "CFG-PROVIDER" } = {}) {
    super({
      backingPath,
      inner: new ReferenceMemoryWorkspaceStore({ configurationId }),
      sandbox,
      dryRun,
      configurationId,
    });
  }
}
