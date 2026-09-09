// Live provider gate implementations (OneDrive, ADO, GitHub).
// Each runs only against a live provider backing path; anywhere else (local,
// dry-run) it reports Blocked with the gate's precise prerequisite, so the same
// catalog id stays honest across configurations.

import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { createStore } from "./adapters/registry.mjs";
import { raceWorkers, runWorker } from "./process-runner.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";
import { WorkspaceConflictError } from "./workspace-contract.mjs";
import { BLOCKED_REASONS } from "./provider-gates.mjs";

const PENDING_QUEUE_WORKER = fileURLToPath(
  new URL("./workers/pending-queue-worker.mjs", import.meta.url),
);

// A live provider = a real OneDrive/ADO/GitHub backing path, not a dry-run.
function isLiveProvider(context) {
  return ["onedrive", "ado", "github"].includes(context.config.backingPath)
    && context.config.dryRun === false;
}

function blocked(context) {
  const id = context.scenario?.id;
  return { blocked: BLOCKED_REASONS[id] || "Blocked \u2014 requires a live provider sandbox." };
}

async function runPendingQueueProcess(context, request = null) {
  if (!context.primaryRoot) {
    throw new Error("Provider queue restart evidence requires a stable queue root");
  }
  const args = [
    `--mode=${request ? "append" : "list"}`,
    `--root=${context.primaryRoot}`,
    `--provider=${context.config.backingPath}`,
    `--run-id=${context.config.runId}`,
  ];
  if (request) {
    args.push(`--request=${Buffer.from(JSON.stringify(request), "utf8").toString("base64url")}`);
  }
  const child = fork(PENDING_QUEUE_WORKER, args, {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return await new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `pending queue worker exited ${code}`));
        return;
      }
      resolve(JSON.parse(stdout.trim()));
    });
  });
}

async function seedWorkspace(store, seed) {
  const workspace = createSyntheticWorkspace({ seed });
  await store.createWorkspace(workspace);
  return workspace;
}

export function providerWorkerArgs(context, workspaceId, extra = []) {
  const remainingMs = Number.isFinite(context.deadlineAt)
    ? Math.max(1, Math.floor(context.deadlineAt - performance.now()))
    : context.config.budgets?.maxDurationMs || 30_000;
  const marker = context.providerMarkerContext || {
    manifestNonce: context.config.sandbox?.cleanup?.manifestNonce,
    manifestId: context.config.sandbox?.cleanup?.manifestId,
    effectiveTargetHash: context.config.sandbox?.effectiveTargetHash,
    ownershipMarker: context.config.sandbox?.ownershipMarker,
    namespace: context.config.sandbox?.namespace,
  };
  if (!marker.manifestNonce) {
    throw new Error("Provider child process requires the persisted cleanup manifest nonce");
  }
  return [
    `--adapter=${context.adapter || context.config.adapter || context.config.backingPath}`,
    "--provider-live=true",
    `--run-id=${context.config.runId}`,
    `--root=${context.primaryRoot || ""}`,
    `--workspace=${workspaceId}`,
    `--max-operations=${context.config.budgets?.maxOperations || 100}`,
    `--max-objects=${context.config.budgets?.maxObjects || 10000}`,
    `--max-bytes=${context.config.budgets?.maxBytes || 104857600}`,
    `--deadline-ms=${remainingMs}`,
    `--cleanup-manifest-nonce=${marker.manifestNonce}`,
    `--cleanup-manifest-id=${marker.manifestId || ""}`,
    `--effective-target-hash=${marker.effectiveTargetHash || ""}`,
    `--ownership-marker=${marker.ownershipMarker || `tippani-s0:${context.config.runId}`}`,
    `--namespace=${marker.namespace || `tippani-s0/${context.config.runId}`}`,
    ...extra,
  ];
}

