// Provider-path scaffolding tests. No live sandbox exists, so these prove the
// scaffolding fails closed, dry-runs with zero provider calls, emits a
// non-secret preflight sheet, and publishes provider gates as Blocked with
// precise reasons.

import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProviderWorkspaceStore } from "../src/adapters/provider-store.mjs";
import { AdoGitStore } from "../src/adapters/ado-git-store.mjs";
import { GitHubRepoStore } from "../src/adapters/github-repo-store.mjs";
import { OneDriveGraphStore } from "../src/adapters/onedrive-store.mjs";
import { createStore } from "../src/adapters/registry.mjs";
import { applicableScenarioIds } from "../src/applicability.mjs";
import {
  CleanupManifest,
  createCleanupAuthorization,
} from "../src/cleanup-manifest.mjs";
import {
  buildPreflightSheet,
  renderPreflightSheet,
  runProviderDryRun,
} from "../src/provider-preflight-sheet.mjs";
import {
  findEmbeddedSecrets,
  providerTargetHash,
  resolveEffectiveProviderConfig,
  validatePreflight,
  withResolvedProviderIdentity,
} from "../src/preflight.mjs";
import { BLOCKED_REASONS } from "../src/provider-gates.mjs";
import { providerWorkerArgs } from "../src/onedrive-gates.mjs";
import { runWorker } from "../src/process-runner.mjs";
import { runHarness } from "../src/runner.mjs";
import { createSyntheticWorkspace } from "../src/synthetic-fixtures.mjs";
import { OperationBudget } from "../src/operation-budget.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const cleanupManifestWorker = fileURLToPath(
  new URL("../src/workers/cleanup-manifest-worker.mjs", import.meta.url),
);
// GitHub is the remaining generic-scaffold provider (OneDrive and ADO have real
// transports), so the generic dry-run/fail-closed assertions run against it.
const providerConfig = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "provider-github-dryrun.json"),
  "utf8",
));
const onedriveLiveConfig = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "provider-onedrive-live.json"),
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

await check("registry preserves runtime-only budget, signal, and callback objects", () => {
  const abortController = new AbortController();
  const safetyBudget = new OperationBudget({
    limits: { maxOperations: 10, maxDurationMs: 1000, maxObjects: 10, maxBytes: 1000 },
  });
  const fetchImpl = async () => ({ ok: true, status: 200 });
  const identityResolver = async () => ({ subject: "github:syn-runtime" });
  const store = createStore("github", {
    ...providerConfig,
    owner: "synthetic-owner",
    repo: "synthetic-repository",
    safetyBudget,
    signal: abortController.signal,
    fetchImpl,
    identityResolver,
  });
  assert.equal(store.safetyBudget, safetyBudget);
  assert.equal(store.signal, abortController.signal);
  assert.equal(store.fetchImpl, fetchImpl);
  assert.equal(store.identityResolver, identityResolver);
});

await check("refuses live provider operations until a sandbox is wired in", async () => {
  const store = new ProviderWorkspaceStore({ backingPath: "ado", sandbox: providerConfig.sandbox, dryRun: false });
  await assert.rejects(store.initialize(), (error) => error.code === "provider_live_unavailable");
  assert.equal(store.liveProviderCallCount(), 1, "The refused connect counts as a would-be live call");
});

