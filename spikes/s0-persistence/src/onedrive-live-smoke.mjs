// Live OneDrive smoke: proves BCK-002 (provider-native ETag compare-and-swap)
// against a real drive, using a per-run subfolder that is always cleaned up.
//
// Host-agnostic: every coordinate comes from the environment, so no corporate
// path or credential lives in the repo.
//   S0_ONEDRIVE_TOKEN    - Graph bearer token (delegated Files.ReadWrite)
//   S0_ONEDRIVE_DRIVE_ID  - target drive id
//   S0_ONEDRIVE_FOLDER    - base folder (server-relative path within the drive)
//
// The token is read from the environment and never printed.

import { OneDriveGraphStore } from "./adapters/onedrive-store.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";
import { WorkspaceConflictError } from "./workspace-contract.mjs";

const token = process.env.S0_ONEDRIVE_TOKEN;
const driveId = process.env.S0_ONEDRIVE_DRIVE_ID;
const folder = process.env.S0_ONEDRIVE_FOLDER;

if (!token || !driveId || !folder) {
  console.error("Missing S0_ONEDRIVE_TOKEN / S0_ONEDRIVE_DRIVE_ID / S0_ONEDRIVE_FOLDER");
  process.exit(2);
}

const runId = `smoke-${Date.now()}`;
const makeStore = () => new OneDriveGraphStore({
  dryRun: false, driveId, folderPath: folder, runId, graphToken: token,
});

let pass = 0;
let failn = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failn++; console.log(`  FAIL  ${name}`); }
}

const store = makeStore();
console.log(`live OneDrive smoke: subfolder=tippani-s0/${runId}`);

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
    const result = await store.cleanup();
    console.log(`cleanup: deleted ${result.deleted}`);
  } catch (error) {
    console.log(`cleanup FAILED (manual delete may be needed): ${error?.message || error}`);
  }
}

console.log(`\nlive OneDrive smoke: ${pass} passed, ${failn} failed`);
process.exit(failn > 0 ? 1 : 0);