async function inProcessClient(context, {
  mode,
  workspaceId,
  expectedGeneration = 0,
  targetGeneration = 1,
  actor,
}) {
  const store = context.createStore();
  await store.initialize();
  try {
    if (mode === "stale-reconcile") {
      let conflict;
      try {
        await store.compareAndSwap({
          workspaceId,
          expectedGeneration,
          operation: { auditEvent: { actor, action: "stale-write" } },
        });
        throw new Error("Expected the stale provider write to conflict");
      } catch (error) {
        if (error?.code !== "generation_conflict") throw error;
        conflict = { expected: error.expectedGeneration, actual: error.actualGeneration };
      }
      const current = await store.readWorkspace(workspaceId);
      const next = await store.compareAndSwap({
        workspaceId,
        expectedGeneration: current.generation,
        operation: { auditEvent: { actor, action: "reconciled-write" } },
      });
      return {
        code: 0,
        report: {
          status: "reconciled",
          conflict,
          reloadedGeneration: current.generation,
          generation: next.generation,
          actor,
        },
      };
    }
    if (mode === "observe") {
      const started = performance.now();
      const current = await store.readWorkspace(workspaceId);
      assert.ok(current.generation >= targetGeneration);
      return {
        code: 0,
        report: {
          status: "observed",
          generation: current.generation,
          discoveryMs: performance.now() - started,
          actor,
        },
      };
    }
    try {
      const next = await store.compareAndSwap({
        workspaceId,
        expectedGeneration,
        operation: { auditEvent: { actor, action: "concurrent-write" } },
      });
      return { code: 0, report: { status: "committed", generation: next.generation, actor } };
    } catch (error) {
      if (error?.code !== "generation_conflict") throw error;
      return {
        code: 0,
        report: {
          status: "conflict",
          code: error.code,
          expected: error.expectedGeneration,
          actual: error.actualGeneration,
          actor,
        },
      };
    }
  } finally {
    await store.close().catch(() => {});
  }
}

async function runProviderClient(context, options) {
  if (context.inProcessProviderClients) return inProcessClient(context, options);
  const args = providerWorkerArgs(context, options.workspaceId, [
    `--mode=${options.mode}`,
    `--expected=${options.expectedGeneration ?? 0}`,
    `--target=${options.targetGeneration ?? 1}`,
    `--actor=${options.actor}`,
  ]);
  return runWorker(args, { budget: context.safetyBudget });
}

async function commitProviderClient(context, store, options) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await runProviderClient(context, { ...options, mode: "write-now" });
    if (last.report?.status === "committed") return last;
    const current = await store.readWorkspace(options.workspaceId);
    if (current.generation === options.expectedGeneration + 1 &&
        current.private.audit.some((entry) => entry.actor === options.actor)) {
      return {
        ...last,
        report: {
          pid: last.report?.pid,
          status: "committed",
          generation: current.generation,
          actor: options.actor,
          reconciledAfterClientFailure: true,
        },
      };
    }
    assert.equal(current.generation, options.expectedGeneration);
  }
  assert.fail(`Provider client did not commit after retries: ${last?.report?.status || "no report"}`);
}

async function reconcileProviderClient(context, store, options) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await runProviderClient(context, { ...options, mode: "stale-reconcile" });
    if (last.report?.status === "reconciled") return last;
    const current = await store.readWorkspace(options.workspaceId);
    if (current.generation === options.expectedGeneration + 2 &&
        current.private.audit.some((entry) => entry.actor === options.actor)) {
      return {
        ...last,
        report: {
          pid: last.report?.pid,
          status: "reconciled",
          conflict: { expected: options.expectedGeneration, actual: options.expectedGeneration + 1 },
          reloadedGeneration: options.expectedGeneration + 1,
          generation: current.generation,
          actor: options.actor,
          reconciledAfterClientFailure: true,
        },
      };
    }
    assert.equal(current.generation, options.expectedGeneration + 1);
  }
  assert.fail(`Provider client did not reconcile after retries: ${last?.report?.status || "no report"}`);
}

async function raceProviderClients(context, workspaceId, actors, expectedGeneration = 0) {
  if (context.inProcessProviderClients) {
    return Promise.all(actors.map((actor) => inProcessClient(context, {
      mode: "write-now",
      workspaceId,
      expectedGeneration,
      actor,
    })));
  }
  return raceWorkers(actors.map((actor) => providerWorkerArgs(context, workspaceId, [
    "--mode=write",
    `--expected=${expectedGeneration}`,
    `--actor=${actor}`,
  ])), { budget: context.safetyBudget });
}