await check("generic provider store records intended operations and makes zero live calls", async () => {
  // All real provider backing paths now have transports, so this exercises the
  // generic ProviderWorkspaceStore scaffold directly.
  const store = new ProviderWorkspaceStore({ backingPath: "ado", sandbox: providerConfig.sandbox, dryRun: true });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "provider-ops" });
  await store.createWorkspace(workspace);
  await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "Synthetic A", action: "x" } },
  });
  await store.readWorkspace(workspace.workspaceId);
  await store.listWorkspaces();
  await store.backup();
  const operations = store.providerOperationManifest();
  assert.equal(store.liveProviderCallCount(), 0);
  assert.ok(operations.length >= 4, "The dry-run must record its intended provider operations");
  assert.ok(
    operations.some((op) => op.op === "put-workspace" && String(op.precondition).includes("if-none-match")),
    "Create must record an if-none-match precondition",
  );
  assert.ok(
    operations.some((op) => String(op.precondition).includes("if-match")),
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
  assert.equal(sheet.identityResolutionCalls, 0);
  assert.deepEqual(findEmbeddedSecrets(sheet), []);
  assert.ok(sheet.dryRunOperations.length >= 4);
  assert.ok(sheet.prerequisites.length > 0);
  assert.ok(Date.parse(sheet.cleanup.expiresAt) > Date.now());
  assert.equal(sheet.cleanup.retentionHours, 24);
  const markdown = renderPreflightSheet(sheet);
  assert.ok(markdown.includes("preflight sheet"));
  assert.ok(markdown.includes("Dry-run operation manifest"));
  assert.ok(markdown.includes(providerConfig.sandbox.namespace));
  assert.equal(sheet.approvalReady, false, "Placeholder coordinates are not approval-ready");
});

await check("live preflight binds provider-derived identity and coordinates to an approved hash", async () => {
  const live = structuredClone(providerConfig);
  live.dryRun = false;
  const targetEnv = {
    S0_GITHUB_TOKEN: "syn-token",
    S0_GITHUB_OWNER: "synthetic-owner",
    S0_GITHUB_REPO: "synthetic-repository",
  };
  const resolved = withResolvedProviderIdentity(
    resolveEffectiveProviderConfig(live, targetEnv),
    "github:syn-identity-001",
    targetEnv,
  );
  assert.ok(resolved.sandbox.effectiveTargetHash?.startsWith("sha256:"));
  const approvedEnv = {
    ...targetEnv,
    S0_PREFLIGHT_APPROVER: "Synthetic Reviewer",
    S0_PREFLIGHT_APPROVED_AT: "2026-09-03T20:00:00.000Z",
    S0_PREFLIGHT_APPROVAL_REFERENCE: "syn-review-91",
    S0_PREFLIGHT_TARGET_HASH: resolved.sandbox.effectiveTargetHash,
  };
  const approved = withResolvedProviderIdentity(live, "github:syn-identity-001", approvedEnv);
  assert.deepEqual(validatePreflight(approved, { env: approvedEnv }), []);
  const futureApproval = {
    ...approvedEnv,
    S0_PREFLIGHT_APPROVED_AT: "2026-09-09T20:00:00.000Z",
  };
  const futureApproved = withResolvedProviderIdentity(
    live,
    "github:syn-identity-001",
    futureApproval,
  );
  assert(
    validatePreflight(futureApproved, {
      env: futureApproval,
      now: new Date("2026-09-08T20:00:00.000Z"),
    }).some((error) => /cannot be in the future/.test(error)),
  );

  const mismatched = { ...approvedEnv, S0_GITHUB_REPO: "different-synthetic-repository" };
  const mismatchedTarget = withResolvedProviderIdentity(
    live,
    "github:syn-identity-001",
    mismatched,
  );
  assert(
    validatePreflight(mismatchedTarget, { env: mismatched }).some((error) => /target hash/.test(error)),
    "Runtime substitution must invalidate the approved target hash",
  );

  const sheet = await buildPreflightSheet(live, {
    env: targetEnv,
    identityResolver: async ({ token }) => {
      assert.equal(token, "syn-token");
      return { subject: "github:syn-identity-001" };
    },
  });
  assert.equal(sheet.approvalReady, true);
  assert.equal(sheet.effectiveTargetHash, resolved.sandbox.effectiveTargetHash);
  assert.equal(sheet.identity.subject, "github:syn-identity-001");
  assert.equal(sheet.identity.source, "provider credential");
});

