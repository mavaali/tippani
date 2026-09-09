// Emits the single reviewed artifact Kay approves before any live provider run:
// a non-secret preflight sheet plus the exact operation manifest the provider
// path would issue, produced by running the provider adapter in dry-run so the
// manifest is real and zero provider calls are made.

import {
  PreflightError,
  assertPreflight,
  findEmbeddedSecrets,
  resolveEffectiveProviderConfig,
  validatePreflight,
  withResolvedProviderIdentity,
} from "./preflight.mjs";
import { resolveProviderIdentityForConfig } from "./provider-identity.mjs";
import { PROVIDER_PREREQUISITES } from "./provider-gates.mjs";
import { ProviderWorkspaceStore } from "./adapters/provider-store.mjs";
import { OneDriveGraphStore } from "./adapters/onedrive-store.mjs";
import { AdoGitStore } from "./adapters/ado-git-store.mjs";
import { GitHubRepoStore } from "./adapters/github-repo-store.mjs";
import { createCleanupAuthorization } from "./cleanup-manifest.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";

function makeDryRunStore(config) {
  if (config.backingPath === "onedrive") {
    return new OneDriveGraphStore({
      dryRun: true,
      runId: config.runId,
      configurationId: config.configurationId,
      driveId: config.sandbox?.coordinates?.driveId,
      folderPath: config.sandbox?.coordinates?.folder,
      ownershipMarker: config.sandbox?.ownershipMarker,
      cleanupManifestId: config.sandbox?.cleanup?.manifestId,
      effectiveTargetHash: config.sandbox?.effectiveTargetHash,
    });
  }
  if (config.backingPath === "ado") {
    return new AdoGitStore({
      dryRun: true,
      runId: config.runId,
      configurationId: config.configurationId,
      org: config.sandbox?.coordinates?.organization,
      project: config.sandbox?.coordinates?.project,
      repo: config.sandbox?.coordinates?.repository,
      ownershipMarker: config.sandbox?.ownershipMarker,
      cleanupManifestId: config.sandbox?.cleanup?.manifestId,
      effectiveTargetHash: config.sandbox?.effectiveTargetHash,
    });
  }
  if (config.backingPath === "github") {
    return new GitHubRepoStore({
      dryRun: true,
      runId: config.runId,
      configurationId: config.configurationId,
      owner: config.sandbox?.coordinates?.owner,
      repo: config.sandbox?.coordinates?.repository,
      ownershipMarker: config.sandbox?.ownershipMarker,
      cleanupManifestId: config.sandbox?.cleanup?.manifestId,
      effectiveTargetHash: config.sandbox?.effectiveTargetHash,
    });
  }
  return new ProviderWorkspaceStore({
    backingPath: config.backingPath,
    sandbox: config.sandbox,
    dryRun: true,
    configurationId: config.configurationId,
  });
}

export async function runProviderDryRun(config) {
  const store = makeDryRunStore(config);
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: `${config.runId}-dryrun` });
  await store.createWorkspace(workspace);
  await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "Synthetic Actor", action: "dry-run" } },
  });
  await store.readWorkspace(workspace.workspaceId);
  await store.listWorkspaces();
  await store.backup();
  if (typeof store.cleanup === "function") {
    const authorization = createCleanupAuthorization(config, store);
    if (typeof store.prepareCleanup === "function") await store.prepareCleanup(authorization);
    try {
      await store.cleanup(authorization);
    } catch (error) {
      if (error?.code !== "cleanup_unsupported") throw error;
    }
  }
  await store.close();
  return {
    operations: store.providerOperationManifest(),
    liveProviderCalls: store.liveProviderCallCount(),
  };
}

