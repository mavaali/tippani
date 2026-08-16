// Emits the single reviewed artifact Kay approves before any live provider run:
// a non-secret preflight sheet plus the exact operation manifest the provider
// path would issue, produced by running the provider adapter in dry-run so the
// manifest is real and zero provider calls are made.

import { PreflightError, findEmbeddedSecrets, validatePreflight } from "./preflight.mjs";
import { PROVIDER_PREREQUISITES } from "./provider-gates.mjs";
import { ProviderWorkspaceStore } from "./adapters/provider-store.mjs";
import { OneDriveGraphStore } from "./adapters/onedrive-store.mjs";
import { AdoGitStore } from "./adapters/ado-git-store.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";

function makeDryRunStore(config) {
  if (config.backingPath === "onedrive") {
    return new OneDriveGraphStore({
      dryRun: true,
      runId: config.runId,
      configurationId: config.configurationId,
      driveId: config.sandbox?.coordinates?.driveId,
      folderPath: config.sandbox?.coordinates?.folder,
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
  if (typeof store.cleanup === "function") await store.cleanup();
  await store.close();
  return {
    operations: store.providerOperationManifest(),
    liveProviderCalls: store.liveProviderCallCount(),
  };
}

export async function buildPreflightSheet(config) {
  const errors = validatePreflight(config);
  if (errors.length) throw new PreflightError(errors);

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
      verified: config.sandbox.identityVerified === true,
      corporateFallbackDisabled: config.sandbox.corporateFallbackDisabled === true,
    },
    coordinates: config.sandbox.coordinates,
    namespace: config.sandbox.namespace,
    defaultBranchExcluded: config.sandbox.defaultBranchExcluded === true,
    ownershipMarker: config.sandbox.ownershipMarker,
    budgets: config.budgets,
    cleanup: config.sandbox.cleanup,
    dryRunOperations: dryRun.operations,
    liveProviderCalls: dryRun.liveProviderCalls,
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
    "",
    "## Effective identity (non-secret)",
    "",
    `- Label: ${sheet.identity.label}`,
    `- Verified: ${sheet.identity.verified}`,
    `- Corporate fallback disabled: ${sheet.identity.corporateFallbackDisabled}`,
    "",
    "## Sandbox coordinates",
    "",
    ...Object.entries(sheet.coordinates || {}).map(([key, value]) => `- ${key}: ${value}`),
    `- Per-run namespace: ${sheet.namespace}`,
    `- Default/protected branch excluded: ${sheet.defaultBranchExcluded}`,
    `- Ownership marker: ${sheet.ownershipMarker}`,
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