await check("live preflight rejects unresolved placeholders before any network call", () => {
  const live = structuredClone(providerConfig);
  live.dryRun = false;
  const errors = validatePreflight(live, { env: {} });
  assert(errors.some((error) => /resolved before provider calls/.test(error)));
  assert(errors.some((error) => /Structured preflight approval/.test(error)));
});

await check("provider adapter rejects a mismatched approved target before fetch", async () => {
  let calls = 0;
  const store = new GitHubRepoStore({
    dryRun: false,
    owner: "synthetic-owner",
    repo: "synthetic-repository",
    runId: "s0-provider-binding",
    githubToken: "syn-token",
    identityResolver: async () => ({ subject: "github:syn-identity-001" }),
    effectiveTargetHash: "sha256:not-the-effective-target",
    preflightApproval: {
      approver: "Synthetic Reviewer",
      approvedAt: "2026-09-03T20:00:00.000Z",
      reference: "syn-review-91",
      targetHash: "sha256:not-the-effective-target",
    },
    enforcePreflight: true,
    fetchImpl: async () => {
      calls++;
      throw new Error("network must not be reached");
    },
  });
  await assert.rejects(store.initialize(), (error) => error.code === "preflight_required");
  assert.equal(calls, 0);
});

const credentialRotationCases = [
  {
    provider: "github",
    Store: GitHubRepoStore,
    options: { owner: "synthetic-owner", repo: "synthetic-repository" },
    coordinates: { owner: "synthetic-owner", repository: "synthetic-repository" },
    request: async (store) => store.initialize(),
  },
  {
    provider: "ado",
    Store: AdoGitStore,
    options: {
      org: "synthetic-org",
      project: "synthetic-project",
      repo: "synthetic-repository",
    },
    coordinates: {
      organization: "synthetic-org",
      project: "synthetic-project",
      repository: "synthetic-repository",
    },
    request: async (store) => {
      await store.initialize();
      await store.listWorkspaces();
    },
  },
  {
    provider: "onedrive",
    Store: OneDriveGraphStore,
    options: { driveId: "synthetic-drive", folderPath: "Synthetic" },
    coordinates: { driveId: "synthetic-drive", folder: "Synthetic" },
    request: async (store) => store.initialize(),
  },
];

for (const item of credentialRotationCases) {
  await check(`${item.provider} token A approval cannot authorize token B`, async () => {
    const runId = `s0-${item.provider}-credential-binding`;
    const approvedIdentity = `${item.provider}:identity-a`;
    const targetHash = providerTargetHash({
      provider: item.provider,
      identity: approvedIdentity,
      coordinates: item.coordinates,
      namespace: `tippani-s0/${runId}`,
    });
    let issuance = 0;
    let providerCalls = 0;
    const store = new item.Store({
      dryRun: false,
      runId,
      ...item.options,
      cleanupManifestNonce: `nonce-${item.provider}-credential-binding`,
      getToken: async () => issuance++ === 0 ? "token-a" : "token-b",
      identityResolver: async ({ token }) => ({
        subject: `${item.provider}:${token === "token-a" ? "identity-a" : "identity-b"}`,
      }),
      effectiveTargetHash: targetHash,
      preflightApproval: {
        approver: "Synthetic Reviewer",
        approvedAt: "2026-09-03T20:00:00.000Z",
        reference: "syn-review-91",
        targetHash,
      },
      enforcePreflight: true,
      fetchImpl: async () => {
        providerCalls++;
        throw new Error("mismatched credential must not reach the provider");
      },
    });
    await assert.rejects(
      item.request(store),
      (error) => error.code === "credential_identity_mismatch",
    );
    assert.equal(providerCalls, 0);
  });
}