export async function buildPreflightSheet(config, {
  env = process.env,
  identityResolver = null,
  identityFetchImpl = null,
} = {}) {
  const errors = validatePreflight(config, { env, requireApproval: false });
  if (errors.length) throw new PreflightError(errors);
  config = resolveEffectiveProviderConfig(config, env);
  let identityResolutionCalls = 0;
  if (config.dryRun === false) {
    const identity = await resolveProviderIdentityForConfig(config, {
      env,
      identityResolver,
      fetchImpl: identityFetchImpl || globalThis.fetch,
      beforeAttempt: () => { identityResolutionCalls++; },
    });
    config = withResolvedProviderIdentity(config, identity, env);
  }
  const preflight = assertPreflight(config, new Date(), { requireApproval: false });

  const dryRun = await runProviderDryRun(config);
  if (dryRun.liveProviderCalls !== 0) {
    throw new Error("Dry run attempted a live provider call; refusing to emit a sheet");
  }

  const sheet = {
    schemaVersion: 1,
    approvalRequired: true,
    configurationId: config.configurationId,
    backingPath: config.backingPath,
    syntheticDataOnly: config.syntheticDataOnly === true,
    identity: {
      label: config.sandbox.identityLabel,
      subject: preflight.sandbox.providerIdentity,
      source: preflight.sandbox.providerIdentity ? "provider credential" : "unresolved",
      verified: config.sandbox.identityVerified === true,
      corporateFallbackDisabled: config.sandbox.corporateFallbackDisabled === true,
    },
    coordinates: config.sandbox.coordinates,
    namespace: config.sandbox.namespace,
    defaultBranchExcluded: config.sandbox.defaultBranchExcluded === true,
    ownershipMarker: config.sandbox.ownershipMarker,
    budgets: preflight.budgets,
    cleanup: preflight.sandbox.cleanup,
    dryRunOperations: dryRun.operations,
    liveProviderCalls: dryRun.liveProviderCalls,
    identityResolutionCalls,
    effectiveTargetHash: preflight.sandbox.effectiveTargetHash,
    approvalReady: Boolean(preflight.sandbox.effectiveTargetHash),
    prerequisites: PROVIDER_PREREQUISITES,
  };

  const secrets = findEmbeddedSecrets(sheet);
  if (secrets.length) {
    throw new Error(`Preflight sheet must contain no secrets: ${secrets.join("; ")}`);
  }
  return sheet;
}

export function renderPreflightSheet(sheet) {
  const lines = [
    `# S0 provider preflight sheet: ${sheet.configurationId}`,
    "",
    `**Backing path:** ${sheet.backingPath}`,
    `**Synthetic data only:** ${sheet.syntheticDataOnly}`,
    `**Approval required before any live provider call:** ${sheet.approvalRequired ? "Yes" : "No"}`,
    `**Live provider calls during dry-run:** ${sheet.liveProviderCalls}`,
    `**Credential identity-resolution calls:** ${sheet.identityResolutionCalls}`,
    `**Effective target hash ready for approval:** ${sheet.approvalReady ? "Yes" : "No"}`,
    "",
    "## Effective identity (non-secret)",
    "",
    `- Label: ${sheet.identity.label}`,
    `- Provider-derived subject: ${sheet.identity.subject || "unresolved"}`,
    `- Source: ${sheet.identity.source}`,
    `- Verified: ${sheet.identity.verified}`,
    `- Corporate fallback disabled: ${sheet.identity.corporateFallbackDisabled}`,
    "",
    "## Sandbox coordinates",
    "",
    ...Object.entries(sheet.coordinates || {}).map(([key, value]) => `- ${key}: ${value}`),
    `- Per-run namespace: ${sheet.namespace}`,
    `- Default/protected branch excluded: ${sheet.defaultBranchExcluded}`,
    `- Ownership marker: ${sheet.ownershipMarker}`,
    `- Approved target hash input: ${sheet.effectiveTargetHash || "unresolved runtime target"}`,
    "",
    "## Budgets",
    "",
    ...Object.entries(sheet.budgets || {}).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Cleanup",
    "",
    `- Manifest: ${sheet.cleanup?.manifestId}`,
    `- Expires: ${sheet.cleanup?.expiresAt}`,
    "",
    "## Dry-run operation manifest (no provider call was made)",
    "",
    "| # | Operation | Precondition | Namespace |",
    "|---:|---|---|---|",
    ...sheet.dryRunOperations.map((op, index) =>
      `| ${index + 1} | ${op.op} | ${op.precondition ?? "\u2014"} | ${op.namespace ?? "\u2014"} |`),
    "",
    "## Prerequisites to supply before any live run",
    "",
    ...sheet.prerequisites.map((item) => `- [ ] ${item}`),
    "",
  ];
  return lines.join("\n");
}
