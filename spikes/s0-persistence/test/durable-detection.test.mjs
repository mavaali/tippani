// Proves the DURABLE scenarios can fail a broken durable store. Without this,
// "both candidates passed on Windows" would be an untested claim about the
// harness rather than evidence about the candidates.
//
// Mutants run in real child processes, so these also exercise the worker,
// barrier, and kill machinery end to end.

process.env.S0_ENABLE_TEST_MUTANTS = "1";

import assert from "node:assert/strict";
// Imported dynamically: a static import is hoisted above the assignment above,
// which would evaluate the adapter registry before mutants are enabled.
const { runHarness } = await import("../src/runner.mjs");

let pass = 0;
let fail = 0;
async function check(name, action) {
  try {
    await action();
    pass++;
  } catch (error) {
    fail++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${error.stack || error}`);
  }
}

function configFor(adapter, runId) {
  return {
    configurationId: "CFG-MUTANT",
    adapter,
    backingPath: "local",
    platform: "windows-ntfs",
    scale: "small",
    runId,
    syntheticDataOnly: true,
    budgets: {
      maxOperations: 100,
      maxDurationMs: 300000,
      maxObjects: 10000,
      maxBytes: 104857600,
    },
    sandbox: {
      kind: "local-temp",
      approved: true,
      corporateFallbackDisabled: true,
      ownershipMarker: `tippani-s0:${runId}`,
    },
  };
}

async function statusOf(adapter, runId, scenarioId) {
  const { run } = await runHarness({
    config: configFor(adapter, runId),
    scenarioIds: [scenarioId],
    writeArtifacts: false,
  });
  const result = run.results[0];
  // A failure caused by harness plumbing is not detection power.
  if (result.error) {
    assert.doesNotMatch(
      result.error.message,
      /Unknown S0 adapter/,
      "Mutant adapters were not registered",
    );
  }
  return result;
}

await check("cross-process race detects a store with no lock", async () => {
  const result = await statusOf("mutant-cas-unlocked", "s0-mutant-unlocked", "S0-CON-001");
  assert.equal(result.status, "Fail", "An unlocked store passed the concurrency gate");
  // Two failure modes are both correct detections. On Windows/NTFS concurrent
  // MoveFileEx replacement of the same target commonly fails with EPERM rather
  // than silently losing an update, so a writer can be rejected without ever
  // receiving a typed stale-generation conflict. Either way the store failed to
  // deliver "one winner, one typed conflict".
  assert.match(
    result.error.message,
    /Exactly one process must win|audit|unexpected reason/,
    "Failure must come from the concurrency invariant, not harness plumbing",
  );
});

await check("kill-during-commit detects a torn in-place write", async () => {
  const result = await statusOf("mutant-cas-torn-write", "s0-mutant-torn", "S0-CRS-001");
  assert.equal(result.status, "Fail", "A killed non-atomic write was not detected");
  assert.match(
    result.error.message,
    /checksum|JSON|corrupt|generation/i,
    "Failure must come from the torn file, not from harness plumbing",
  );
});

await check("restart detects a commit that was acknowledged but never persisted", async () => {
  const result = await statusOf("mutant-cas-volatile", "s0-mutant-volatile", "S0-REC-001");
  assert.equal(result.status, "Fail", "A volatile commit survived the restart check");
  assert.match(result.error.message, /durable state/i);
});

await check("healthy candidates still pass the same durable scenarios", async () => {
  for (const adapter of ["local-cas", "local-sqlite"]) {
    for (const scenarioId of ["S0-CON-001", "S0-CRS-001", "S0-REC-001"]) {
      const result = await statusOf(adapter, `s0-control-${adapter}`, scenarioId);
      assert.equal(
        result.status,
        "Pass",
        `${adapter} failed ${scenarioId}: ${result.error?.message || result.reason}`,
      );
    }
  }
});

// A concurrency guarantee that has only been observed once has not been
// demonstrated. Four-way contention previously produced two winners for the
// CAS candidate because a live lock could be stolen while its owner record was
// still being written, so this repeats the race.
await check("four-way race stays single-winner across repeated attempts", async () => {
  const attempts = 6;
  for (const adapter of ["local-cas", "local-sqlite"]) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await statusOf(adapter, `s0-stress-${adapter}-${attempt}`, "S0-CON-002");
      assert.equal(
        result.status,
        "Pass",
        `${adapter} lost the single-winner guarantee on attempt ${attempt + 1}: ` +
        `${result.error?.message || result.reason}`,
      );
    }
  }
});

console.log(`s0-durable-detection: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