await check("a rotated credential is re-resolved and accepted only for the approved identity", async () => {
  const runId = "s0-github-approved-rotation";
  const approvedIdentity = "github:identity-a";
  const targetHash = providerTargetHash({
    provider: "github",
    identity: approvedIdentity,
    coordinates: { owner: "synthetic-owner", repository: "synthetic-repository" },
    namespace: `tippani-s0/${runId}`,
  });
  let issuance = 0;
  const resolvedTokens = [];
  let providerCalls = 0;
  const store = new GitHubRepoStore({
    dryRun: false,
    owner: "synthetic-owner",
    repo: "synthetic-repository",
    runId,
    cleanupManifestNonce: "nonce-github-approved-rotation",
    getToken: async () => issuance++ === 0 ? "token-a" : "token-b",
    identityResolver: async ({ token }) => {
      resolvedTokens.push(token);
      return { subject: approvedIdentity };
    },
    effectiveTargetHash: targetHash,
    preflightApproval: {
      approver: "Synthetic Reviewer",
      approvedAt: "2026-09-03T20:00:00.000Z",
      reference: "syn-review-91",
      targetHash,
    },
    enforcePreflight: true,
    fetchImpl: async (url, options) => {
      providerCalls++;
      if (options.method === "GET" && /\/repos\/synthetic-owner\/synthetic-repository$/.test(new URL(url).pathname)) {
        return { ok: true, status: 200, json: async () => ({ default_branch: "main" }) };
      }
      if (options.method === "GET") {
        return { ok: true, status: 200, json: async () => ({ object: { sha: "base" } }) };
      }
      return { ok: true, status: 201, json: async () => ({ ref: "created" }) };
    },
  });
  await store.initialize();
  assert.deepEqual(resolvedTokens, ["token-a", "token-b"]);
  assert.equal(providerCalls, 4);
});

await check("all provider stores unblock FIFO replay only after explicit head resolution", async () => {
  const storeRoot = path.join(spikeRoot, ".test-state", "provider-queue-resolution");
  fs.rmSync(storeRoot, { recursive: true, force: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  try {
    for (const item of credentialRotationCases) {
      const store = new item.Store({
        dryRun: true,
        runId: `s0-${item.provider}-queue-resolution`,
        storeRoot,
        ...item.options,
      });
      await store.initialize();
      const workspace = createSyntheticWorkspace({ seed: `${item.provider}-queue-resolution` });
      await store.createWorkspace(workspace);
      await store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic B", action: "authority-advance" } },
      });
      store.goOffline();
      await store.stageOffline({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "stale-head" } },
      });
      await store.stageOffline({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 1,
        operation: { auditEvent: { actor: "Synthetic A", action: "later-edit" } },
      });
      const blocked = await store.reconnect();
      assert.equal(blocked.conflicts.length, 1, `${item.provider} must report the FIFO conflict`);
      assert.equal(blocked.pendingCount, 2);
      const inspected = await store.inspectHead();
      assert.equal(inspected.head.id, blocked.conflicts[0].headId);
      assert.equal(inspected.head.generation, blocked.conflicts[0].headGeneration);
      await store.resolveHead({
        headId: inspected.head.id,
        headGeneration: inspected.head.generation,
        action: "discard",
      });
      const replayed = await store.reconnect();
      assert.equal(replayed.applied.length, 1, `${item.provider} must replay the later entry`);
      assert.equal(replayed.pendingCount, 0);
      assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 2);
      await store.close();
    }
  } finally {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  }
});

