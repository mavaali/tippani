// Live OneDrive smoke: proves BCK-002 (provider-native ETag compare-and-swap)
// against a real drive, using a per-run subfolder that is always cleaned up.
//
// Host-agnostic: every coordinate comes from the environment, so no corporate
// path or credential lives in the repo.
//   S0_ONEDRIVE_TOKEN    - Graph bearer token (delegated Files.ReadWrite)
//   S0_ONEDRIVE_DRIVE_ID  - target drive id
//   S0_ONEDRIVE_FOLDER    - base folder (server-relative path within the drive)
//   S0_PREFLIGHT_*         - approved effective-target receipt (identity is
//                            derived from the supplied credential, not a caller
//                            variable)
//   S0_RUN_ID              - pre-approved unique run id (`s0-...`)
//
// The token is read from the environment and never printed.

import path from "node:path";
import { performance } from "node:perf_hooks";
import { OneDriveGraphStore } from "./adapters/onedrive-store.mjs";
import { ProviderTelemetry } from "./adapters/provider-telemetry.mjs";
import { createCleanupAuthorization } from "./cleanup-manifest.mjs";
import { OperationBudget } from "./operation-budget.mjs";
import {
  assertPreflight,
  resolveEffectiveProviderConfig,
  withResolvedProviderIdentity,
} from "./preflight.mjs";
import { resolveProviderIdentityForConfig } from "./provider-identity.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";
import { WorkspaceConflictError } from "./workspace-contract.mjs";

const token = process.env.S0_ONEDRIVE_TOKEN;
const driveId = process.env.S0_ONEDRIVE_DRIVE_ID;
const folder = process.env.S0_ONEDRIVE_FOLDER;
const runId = process.env.S0_RUN_ID;

if (!token || !driveId || !folder || !runId) {
  console.error("Missing S0_ONEDRIVE_TOKEN / S0_ONEDRIVE_DRIVE_ID / S0_ONEDRIVE_FOLDER / S0_RUN_ID");
  process.exit(2);
}

let config = resolveEffectiveProviderConfig({
  configurationId: "CFG-ONEDRIVE-SMOKE",
  adapter: "onedrive",
  backingPath: "onedrive",
  runId,
  syntheticDataOnly: true,
  dryRun: false,
  budgets: {
    maxOperations: 100,
    maxDurationMs: 300000,
    maxObjects: 100,
    maxBytes: 10485760,
  },
  sandbox: {
    kind: "provider-live",
    approved: true,
    allowListed: true,
    identityLabel: "Runtime-approved OneDrive smoke identity",
    identityVerified: true,
    corporateFallbackDisabled: true,
    defaultBranchExcluded: true,
    ownershipMarker: `tippani-s0:${runId}`,
    namespace: `tippani-s0/${runId}`,
    coordinates: { driveId, folder },
    dryRunOperations: [
      "ensure-folder",
      "put-run-marker",
      "put-content",
      "get-content",
      "delete-folder",
    ],
    cleanup: { manifestId: `syn-cleanup-${runId}`, retentionHours: 1 },
  },
});
const abortController = new AbortController();
const deadlineAt = performance.now() + config.budgets.maxDurationMs;
const deadlineTimer = setTimeout(
  () => abortController.abort(),
  Math.max(0, deadlineAt - performance.now()),
);
deadlineTimer.unref?.();
const safetyBudget = new OperationBudget({
  limits: config.budgets,
  signal: abortController.signal,
  deadlineAt,
});
const identityTelemetry = new ProviderTelemetry({ safetyBudget });
config = withResolvedProviderIdentity(
  config,
  await resolveProviderIdentityForConfig(config, {
    signal: abortController.signal,
    beforeAttempt: () => identityTelemetry.recordRequest(),
    wrapResponse: (response, context) => identityTelemetry.wrapResponse(response, context),
  }),
);
assertPreflight(config);
const makeStore = () => new OneDriveGraphStore({
  dryRun: false,
  driveId,
  folderPath: folder,
  runId,
  graphToken: token,
  effectiveTargetHash: config.sandbox.effectiveTargetHash,
  preflightApproval: config.sandbox.approval,
  enforcePreflight: true,
  ownershipMarker: config.sandbox.ownershipMarker,
  cleanupManifestId: config.sandbox.cleanup.manifestId,
  cleanupManifestNonce: config.sandbox.cleanup.manifestNonce,
  safetyBudget,
  signal: abortController.signal,
});

let pass = 0;
let failn = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failn++; console.log(`  FAIL  ${name}`); }
}

const cleanupStore = makeStore();
const cleanupManifestPath = path.resolve(
  process.env.S0_CLEANUP_MANIFEST_PATH ||
    path.join("spikes", "s0-persistence", "results", runId, "cleanup-manifest.json"),
);
const cleanupAuthorization = createCleanupAuthorization(config, cleanupStore, {
  filePath: cleanupManifestPath,
});
const store = makeStore();
console.log(`live OneDrive smoke: subfolder=tippani-s0/${runId}`);
console.log(`cleanup manifest: ${cleanupManifestPath} ${cleanupAuthorization.manifest.evidence().digest}`);

try {
  await store.initialize();
  ok("ensure per-run subfolder", true);

  const workspace = createSyntheticWorkspace({ seed: runId });
  await store.createWorkspace(workspace);
  ok("create workspace (conflictBehavior=fail)", true);

  const next = await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "Synthetic A", action: "advance" } },
  });
  ok("compareAndSwap advances via If-Match ETag CAS", next.generation === 1);

  const readback = await store.readWorkspace(workspace.workspaceId);
  ok("readback reflects the committed generation", readback.generation === 1);

  // Provider-native stale-writer: two clients both read gen 1 and race.
  const a = makeStore();
  const b = makeStore();
  await a.initialize();
  await b.initialize();
  const results = await Promise.allSettled([
    a.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "Client A", action: "race" } } }),
    b.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "Client B", action: "race" } } }),
  ]);
  const winners = results.filter((r) => r.status === "fulfilled");
  const conflicts = results.filter((r) => r.status === "rejected" && r.reason instanceof WorkspaceConflictError);
  ok("two-client race: exactly one winner", winners.length === 1);
  ok("two-client race: the loser gets a typed stale-writer conflict", conflicts.length === 1);

  const durable = await store.readWorkspace(workspace.workspaceId);
  ok("durable state advanced exactly one generation from the race", durable.generation === 2);
} catch (error) {
  failn++;
  console.log(`  FAIL  unexpected error: ${error?.code || ""} ${error?.message || error}`);
} finally {
  try {
    if (!cleanupAuthorization.resource.condition) {
      await cleanupStore.prepareCleanup(cleanupAuthorization);
    }
    const result = await cleanupStore.cleanup(cleanupAuthorization);
    console.log(`cleanup: deleted ${result.deleted}`);
  } catch (error) {
    failn++;
    console.log(`cleanup FAILED (manual delete may be needed): ${error?.message || error}`);
  }
  clearTimeout(deadlineTimer);
}

console.log(`final budget telemetry: ${JSON.stringify({
  identity: identityTelemetry.snapshot(),
  cleanup: cleanupStore.providerTelemetry(),
  final: safetyBudget.snapshot(),
  manifest: cleanupAuthorization.manifest.evidence(),
})}`);
console.log(`\nlive OneDrive smoke: ${pass} passed, ${failn} failed`);
process.exit(failn > 0 ? 1 : 0);
