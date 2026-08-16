// Provider-path scaffolding tests. No live sandbox exists, so these prove the
// scaffolding fails closed, dry-runs with zero provider calls, emits a
// non-secret preflight sheet, and publishes provider gates as Blocked with
// precise reasons.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProviderWorkspaceStore } from "../src/adapters/provider-store.mjs";
import {
  buildPreflightSheet,
  renderPreflightSheet,
  runProviderDryRun,
} from "../src/provider-preflight-sheet.mjs";
import { findEmbeddedSecrets } from "../src/preflight.mjs";
import { BLOCKED_REASONS } from "../src/provider-gates.mjs";
import { runHarness } from "../src/runner.mjs";
import { createSyntheticWorkspace } from "../src/synthetic-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const providerConfig = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "provider-ado-dryrun.json"),
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

await check("fails closed before any provider call with an unapproved sandbox", async () => {
  const store = new ProviderWorkspaceStore({ backingPath: "ado", sandbox: { approved: false }, dryRun: true });
  await assert.rejects(store.initialize(), (error) => error.code === "preflight_required");
});

await check("refuses live provider operations until a sandbox is wired in", async () => {
  const store = new ProviderWorkspaceStore({ backingPath: "ado", sandbox: providerConfig.sandbox, dryRun: false });
  await assert.rejects(store.initialize(), (error) => error.code === "provider_live_unavailable");
  assert.equal(store.liveProviderCallCount(), 1, "The refused connect counts as a would-be live call");
});

await check("dry-run records intended operations and makes zero live calls", async () => {
  const result = await runProviderDryRun(providerConfig);
  assert.equal(result.liveProviderCalls, 0);
  assert.ok(result.operations.length >= 4, "The dry-run must record its intended provider operations");
  assert.ok(
    result.operations.some((op) => op.op === "put-workspace" && String(op.precondition).includes("if-none-match")),
    "Create must record an if-none-match precondition",
  );
  assert.ok(
    result.operations.some((op) => String(op.precondition).includes("if-match")),
    "A mutation must record an if-match generation precondition",
  );
});

await check("dry-run enforces generation CAS in its coherent model", async () => {
  const store = new ProviderWorkspaceStore({ backingPath: "ado", sandbox: providerConfig.sandbox, dryRun: true });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "provider-cas" });
  await store.createWorkspace(workspace);
  await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "Synthetic A", action: "write" } },
  });
  await assert.rejects(
    store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic B", action: "write" } },
    }),
    (error) => error.code === "generation_conflict",
  );
  assert.equal(store.liveProviderCallCount(), 0);
});

await check("preflight sheet is non-secret and lists the dry-run manifest and prerequisites", async () => {
  const sheet = await buildPreflightSheet(providerConfig);
  assert.equal(sheet.liveProviderCalls, 0);
  assert.deepEqual(findEmbeddedSecrets(sheet), []);
  assert.ok(sheet.dryRunOperations.length >= 4);
  assert.ok(sheet.prerequisites.length > 0);
  const markdown = renderPreflightSheet(sheet);
  assert.ok(markdown.includes("preflight sheet"));
  assert.ok(markdown.includes("Dry-run operation manifest"));
  assert.ok(markdown.includes(providerConfig.sandbox.namespace));
});

await check("preflight sheet build rejects a config that embeds a credential", async () => {
  const withSecret = JSON.parse(JSON.stringify(providerConfig));
  withSecret.sandbox.coordinates.accessToken = "syn-should-not-be-here";
  await assert.rejects(buildPreflightSheet(withSecret), /Credential material/);
});

await check("provider gates are published as Blocked with precise reasons", async () => {
  const { run } = await runHarness({ config: providerConfig, writeArtifacts: false });
  assert.equal(run.results.length, providerConfig.scenarioIds.length);
  for (const result of run.results) {
    assert.equal(result.status, "Blocked", `${result.scenarioId} was ${result.status}`);
    assert.ok(result.reason && result.reason.length > 0, `${result.scenarioId} has no reason`);
    assert.equal(result.reason, BLOCKED_REASONS[result.scenarioId]);
  }
});

await check("every selected provider gate has a blocked reason", async () => {
  for (const id of providerConfig.scenarioIds) {
    assert.ok(BLOCKED_REASONS[id], `${id} lacks a blocked reason`);
  }
});

console.log(`s0-provider-dryrun: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