await check("an atomically persisted cleanup manifest survives process death and remains usable", async () => {
  const storeRoot = path.join(spikeRoot, ".test-state", "cleanup-manifest-crash");
  const manifestPath = path.join(storeRoot, "cleanup-manifest.json");
  const runId = "s0-cleanup-manifest-crash";
  fs.rmSync(storeRoot, { recursive: true, force: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  try {
    const store = new OneDriveGraphStore({
      dryRun: true,
      driveId: "drive-a",
      folderPath: "Synthetic",
      runId,
      ownershipMarker: `tippani-s0:${runId}`,
      cleanupManifestId: `syn-cleanup-${runId}`,
      cleanupManifestNonce: `nonce-${runId}`,
      effectiveTargetHash: "sha256:cleanup-manifest-target",
    });
    const resource = store.cleanupResource();
    const child = fork(cleanupManifestWorker, [
      `--file=${manifestPath}`,
      `--manifest-id=syn-cleanup-${runId}`,
      `--resource=${Buffer.from(JSON.stringify(resource), "utf8").toString("base64url")}`,
    ], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const exit = await new Promise((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(exit.code, 9, stderr || "worker must terminate without cleanup");
    assert.equal(fs.existsSync(manifestPath), true);
    assert.equal(
      fs.readdirSync(storeRoot).some((name) => name.endsWith(".tmp")),
      false,
    );

    const recoveredAuthorization = createCleanupAuthorization({
      runId,
      backingPath: "onedrive",
      driveId: "drive-a",
      folderPath: "Synthetic",
      sandbox: {
        ownershipMarker: `tippani-s0:${runId}`,
        effectiveTargetHash: "sha256:cleanup-manifest-target",
        coordinates: { driveId: "drive-a", folder: "Synthetic" },
        cleanup: {
          manifestId: `syn-cleanup-${runId}`,
          manifestNonce: `nonce-${runId}`,
        },
      },
    }, store, { filePath: manifestPath });
    const recovered = recoveredAuthorization.manifest;
    const initialDigest = recovered.evidence().digest;
    const recoveredResource = recoveredAuthorization.resource;
    await store.prepareCleanup({ manifest: recovered, resource: recoveredResource });
    const prepared = CleanupManifest.load(manifestPath);
    assert(prepared.resources[0].condition, "prepared cleanup condition must be durable");
    await store.cleanup({ manifest: recovered, resource: recoveredResource });
    const cleaned = CleanupManifest.load(manifestPath);
    assert.equal(cleaned.resources[0].cleaned, true);
    assert.equal(cleaned.resources[0].phase, "cleaned");
    assert.equal(cleaned.revision, 5);
    assert.notEqual(cleaned.evidence().digest, initialDigest);
  } finally {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  }
});

await check("runner persists and meters cleanup under the shared approved deadline", async () => {
  const outputDir = path.join(spikeRoot, ".test-state", "runner-cleanup-budget");
  const manifestPath = path.join(outputDir, "cleanup-manifest.json");
  const runId = "s0-runner-cleanup-budget";
  const identity = "onedrive:identity-a";
  const targetHash = providerTargetHash({
    provider: "onedrive",
    identity,
    coordinates: { driveId: "drive-a", folder: "Synthetic" },
    namespace: `tippani-s0/${runId}`,
  });
  const envValues = {
    S0_ONEDRIVE_TOKEN: "syn-token",
    S0_ONEDRIVE_DRIVE_ID: "drive-a",
    S0_ONEDRIVE_FOLDER: "Synthetic",
    S0_PREFLIGHT_APPROVER: "Synthetic Reviewer",
    S0_PREFLIGHT_APPROVED_AT: "2026-09-04T15:00:00.000Z",
    S0_PREFLIGHT_APPROVAL_REFERENCE: "syn-review-91",
    S0_PREFLIGHT_TARGET_HASH: targetHash,
  };
  const previousEnv = Object.fromEntries(
    Object.keys(envValues).map((key) => [key, process.env[key]]),
  );
  fs.rmSync(outputDir, { recursive: true, force: true });
  Object.assign(process.env, envValues);
  const previousFetch = globalThis.fetch;
  let identitySignal = null;
  let cleanupMutationSawManifest = false;
  let cleanupGetAttempts = 0;
  let cleanupChildPresent = true;
  try {
    const live = structuredClone(onedriveLiveConfig);
    live.runId = runId;
    live.driveId = "drive-a";
    live.folderPath = "Synthetic";
    live.sandbox.ownershipMarker = `tippani-s0:${runId}`;
    live.sandbox.namespace = `tippani-s0/${runId}`;
    live.sandbox.coordinates = { driveId: "drive-a", folder: "Synthetic" };
    live.sandbox.cleanup.manifestId = `syn-cleanup-${runId}`;
    const fakeFetch = async (url, options) => {
      if (url.includes("/me?$select=")) {
        identitySignal ??= options.signal;
        assert.equal(options.signal, identitySignal);
        return { ok: true, status: 200, json: async () => ({ id: "identity-a" }) };
      }
      assert.equal(options.signal, identitySignal, "cleanup must retain the shared deadline signal");
      if (options.method === "GET") {
        if (url.includes("/items/marker-a/content")) {
          const manifest = CleanupManifest.load(manifestPath);
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              schemaVersion: 1,
              syntheticData: true,
              kind: "tippani-s0-onedrive-run",
              runId,
              ownershipMarker: `tippani-s0:${runId}`,
              namespace: `tippani-s0/${runId}`,
              effectiveTargetHash: targetHash,
              manifestNonce: manifest.manifestNonce,
              driveId: "drive-a",
              folder: "Synthetic",
            }),
          };
        }
        if (url.includes(":/children")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              value: cleanupChildPresent
                ? [{
                  id: "marker-a",
                  name: ".tippani-s0-run",
                  eTag: "marker-etag-a",
                }]
                : [],
            }),
          };
        }
        if (url.includes(".tippani-s0-run")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "marker-a", eTag: "marker-etag-a" }),
          };
        }
        cleanupGetAttempts++;
        if (cleanupGetAttempts === 1) throw new TypeError("synthetic cleanup retry");
        assert.equal(fs.existsSync(manifestPath), true);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "folder-a", eTag: "etag-a" }),
        };
      }
      if (options.method === "DELETE") {
        const persisted = CleanupManifest.load(manifestPath);
        assert.deepEqual(persisted.resources[0].condition, {
          expectedItemId: "folder-a",
          expectedMarkerItemId: "marker-a",
          expectedMarkerDigest: persisted.resources[0].marker.digest,
          expectedChildren: [{
            id: "marker-a",
            name: ".tippani-s0-run",
            eTag: "marker-etag-a",
          }],
        });
        assert.equal(options.headers["If-Match"], "marker-etag-a");
        cleanupChildPresent = false;
        cleanupMutationSawManifest = true;
        return { ok: true, status: 204 };
      }
      throw new Error(`Unexpected runner cleanup request: ${options.method} ${url}`);
    };
    globalThis.fetch = fakeFetch;
    const { run, artifacts } = await runHarness({
      config: live,
      outputDir,
      scenarioIds: ["S0-SEC-006"],
      identityFetchImpl: fakeFetch,
    });
    assert.equal(run.results[0].status, "Pass", JSON.stringify(run.results[0]));
    assert.equal(run.results[0].evidence.cleanupBudgeted, true);
    assert.equal(run.results[0].evidence.cleanupSharedDeadline, true);
    assert.equal(run.results[0].evidence.providerChildBudget.metered, true);
    assert.notEqual(run.results[0].evidence.providerChildBudget.childPid, process.pid);
    assert.equal(cleanupMutationSawManifest, true);
    assert.equal(run.cleanup.status, "failed");
    assert.equal(run.cleanup.error.code, "cleanup_precondition_unavailable");
    assert.equal(run.cleanup.budgeted, true);
    assert.equal(run.cleanup.budgetSource, "preflight.budgets");
    assert.equal(run.cleanup.sharedDeadline, true);
    assert.equal(
      run.cleanup.budgetBefore.deadlineAt,
      run.cleanup.budgetAfter.deadlineAt,
    );
    assert.ok(run.cleanup.providerTelemetry.requests >= 9);
    assert.equal(run.cleanup.providerTelemetry.retries, 1);
    assert(run.cleanup.providerTelemetry.transferredBytes > 0);
    assert.equal(run.cleanup.manifest.cleanedCount, 0);
    assert.equal(run.cleanup.manifest.phases.mutating, 1);
    assert.equal(run.cleanup.manifest.revision, 3);
    assert.deepEqual(run.budgetTelemetry.final, run.safetyBudget);
    assert.ok(run.safetyBudget.operations >= 11);
    assert.equal(artifacts.cleanupManifestPath, manifestPath);
    assert(
      fs.readFileSync(artifacts.reportPath, "utf8").includes(run.cleanup.manifest.digest),
    );
    assert.equal(
      CleanupManifest.load(manifestPath).evidence().digest,
      run.cleanup.manifest.digest,
    );
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = previousFetch;
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

