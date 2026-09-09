import { ReferenceMemoryWorkspaceStore } from "./reference-memory-store.mjs";
import { LocalCasWorkspaceStore } from "./local-cas-store.mjs";
import { LocalSqliteWorkspaceStore } from "./local-sqlite-store.mjs";
import { BackingPathStore, ProviderWorkspaceStore } from "./provider-store.mjs";
import { OneDriveGraphStore } from "./onedrive-store.mjs";
import { AdoGitStore } from "./ado-git-store.mjs";
import { GitHubRepoStore } from "./github-repo-store.mjs";
import { resolveEffectiveProviderConfig } from "../preflight.mjs";

/**
 * Adapters that keep authoritative state on disk. Only these can supply
 * evidence for restart, cross-process, and atomic-replace scenarios.
 */
export const DURABLE_ADAPTERS = new Set([
  "local-cas",
  "local-sqlite",
  "mutant-cas-unlocked",
  "mutant-cas-torn-write",
  "mutant-cas-volatile",
]);

function providerFactory(backingPath) {
  return (options) => new ProviderWorkspaceStore({
    backingPath,
    sandbox: options.sandbox,
    dryRun: options.dryRun === true,
    configurationId: options.configurationId,
  });
}

// The local candidates are engines; they run behind the same backing-path
// facade as the providers so every backing path shares one IWorkspaceStore.
function localFactory(Engine) {
  return (options) => new BackingPathStore({
    backingPath: "local",
    inner: new Engine(options),
    configurationId: options.configurationId,
  });
}

const FACTORIES = {
  "reference-memory": (options) => new ReferenceMemoryWorkspaceStore(options),
  "local-cas": localFactory(LocalCasWorkspaceStore),
  "local-sqlite": localFactory(LocalSqliteWorkspaceStore),
  // OneDrive has a real Graph transport; dry-run records intended requests and
  // makes zero network calls, live issues them with a runtime-supplied token.
  "onedrive": (options) => new OneDriveGraphStore({
    dryRun: options.dryRun !== false,
    driveId: options.driveId,
    folderPath: options.folderPath,
    runId: options.runId,
    configurationId: options.configurationId,
    storeRoot: options.storeRoot,
    safetyBudget: options.safetyBudget,
    signal: options.signal,
    identityResolver: options.identityResolver,
    preflightApproval: options.preflightApproval,
    effectiveTargetHash: options.effectiveTargetHash,
    enforcePreflight: options.enforcePreflight,
    ownershipMarker: options.ownershipMarker,
    cleanupManifestId: options.sandbox?.cleanup?.manifestId,
    cleanupManifestNonce: options.sandbox?.cleanup?.manifestNonce,
    graphToken: options.graphToken,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
  }),
  // ADO has a real Git-REST transport with oldObjectId ref-precondition CAS.
  "ado": (options) => new AdoGitStore({
    dryRun: options.dryRun !== false,
    org: options.org,
    project: options.project,
    repo: options.repo,
    runId: options.runId,
    configurationId: options.configurationId,
    storeRoot: options.storeRoot,
    safetyBudget: options.safetyBudget,
    signal: options.signal,
    identityResolver: options.identityResolver,
    preflightApproval: options.preflightApproval,
    effectiveTargetHash: options.effectiveTargetHash,
    enforcePreflight: options.enforcePreflight,
    ownershipMarker: options.ownershipMarker,
    cleanupManifestId: options.sandbox?.cleanup?.manifestId,
    cleanupManifestNonce: options.sandbox?.cleanup?.manifestNonce,
    adoToken: options.adoToken,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
  }),
  // GitHub has a real REST transport with Contents-API blob-sha CAS.
  "github": (options) => new GitHubRepoStore({
    dryRun: options.dryRun !== false,
    owner: options.owner,
    repo: options.repo,
    runId: options.runId,
    configurationId: options.configurationId,
    storeRoot: options.storeRoot,
    safetyBudget: options.safetyBudget,
    signal: options.signal,
    identityResolver: options.identityResolver,
    preflightApproval: options.preflightApproval,
    effectiveTargetHash: options.effectiveTargetHash,
    enforcePreflight: options.enforcePreflight,
    ownershipMarker: options.ownershipMarker,
    cleanupManifestId: options.sandbox?.cleanup?.manifestId,
    cleanupManifestNonce: options.sandbox?.cleanup?.manifestNonce,
    githubToken: options.githubToken,
    getToken: options.getToken,
    fetchImpl: options.fetchImpl,
  }),
};

// Broken stores exist only to prove the durable scenarios have detection
// power. They are unavailable unless a test explicitly opts in, so no reported
// S0 result can be produced by one.
if (process.env.S0_ENABLE_TEST_MUTANTS === "1") {
  const { TEST_MUTANT_FACTORIES } = await import("./test-mutants.mjs");
  Object.assign(FACTORIES, TEST_MUTANT_FACTORIES);
}

export function createStore(adapter, options = {}) {
  const factory = FACTORIES[adapter];
  if (!factory) throw new Error(`Unknown S0 adapter: ${adapter}`);
  if (!["onedrive", "ado", "github"].includes(adapter)) return factory(options);
  const sandbox = options.sandbox || {
    namespace: `tippani-s0/${options.runId}`,
    ownershipMarker: `tippani-s0:${options.runId}`,
    coordinates: {},
    approval: options.preflightApproval,
  };
  const resolved = resolveEffectiveProviderConfig({
    ...options,
    adapter,
    backingPath: adapter,
    sandbox,
  });
  return factory({
    ...resolved,
    preflightApproval: resolved.sandbox?.approval,
    effectiveTargetHash:
      resolved.sandbox?.effectiveTargetHash || resolved.sandbox?.approval?.targetHash,
    ownershipMarker: resolved.sandbox?.ownershipMarker,
  });
}

export function isDurable(adapter) {
  return DURABLE_ADAPTERS.has(adapter);
}