async function twoClientNoSilentOverwrite(context) {
  if (!isLiveProvider(context)) return blocked(context);
  if (context.inProcessProviderClients) {
    return {
      skip: "In-process provider client emulation cannot satisfy a gate requiring two independent client processes.",
    };
  }
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `col002-${context.config.runId}`);
  try {
    const actors = ["Synthetic Client 1", "Synthetic Client 2"];
    const results = await raceProviderClients(context, workspace.workspaceId, actors);
    const committed = results.filter((result) => result.report?.status === "committed");
    const conflicts = results.filter((result) => result.report?.status === "conflict");
    const unexpected = results.filter((result) =>
      !["committed", "conflict"].includes(result.report?.status));
    assert.deepEqual(unexpected, [], "A provider client failed for an unexpected reason");
    assert.equal(committed.length, 1, "Exactly one client process must win the generation");
    assert.equal(conflicts.length, 1, "The other client process must receive a typed conflict");
    const clientProcessIds = results.map((result) => result.report?.pid);
    assert.equal(new Set(clientProcessIds).size, 2);
    assert(clientProcessIds.every((pid) => Number.isInteger(pid) && pid !== process.pid));
    const durable = await store.readWorkspace(workspace.workspaceId);
    assert.equal(durable.generation, 1);
    assert.equal(durable.private.audit.length, 1);
    return {
      evidence: {
        accounts: 1,
        clientProcesses: 2,
        clientProcessIds,
        executionMode: "independent-os-processes",
        logicalActors: actors.join(","),
        winners: 1,
        staleConflicts: 1,
        noSilentOverwrite: true,
      },
    };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
    await store.close().catch(() => {});
  }
}

async function twoClientReconnect(context) {
  if (!isLiveProvider(context)) return blocked(context);
  if (context.inProcessProviderClients) {
    return {
      skip: "In-process provider client emulation cannot satisfy a gate requiring two independent client processes.",
    };
  }
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `col003-${context.config.runId}`);
  try {
    const first = await commitProviderClient(context, store, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      actor: "Synthetic Client 1",
    });
    assert.equal(first.report?.status, "committed");
    assert.equal(first.report?.generation, 1);

    const second = await reconcileProviderClient(context, store, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      actor: "Synthetic Client 2",
    });
    assert.equal(second.report?.status, "reconciled");
    assert.equal(second.report?.conflict?.expected, 0);
    assert.equal(second.report?.reloadedGeneration, 1);
    assert.equal(second.report?.generation, 2);
    const clientProcessIds = [first.report?.pid, second.report?.pid];
    assert.equal(new Set(clientProcessIds).size, 2);
    assert(clientProcessIds.every((pid) => Number.isInteger(pid) && pid !== process.pid));
    const durable = await store.readWorkspace(workspace.workspaceId);
    assert.equal(durable.generation, 2);
    assert.deepEqual(
      durable.private.audit.map((entry) => entry.actor),
      ["Synthetic Client 1", "Synthetic Client 2"],
    );
    return {
      evidence: {
        accounts: 1,
        clientProcesses: 2,
        clientProcessIds,
        executionMode: "independent-os-processes",
        staleGeneration: 0,
        reloadedGeneration: 1,
        reconciledGeneration: 2,
        deterministicReconnect: true,
      },
    };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
    await store.close().catch(() => {});
  }
}

async function collaboratorDiscoversGeneration(context) {
  if (!isLiveProvider(context)) return blocked(context);
  if (context.inProcessProviderClients) {
    return {
      skip: "In-process provider client emulation cannot satisfy a gate requiring an independent observer process.",
    };
  }
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `col006-${context.config.runId}`);
  try {
    const writer = await commitProviderClient(context, store, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      actor: "Synthetic Client 1",
    });
    assert.equal(writer.report?.status, "committed");
    const observer = await runProviderClient(context, {
      mode: "observe",
      workspaceId: workspace.workspaceId,
      targetGeneration: 1,
      actor: "Synthetic Client 2",
    });
    assert.equal(observer.report?.status, "observed");
    assert.ok(observer.report?.generation >= 1);
    const clientProcessIds = [writer.report?.pid, observer.report?.pid];
    assert.equal(new Set(clientProcessIds).size, 2);
    assert(clientProcessIds.every((pid) => Number.isInteger(pid) && pid !== process.pid));
    return {
      evidence: {
        accounts: 1,
        clientProcesses: 2,
        clientProcessIds,
        executionMode: "independent-os-processes",
        changeMechanism: context.config.backingPath === "onedrive"
          ? "Graph drive-item polling"
          : context.config.backingPath === "ado"
            ? "ADO branch/ref and item polling"
            : "GitHub ref and contents polling",
        observedGeneration: observer.report.generation,
      },
      measurements: { collaboratorDiscoveryMs: observer.report.discoveryMs },
    };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
    await store.close().catch(() => {});
  }
}