await check("provider child reuses the persisted marker nonce under enforcePreflight", async () => {
  const runId = "s0-provider-child-marker-context";
  const root = path.join(spikeRoot, ".test-state", runId);
  const manifestPath = path.join(root, "cleanup-manifest.json");
  const targetHash = providerTargetHash({
    provider: "onedrive",
    identity: "onedrive:probe-identity",
    coordinates: { driveId: "drive-a", folder: "Synthetic" },
    namespace: `tippani-s0/${runId}`,
  });
  const config = {
    adapter: "onedrive",
    backingPath: "onedrive",
    runId,
    budgets: {
      maxOperations: 20,
      maxObjects: 20,
      maxBytes: 100000,
      maxDurationMs: 5000,
    },
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      namespace: `tippani-s0/${runId}`,
      effectiveTargetHash: targetHash,
      coordinates: { driveId: "drive-a", folder: "Synthetic" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  };
  const descriptor = new OneDriveGraphStore({
    dryRun: true,
    driveId: "drive-a",
    folderPath: "Synthetic",
    runId,
    ownershipMarker: config.sandbox.ownershipMarker,
    cleanupManifestId: config.sandbox.cleanup.manifestId,
    effectiveTargetHash: targetHash,
  });
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const previousEnv = {
    S0_PREFLIGHT_APPROVER: process.env.S0_PREFLIGHT_APPROVER,
    S0_PREFLIGHT_APPROVED_AT: process.env.S0_PREFLIGHT_APPROVED_AT,
    S0_PREFLIGHT_APPROVAL_REFERENCE: process.env.S0_PREFLIGHT_APPROVAL_REFERENCE,
    S0_PREFLIGHT_TARGET_HASH: process.env.S0_PREFLIGHT_TARGET_HASH,
  };
  try {
    const authorization = createCleanupAuthorization(config, descriptor, {
      filePath: manifestPath,
    });
    const markerContext = {
      manifestNonce: authorization.manifest.manifestNonce,
      manifestId: authorization.manifest.manifestId,
      effectiveTargetHash: authorization.manifest.effectiveTargetHash,
      ownershipMarker: authorization.manifest.ownershipMarker,
      namespace: config.sandbox.namespace,
    };
    Object.assign(process.env, {
      S0_PREFLIGHT_APPROVER: "Synthetic Reviewer",
      S0_PREFLIGHT_APPROVED_AT: "2026-09-04T17:00:00.000Z",
      S0_PREFLIGHT_APPROVAL_REFERENCE: "syn-provider-child-marker",
      S0_PREFLIGHT_TARGET_HASH: targetHash,
    });
    const context = {
      adapter: "onedrive",
      config,
      primaryRoot: root,
      providerMarkerContext: markerContext,
    };
    const budget = new OperationBudget({ limits: config.budgets });
    const args = providerWorkerArgs(context, "syn-ws-provider-child", [
      "--mode=provider-marker-probe",
      "--probe-drive-id=drive-a",
      "--probe-folder=Synthetic",
      "--probe-identity=onedrive:probe-identity",
    ]);
    const before = budget.snapshot();
    const success = await runWorker(args, { budget, timeoutMs: 5000 });
    const after = budget.snapshot();
    assert.equal(success.code, 0, success.stderr);
    assert.equal(success.report?.status, "provider-marker-probed");
    assert.equal(success.report?.enforcePreflight, true);
    assert.equal(success.report?.manifestNonce, markerContext.manifestNonce);
    assert.equal(success.report?.marker.markerCreated, true);
    assert.equal(
      success.report?.marker.markerRequestNonce,
      markerContext.manifestNonce,
    );
    assert.equal(success.report?.marker.meteredOperation, true);
    assert.equal(after.operations, before.operations + 4);
    assert.equal(after.objects, before.objects + 3);

    const mismatch = await runWorker(providerWorkerArgs(context, "syn-ws-provider-child", [
      "--mode=provider-marker-probe",
      "--probe-existing-marker=true",
      "--probe-remote-marker-nonce=foreign-nonce",
      "--probe-drive-id=drive-a",
      "--probe-folder=Synthetic",
      "--probe-identity=onedrive:probe-identity",
    ]), {
      budget: new OperationBudget({ limits: config.budgets }),
      timeoutMs: 5000,
    });
    assert.equal(mismatch.code, 1);
    assert.equal(mismatch.report?.code, "cleanup_ownership_mismatch");
    assert.equal(mismatch.report?.manifestNonce, markerContext.manifestNonce);
    assert.equal(mismatch.report?.marker.markerCreated, false);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await check("caller-supplied identity labels cannot satisfy live approval", () => {
  const live = structuredClone(providerConfig);
  live.dryRun = false;
  live.effectiveIdentity = "github:caller-supplied";
  const errors = validatePreflight(live, {
    env: {
      S0_GITHUB_OWNER: "synthetic-owner",
      S0_GITHUB_REPO: "synthetic-repository",
      S0_PREFLIGHT_APPROVER: "Synthetic Reviewer",
      S0_PREFLIGHT_APPROVED_AT: "2026-09-03T20:00:00.000Z",
      S0_PREFLIGHT_APPROVAL_REFERENCE: "syn-review-91",
      S0_PREFLIGHT_TARGET_HASH: "sha256:caller",
    },
  });
  assert(errors.some((error) => /provider-derived/.test(error)));
});

await check("preflight sheet build rejects a config that embeds a credential", async () => {
  const withSecret = JSON.parse(JSON.stringify(providerConfig));
  withSecret.sandbox.coordinates.accessToken = "syn-should-not-be-here";
  await assert.rejects(buildPreflightSheet(withSecret), /Credential material/);
});

await check("preflight rejects an expired cleanup deadline", async () => {
  const expired = JSON.parse(JSON.stringify(providerConfig));
  delete expired.sandbox.cleanup.retentionHours;
  expired.sandbox.cleanup.expiresAt = "2000-01-02T00:00:00.000Z";
  await assert.rejects(buildPreflightSheet(expired), /cleanup manifest and expiry/);
});

await check("provider gates are published as Blocked with precise reasons", async () => {
  const { run } = await runHarness({ config: providerConfig, writeArtifacts: false });
  assert.equal(run.results.length, applicableScenarioIds(providerConfig).length);
  const providerResults = run.results.filter((result) => BLOCKED_REASONS[result.scenarioId]);
  for (const result of providerResults) {
    assert.equal(result.status, "Blocked", `${result.scenarioId} was ${result.status}`);
    assert.equal(result.reason, BLOCKED_REASONS[result.scenarioId]);
  }
  assert(run.results.filter((result) => result.scenarioId.startsWith("S0-SEC-")).every((result) => result.status === "Pass"));
  assert.equal(run.results.find((result) => result.scenarioId === "S0-PER-005")?.status, "Pass");
});

await check("every selected provider gate has a blocked reason", async () => {
  for (const id of applicableScenarioIds(providerConfig)) {
    if (id.startsWith("S0-SEC-") || id === "S0-PER-005") continue;
    assert.ok(BLOCKED_REASONS[id], `${id} lacks a blocked reason`);
  }
});

console.log(`s0-provider-dryrun: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
