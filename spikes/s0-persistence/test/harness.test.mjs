import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReferenceMemoryWorkspaceStore } from "../src/adapters/reference-memory-store.mjs";
import { CleanupManifest } from "../src/cleanup-manifest.mjs";
import { validatePreflight } from "../src/preflight.mjs";
import { runHarness } from "../src/runner.mjs";
import { renderOutcomeReport } from "../src/result-writer.mjs";
import { gateSummary } from "../src/eligibility.mjs";
import {
  SCENARIOS,
  validateScenarioCatalog,
} from "../src/scenario-catalog.mjs";
import {
  assertSyntheticOnly,
  createSyntheticWorkspace,
} from "../src/synthetic-fixtures.mjs";
import { WorkspaceConflictError } from "../src/workspace-contract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const config = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "reference-memory.json"),
  "utf8",
));

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

await check("scenario catalog is valid and unique", async () => {
  assert.equal(validateScenarioCatalog(), true);
  assert.equal(new Set(SCENARIOS.map((item) => item.id)).size, SCENARIOS.length);
});

await check("machine catalog matches every ID in the approved spec", async () => {
  const spec = fs.readFileSync(
    path.join(spikeRoot, "2026-08-14-s0-windows-persistence-spike.md"),
    "utf8",
  );
  const ids = [...spec.matchAll(/`(S0-[A-Z]{3}-\d{3})`/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(ids)].sort(), SCENARIOS.map((item) => item.id).sort());
});

await check("synthetic fixtures are deterministic", async () => {
  const left = createSyntheticWorkspace({ seed: "deterministic", scale: "small" });
  const right = createSyntheticWorkspace({ seed: "deterministic", scale: "small" });
  assert.deepEqual(left, right);
  assert.equal(assertSyntheticOnly(left), true);
});

await check("synthetic guard rejects actual-looking account data", async () => {
  const fixture = createSyntheticWorkspace({ seed: "guard" });
  fixture.private.activeContext.actor = "person@microsoft.com";
  assert.throws(() => assertSyntheticOnly(fixture), /Non-synthetic value/);
});

await check("preflight accepts the reference sandbox", async () => {
  assert.deepEqual(validatePreflight(config), []);
});

await check("preflight rejects credential variants and corporate fallback", async () => {
  for (const key of [
    "token",
    "authToken",
    "clientSecret",
    "apiKey",
    "sasToken",
    "connectionString",
    "pat",
    "privateKey",
  ]) {
    const unsafe = structuredClone(config);
    unsafe[key] = "not-allowed";
    const errors = validatePreflight(unsafe);
    assert(
      errors.some((error) => error.includes("Credential material")),
      `${key} bypassed credential detection`,
    );
  }
  const fallback = structuredClone(config);
  fallback.sandbox.corporateFallbackDisabled = false;
  assert(
    validatePreflight(fallback).some((error) =>
      error.includes("Corporate-account fallback")),
  );
});

await check("reference store enforces generation CAS", async () => {
  const store = new ReferenceMemoryWorkspaceStore();
  await store.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: "cas" });
    await store.createWorkspace(workspace);
    const results = await Promise.allSettled([
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "write" } },
      }),
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic B", action: "write" } },
      }),
    ]);
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
    const rejection = results.find((item) => item.status === "rejected");
    assert(rejection.reason instanceof WorkspaceConflictError);
  } finally {
    await store.close();
  }
});

await check("cleanup manifest authorizes only owned resources once", async () => {
  const manifest = new CleanupManifest({
    runId: config.runId,
    ownershipMarker: config.sandbox.ownershipMarker,
  });
  const owned = {
    kind: "synthetic-ref",
    id: "syn-resource-1",
    runId: config.runId,
    ownershipMarker: config.sandbox.ownershipMarker,
  };
  manifest.record(owned);
  assert.equal(manifest.authorize(owned), true);
  manifest.markCleaned(owned);
  assert.equal(manifest.authorize(owned), false);
  assert.throws(() => manifest.markCleaned(owned), /Refusing cleanup/);
});

await check("reference self-test writes raw and Markdown outcomes", async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "tippani-s0-"));
  try {
    const { run, artifacts } = await runHarness({ config, outputDir });
    assert(run.results.length > 0);
    assert(run.results.every((result) => result.status !== "Fail"));
    assert(
      run.results
        .filter((result) => result.status === "Incomplete")
        .every((result) => typeof result.reason === "string" && result.reason.length > 0),
    );
    assert.equal(run.syntheticData, true);
    assert(fs.existsSync(artifacts.rawPath));
    assert(fs.existsSync(artifacts.reportPath));
    assert(fs.readFileSync(artifacts.reportPath, "utf8").includes("Scenario results"));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

await check("report discloses unexecuted catalog coverage", async () => {
  const { run } = await runHarness({
    config,
    scenarioIds: ["S0-ATM-001"],
    writeArtifacts: false,
  });
  const report = renderOutcomeReport(run);
  assert(report.includes("## Coverage"));
  assert(report.includes(`Executed 1 of ${SCENARIOS.length} catalog scenarios`));
  assert(report.includes("An unexecuted absolute gate is missing evidence, not a pass."));
  assert(report.includes("**Recommendation:** Incomplete"));
});

await check("eligibility is never Yes while an absolute gate is unexecuted", async () => {
  const { run } = await runHarness({
    config,
    scenarioIds: ["S0-ATM-001"],
    writeArtifacts: false,
  });
  const gates = gateSummary(run);
  assert.notEqual(gates.eligible, "Yes");
  assert.equal(gates.eligible, "Incomplete");
  assert(gates.missing.length > 0, "Unexecuted absolute gates must be counted as missing");
  assert.equal(gates.failed.length, 0);
});

await check("eligibility is No on a failed gate and Yes only when every gate passed", async () => {
  const catalog = [
    { id: "S0-ATM-001", criterionType: "absolute", title: "a" },
    { id: "S0-ATM-002", criterionType: "absolute", title: "b" },
  ];
  const allPass = {
    catalog,
    results: catalog.map((s) => ({ scenarioId: s.id, criterionType: "absolute", status: "Pass" })),
  };
  assert.equal(gateSummary(allPass).eligible, "Yes");

  const oneFailed = {
    catalog,
    results: [
      { scenarioId: "S0-ATM-001", criterionType: "absolute", status: "Fail" },
      { scenarioId: "S0-ATM-002", criterionType: "absolute", status: "Pass" },
    ],
  };
  assert.equal(gateSummary(oneFailed).eligible, "No");

  const oneIncomplete = {
    catalog,
    results: [
      { scenarioId: "S0-ATM-001", criterionType: "absolute", status: "Pass" },
      { scenarioId: "S0-ATM-002", criterionType: "absolute", status: "Incomplete" },
    ],
  };
  assert.equal(gateSummary(oneIncomplete).eligible, "Incomplete");
});

console.log(`s0-persistence-harness: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