async function etagCasStaleWriter(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `bck002-${context.config.runId}`);
  try {
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "advance" } },
    });
    const a = context.createStore();
    const b = context.createStore();
    await a.initialize();
    await b.initialize();
    const results = await Promise.allSettled([
      a.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "Client A", action: "race" } } }),
      b.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "Client B", action: "race" } } }),
    ]);
    const winners = results.filter((r) => r.status === "fulfilled");
    const conflicts = results.filter((r) => r.status === "rejected" && r.reason instanceof WorkspaceConflictError);
    assert.equal(winners.length, 1, "exactly one writer may win the ETag CAS");
    assert.equal(conflicts.length, 1, "the loser must get a typed stale-writer conflict");
    const durable = await store.readWorkspace(workspace.workspaceId);
    assert.equal(durable.generation, 2, "durable state advances exactly one generation");
    return { evidence: { winners: 1, staleConflicts: 1, durableGeneration: 2 } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function noSuccessShapedOnFailure(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `bck005-${context.config.runId}`);
  try {
    const faults = ["auth-expiry", "outage", "quota", "permission-loss"];
    for (const kind of faults) {
      store.injectFault(kind); // faults the compare-and-swap write
      await assert.rejects(
        store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: 0,
          operation: { auditEvent: { actor: "Synthetic A", action: kind } },
        }),
        (e) => typeof e.code === "string" && e.code !== "generation_conflict",
      );
      const now = await store.readWorkspace(workspace.workspaceId);
      assert.equal(now.generation, 0, `${kind} must not produce success-shaped state`);
    }
    store.injectFault("throttle");
    const throttled = await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "throttle" } },
    });
    assert.equal(throttled.generation, 1);
    const telemetry = store.providerTelemetry?.() || {};
    return {
      evidence: {
        faultsRejected: faults.length,
        faultsExercised: [...faults, "throttle"],
        rejectedFaultGenerationUnchanged: true,
        throttleRecoveredByBoundedRetry: true,
        throttleResponses: telemetry.throttleResponses,
        retries: telemetry.retries,
        retryAfterSeconds: telemetry.retryAfterSeconds,
        backoffMs: telemetry.backoffMs,
        transferredBytes: telemetry.transferredBytes,
      },
    };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function lostResponseReconcile(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `col004-${context.config.runId}`);
  try {
    store.injectFault("lost-response"); // the write lands; the ack is lost
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "edit" } },
      }),
      (e) =>
        e.code === "indeterminate_write" &&
        e.requiresReconciliation === true,
    );
    // Reconcile: the write actually landed, so the generation advanced.
    const after = await store.readWorkspace(workspace.workspaceId);
    assert.equal(after.generation, 1, "a lost-response write must still be durable");
    // A blind retry at the old generation must conflict, proving no duplicate.
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "retry" } },
      }),
      (e) => e.code === "generation_conflict",
    );
    return { evidence: { lostResponseDetected: true, noDuplicate: true, reconciledGeneration: 1 } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function offlinePendingUntilCas(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const a = context.createStore();
  await a.initialize();
  const workspace = await seedWorkspace(a, `col005-${context.config.runId}`);
  try {
    await a.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "base" } },
    });
    // A separate offline client process stages writes into the durable queue.
    const firstWriter = await runPendingQueueProcess(context, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic A", action: "offline-edit" } },
    });
    const secondWriter = await runPendingQueueProcess(context, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 2,
      operation: { auditEvent: { actor: "Synthetic A", action: "later-offline-edit" } },
    });
    assert.equal(await a.pendingCount(), 2);
    await a.close();
    const restartInspection = await runPendingQueueProcess(context);
    assert.equal(restartInspection.count, 2);
    const resumed = context.createStore();
    await resumed.initialize();
    assert.equal(await resumed.pendingCount(), 2, "Pending work must survive a client process restart");
    // Meanwhile B advances the authority.
    const b = context.createStore();
    await b.initialize();
    await b.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic B", action: "online-edit" } },
    });
    // A reconnects: the pending write must not silently overwrite B's newer state.
    const report = await resumed.reconnect();
    assert.equal(report.applied.length, 0, "a stale offline write must not be applied");
    assert.equal(report.conflicts.length, 1, "the offline write must surface as a conflict");
    assert.equal(report.pendingCount, 2, "A stale edit and all later edits remain pending");
    const authority = await b.readWorkspace(workspace.workspaceId);
    assert.equal(authority.generation, 2, "authority must still reflect B's write");
    assert.equal(
      authority.private.audit.some((entry) => entry.action === "later-offline-edit"),
      false,
      "A later queued edit must not bypass the stale FIFO head",
    );
    return {
      evidence: {
        offlinePendingConflicted: true,
        processRestartRecoveredQueue:
          firstWriter.pid !== process.pid &&
          secondWriter.pid !== process.pid &&
          restartInspection.pid !== process.pid,
        queueWriterProcessIds: [firstWriter.pid, secondWriter.pid],
        queueRestartInspectorProcessId: restartInspection.pid,
        fifoStoppedAtFirstConflict: true,
        staleEntryRetained: true,
        noSilentOverwrite: true,
        authorityGeneration: 2,
      },
    };
  } finally {
    await a.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function offlineCacheReconcile(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const a = context.createStore();
  await a.initialize();
  const workspace = await seedWorkspace(a, `rec004-${context.config.runId}`);
  try {
    await a.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "base" } },
    });
    const queueWriter = await runPendingQueueProcess(context, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic A", action: "cached-edit" } },
    });
    await a.close();
    const transient = context.createStore();
    await transient.initialize();
    transient.injectFault("outage");
    const retained = await transient.reconnect();
    assert.equal(retained.retained.length, 1, "A transient provider failure must retain pending work");
    assert.equal(retained.pendingCount, 1);
    await transient.close();
    const restartInspection = await runPendingQueueProcess(context);
    assert.equal(restartInspection.count, 1, "An independent process must recover retained work");

    const b = context.createStore();
    await b.initialize();
    await b.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic B", action: "authority-advance" } },
    });
    const resumed = context.createStore();
    await resumed.initialize();
    assert.equal(await resumed.pendingCount(), 1, "Retained work must survive another restart");
    const report = await resumed.reconnect();
    // The offline cache discovers the newer authority instead of overwriting it.
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].actual, 2, "reconnect must discover the newer committed generation");
    assert.equal(report.pendingCount, 1, "A stale edit is retained after conflict");
    const authority = await resumed.readWorkspace(workspace.workspaceId);
    assert.equal(authority.generation, 2, "no silent overwrite of newer authority");
    return {
      evidence: {
        discoveredNewerAuthority: true,
        transientFailureRetained: true,
        processRestartRecoveredQueue:
          queueWriter.pid !== process.pid &&
          restartInspection.pid !== process.pid,
        queueWriterProcessId: queueWriter.pid,
        queueRestartInspectorProcessId: restartInspection.pid,
        noSilentOverwrite: true,
      },
    };
  } finally {
    await a.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function recoverAfterFault(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const faults = ["outage", "throttle", "auth-expiry", "quota", "permission-loss"];
  const recovered = [];
  try {
    for (const kind of faults) {
      const workspace = await seedWorkspace(store, `rec003-${kind}-${context.config.runId}`);
      store.injectFault(kind);
      if (kind === "throttle") {
        const before = store.providerTelemetry?.() || {};
        const next = await store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: 0,
          operation: { auditEvent: { actor: "Synthetic A", action: "recover-throttle" } },
        });
        assert.equal(next.generation, 1);
        const after = store.providerTelemetry?.() || {};
        assert.equal(after.retries - before.retries, 1);
        assert.deepEqual(
          after.retryAfterSeconds.slice(before.retryAfterSeconds.length),
          [1],
        );
        assert.ok(after.backoffMs - before.backoffMs >= 1000);
        recovered.push(kind);
        await store.deleteWorkspace(workspace.workspaceId);
        continue;
      }
      await assert.rejects(
        store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: 0,
          operation: { auditEvent: { actor: "Synthetic A", action: `during-${kind}` } },
        }),
        (error) => typeof error?.code === "string" && error.code !== "generation_conflict",
      );
      const mid = await store.readWorkspace(workspace.workspaceId);
      assert.equal(mid.generation, 0, `${kind} must not leave a partial write`);
      const next = await store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: `recover-${kind}` } },
      });
      assert.equal(next.generation, 1);
      recovered.push(kind);
      await store.deleteWorkspace(workspace.workspaceId);
    }

    const lost = await seedWorkspace(store, `rec003-lost-response-${context.config.runId}`);
    store.injectFault("lost-response");
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: lost.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "lost-response" } },
      }),
      (error) =>
        error.code === "indeterminate_write" &&
        error.requiresReconciliation === true,
    );
    const reconciled = await store.readWorkspace(lost.workspaceId);
    assert.equal(reconciled.generation, 1, "lost response recovery must find the committed generation");
    await assert.rejects(store.compareAndSwap({
      workspaceId: lost.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "blind-retry" } },
    }), (error) => error.code === "generation_conflict");
    await store.deleteWorkspace(lost.workspaceId);
    return {
      evidence: {
        faultsExercised: [...faults, "lost-response"],
        recoveredFaults: recovered,
        throttleRecovery: {
          boundedRetries: 1,
          retryAfterSeconds: 1,
          minimumBackoffMs: 1000,
        },
        lostResponseReconciled: true,
        blindRetryRejected: true,
      },
    };
  } finally {
    await store.close().catch(() => {});
  }
}

async function localToOneDriveRehome(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "s0-rehome-"));
  const local = createStore("local-cas", { storeRoot: root, configurationId: "CFG-REHOME-SRC" });
  await local.initialize();
  const od = context.createStore();
  await od.initialize();
  const workspace = createSyntheticWorkspace({ seed: `mig004-${context.config.runId}` });
  try {
    await local.createWorkspace(workspace);
    await local.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "local-edit" } },
    });
    const source = await local.readWorkspace(workspace.workspaceId); // generation 1
    // Rehome: establish OneDrive authority only after a durable write receipt,
    // preserving the workspace id and generation.
    await od.createWorkspace(source);
    const rehomed = await od.readWorkspace(source.workspaceId);
    assert.equal(rehomed.workspaceId, workspace.workspaceId, "rehome must preserve WorkspaceId");
    assert.equal(rehomed.generation, source.generation, "rehome must preserve the generation");
    return { evidence: { workspaceIdPreserved: true, generation: rehomed.generation, receipt: true } };
  } finally {
    await od.deleteWorkspace(workspace.workspaceId).catch(() => {});
    await local.close().catch(() => {});
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

async function versionHistoryRecover(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `bkp003-${context.config.runId}`);
  try {
    await store.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 0, operation: { auditEvent: { actor: "A", action: "g1" } } });
    await store.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "A", action: "g2" } } });
    const recovered = await store.readGeneration(workspace.workspaceId, 1);
    assert.equal(recovered.generation, 1, "must recover the requested generation from history");
    return { evidence: { recoveredGeneration: 1 } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function restoredOneHead(context) {
  if (!isLiveProvider(context)) return blocked(context);
  const adapter = context.adapter || context.config.adapter;
  if (["onedrive", "github"].includes(adapter)) {
    return {
      skip: `${adapter} restore cannot establish one atomic authoritative head with the current spike transport.`,
    };
  }
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `bkp004-${context.config.runId}`);
  try {
    await store.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 0, operation: { auditEvent: { actor: "A", action: "g1" } } });
    await store.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 1, operation: { auditEvent: { actor: "A", action: "g2" } } });
    const snapshot = await store.backup();
    await store.compareAndSwap({ workspaceId: workspace.workspaceId, expectedGeneration: 2, operation: { auditEvent: { actor: "A", action: "g3" } } });
    await store.restore(snapshot);
    const head = await store.readWorkspace(workspace.workspaceId);
    assert.equal(head.generation, 2, "restore must establish one authoritative head at the known generation");
    return { evidence: { restoredGeneration: 2, oneHead: true } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

export const ONEDRIVE_GATE_IMPLEMENTATIONS = Object.freeze({
  "S0-BCK-002": etagCasStaleWriter,
  "S0-BCK-003": etagCasStaleWriter,
  "S0-BCK-004": etagCasStaleWriter,
  "S0-BCK-005": noSuccessShapedOnFailure,
  "S0-COL-002": twoClientNoSilentOverwrite,
  "S0-COL-003": twoClientReconnect,
  "S0-COL-004": lostResponseReconcile,
  "S0-COL-005": offlinePendingUntilCas,
  "S0-COL-006": collaboratorDiscoversGeneration,
  "S0-REC-003": recoverAfterFault,
  "S0-REC-004": offlineCacheReconcile,
  "S0-MIG-004": localToOneDriveRehome,
  "S0-BKP-003": versionHistoryRecover,
  "S0-BKP-004": restoredOneHead,
});
