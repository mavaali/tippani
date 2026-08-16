import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { FaultInjector, InjectedFaultError } from "./fault-injector.mjs";
import { raceWorkers, runWorker } from "./process-runner.mjs";
import {
  assertSyntheticOnly,
  createLegacyWorkspaceV0,
  createSyntheticWorkspace,
} from "./synthetic-fixtures.mjs";
import { CleanupManifest } from "./cleanup-manifest.mjs";
import { findEmbeddedSecrets, validatePreflight } from "./preflight.mjs";
import {
  CorruptWorkspaceStoreError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  checksumWorkspace,
  deepClone,
  needsReconciliation,
} from "./workspace-contract.mjs";

const PER_SCALES = ["small", "medium", "stress"];
// Repetition is reduced at larger scales so the stress sweep stays within the
// run-duration budget; each scale still reports comparable p50/p95 statistics.
const PER_LATENCY_ITERATIONS = { small: 40, medium: 20, stress: 8 };
const PER_FOOTPRINT_COMMITS = { small: 25, medium: 10, stress: 4 };

async function openStore(context, seed = context.config.runId, scale = context.config.scale || "small") {
  const store = context.createStore();
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed, scale });
  await store.createWorkspace(workspace);
  return { store, workspace };
}

async function close(store) {
  try { await store.close(); } catch {}
}

function firstIntent(workspace) {
  return workspace.pushable.remote.intentsById[
    workspace.pushable.remote.orderedIntentIds[0]
  ];
}

// Never trust the value a store returns from a mutation. A store that reports
// the intended result while persisting something else must fail, so every
// commit is re-read and the acknowledged value is compared against durable
// state before any scenario assertion runs.
async function commitAndRead(store, request) {
  const acknowledged = await store.compareAndSwap(request);
  const durable = await store.readWorkspace(request.workspaceId);
  assert.deepEqual(
    durable,
    acknowledged,
    "Acknowledged mutation does not match durable state",
  );
  return durable;
}

async function atomicMutation(context) {
  const { store, workspace } = await openStore(context);
  try {
    const path = workspace.selectedDocumentPath;
    const body = "# Synthetic updated specification\n\nGenerated fixture update.\n";
    const intent = firstIntent(workspace);
    const next = await commitAndRead(store, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: {
        document: {
          path,
          value: { ...workspace.documentsByPath[path], body, contentHash: "syn-hash-updated" },
        },
        intent: { ...intent, intentRevision: 2, contentHash: "syn-hash-updated" },
        selectedDocumentPath: path,
        auditEvent: { actor: "Synthetic Actor B", action: "mutate" },
      },
    });
    assert.equal(next.generation, 1);
    assert.equal(next.documentsByPath[path].body, body);
    assert.equal(next.pushable.remote.intentsById[intent.intentId].intentRevision, 2);
    assert.equal(next.private.audit.length, 1);
    return { evidence: { generation: 1, updatedPartitions: 4 } };
  } finally {
    await close(store);
  }
}

async function atomicAliasTransition(context) {
  const { store, workspace } = await openStore(context);
  try {
    const alias = `syn-alias-pr-${context.config.runId}`;
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { addAliases: [alias] },
    });
    const resolved = await store.resolveAlias(alias);
    assert.equal(resolved.workspaceId, workspace.workspaceId);
    assert.equal(resolved.generation, 1);
    return { evidence: { aliasResolved: true, generation: 1 } };
  } finally {
    await close(store);
  }
}

async function failedMutationIsInvisible(context) {
  const { store, workspace } = await openStore(context);
  try {
    const alias = `syn-alias-failed-${context.config.runId}`;
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { addAliases: [alias] },
        faultInjector: new FaultInjector(["before-commit"]),
      }),
      InjectedFaultError,
    );
    const current = await store.readWorkspace(workspace.workspaceId);
    assert.equal(current.generation, 0);
    assert.equal(await store.resolveAlias(alias), null);
    return { evidence: { previousGenerationPreserved: true, danglingAlias: false } };
  } finally {
    await close(store);
  }
}

async function oneWinner(context, writers) {
  const { store, workspace } = await openStore(context);
  try {
    const attempts = Array.from({ length: writers }, (_, index) =>
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: {
          auditEvent: { actor: `Synthetic Writer ${index + 1}`, action: "race" },
        },
      }));
    const settled = await Promise.allSettled(attempts);
    const fulfilled = settled.filter((item) => item.status === "fulfilled");
    const rejected = settled.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, writers - 1);
    assert(rejected.every((item) => item.reason instanceof WorkspaceConflictError));
    const current = await store.readWorkspace(workspace.workspaceId);
    assert.equal(current.generation, 1);
    return {
      evidence: { writers, winners: 1, staleConflicts: rejected.length },
    };
  } finally {
    await close(store);
  }
}

async function independentWorkspaces(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const left = createSyntheticWorkspace({ seed: `${context.config.runId}-left` });
    const right = createSyntheticWorkspace({ seed: `${context.config.runId}-right` });
    await store.createWorkspace(left);
    await store.createWorkspace(right);
    await Promise.all([
      store.compareAndSwap({
        workspaceId: left.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic Left", action: "mutate" } },
      }),
      store.compareAndSwap({
        workspaceId: right.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic Right", action: "mutate" } },
      }),
    ]);
    assert.equal((await store.readWorkspace(left.workspaceId)).generation, 1);
    assert.equal((await store.readWorkspace(right.workspaceId)).generation, 1);
    return { evidence: { independentWriters: 2, committed: 2 } };
  } finally {
    await close(store);
  }
}

async function concurrentStagePreserved(context) {
  const { store, workspace } = await openStore(context);
  try {
    const frozen = deepClone(firstIntent(workspace));
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: {
        intent: { ...frozen, intentRevision: 2, contentHash: "syn-hash-newer" },
      },
    });
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { clearIntentTuple: frozen },
    });
    const current = await store.readWorkspace(workspace.workspaceId);
    assert.equal(
      current.pushable.remote.intentsById[frozen.intentId].intentRevision,
      2,
    );
    return { evidence: { frozenRevision: 1, preservedRevision: 2 } };
  } finally {
    await close(store);
  }
}

async function boundedConflict(context) {
  const started = performance.now();
  if (!context.durable) {
    const result = await oneWinner(context, 2);
    return {
      ...result,
      measurements: { conflictCompletionMs: performance.now() - started },
    };
  }
  // Real cross-process contention: independent OS processes race for one
  // generation and every loser must settle with a typed conflict, bounded by
  // the lock/worker timeout rather than blocking indefinitely.
  const result = await crossProcessRace(context, 3);
  const contentionCompletionMs = performance.now() - started;
  assert.ok(contentionCompletionMs < 30_000, "Contention must be bounded, not indefinite");
  return {
    evidence: { ...result.evidence, boundedContention: true },
    measurements: { contentionCompletionMs },
  };
}

async function journalPreparation(context) {
  const { store, workspace } = await openStore(context);
  try {
    const intent = firstIntent(workspace);
    const journal = {
      journalId: `syn-journal-${context.config.runId}`,
      workspaceId: workspace.workspaceId,
      generation: 0,
      status: "planned",
      providerCapabilityVersion: "synthetic-v1",
      intentTuples: [{
        intentId: intent.intentId,
        intentRevision: intent.intentRevision,
        contentHash: intent.contentHash,
      }],
    };
    const next = await commitAndRead(store, {
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { planJournal: journal },
    });
    assert.equal(next.publication.activeJournalId, journal.journalId);
    assert.deepEqual(next.publication.journalsById[journal.journalId], journal);
    return { evidence: { journalStatus: "planned", tupleCount: 1 } };
  } finally {
    await close(store);
  }
}

async function danglingJournalRejected(context) {
  const { store, workspace } = await openStore(context);
  try {
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: {
          planJournal: {
            journalId: `syn-journal-invalid-${context.config.runId}`,
            status: "planned",
            intentTuples: [{
              intentId: "syn-intent-missing",
              intentRevision: 1,
              contentHash: "syn-hash-missing",
            }],
          },
        },
      }),
      (error) => error instanceof WorkspaceStoreError &&
        error.code === "dangling_journal_tuple",
    );
    assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 0);
    return { evidence: { rejectedBeforeCommit: true } };
  } finally {
    await close(store);
  }
}

async function crashBoundaries(context) {
  const { store, workspace } = await openStore(context);
  try {
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic Actor", action: "before" } },
        faultInjector: new FaultInjector(["before-commit"]),
      }),
      InjectedFaultError,
    );
    assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 0);

    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic Actor", action: "after" } },
        faultInjector: new FaultInjector(["after-commit"]),
      }),
      InjectedFaultError,
    );
    assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 1);
    return {
      evidence: {
        beforeCommitGeneration: 0,
        afterCommitResponseLostGeneration: 1,
      },
    };
  } finally {
    await close(store);
  }
}

async function aliasCrash(context) {
  if (!context.durable) {
    // The reference adapter has no separate process; an in-process fault is the
    // only mechanism available to it.
    const { store, workspace } = await openStore(context);
    try {
      const alias = `syn-alias-crash-${context.config.runId}`;
      await assert.rejects(
        store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: 0,
          operation: { addAliases: [alias] },
          faultInjector: new FaultInjector(["before-commit"]),
        }),
        InjectedFaultError,
      );
      assert.equal(await store.resolveAlias(alias), null);
      return { evidence: { partialAliasVisible: false, mechanism: "in-process" } };
    } finally {
      await close(store);
    }
  }

  const { store, workspace } = await openStore(context);
  await close(store);
  const alias = `syn-alias-crash-${context.config.runId}`;
  const crashed = await runWorker(workerArgs(context, workspace.workspaceId, [
    "--mode=crash",
    "--op=add-alias",
    `--alias=${alias}`,
    "--expected=0",
    "--crash-at=before-commit",
  ]));
  assert.equal(crashed.code, 9, "Worker must have been killed before the alias commit");
  const durable = await withVerifier(context, async (verifier) => ({
    alias: await verifier.resolveAlias(alias),
    workspace: await verifier.readWorkspace(workspace.workspaceId),
  }));
  assert.equal(durable.alias, null, "A killed alias update must not be visible");
  assert.equal(durable.workspace.generation, 0, "The workspace generation must be unchanged");
  return { evidence: { partialAliasVisible: false, killedProcess: true, mechanism: "process-kill" } };
}

async function restoreCrash(context) {
  if (!context.durable) {
    const { store, workspace } = await openStore(context);
    try {
      const snapshot = await store.backup();
      snapshot.workspaces[0].generation = 10;
      await assert.rejects(
        store.restore(snapshot, {
          faultInjector: new FaultInjector(["before-restore-commit"]),
        }),
        InjectedFaultError,
      );
      assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 0);
      return { evidence: { previousGenerationPreserved: true, mechanism: "in-process" } };
    } finally {
      await close(store);
    }
  }

  const { store, workspace } = await openStore(context);
  await close(store);
  const crashed = await runWorker(workerArgs(context, workspace.workspaceId, [
    "--mode=restore-crash",
    "--crash-at=before-restore-commit",
  ]));
  assert.equal(crashed.code, 9, "Worker must have been killed during restore");
  const durable = await withVerifier(context, (verifier) =>
    verifier.readWorkspace(workspace.workspaceId));
  assert.equal(durable.generation, 0, "A killed restore must leave the previous generation intact");
  return { evidence: { previousGenerationPreserved: true, killedProcess: true, mechanism: "process-kill" } };
}

async function corruptStateDetected(context) {
  const { store, workspace } = await openStore(context);
  try {
    store.injectCorruption(workspace.workspaceId);
    await assert.rejects(
      store.readWorkspace(workspace.workspaceId),
      CorruptWorkspaceStoreError,
    );
    return { evidence: { typedCorruptionFailure: true } };
  } finally {
    await close(store);
  }
}

async function duplicateAliasRestoreRejected(context) {
  const source = context.createStore();
  const target = context.createStore({ fresh: true });
  await source.initialize();
  await target.initialize();
  try {
    const left = createSyntheticWorkspace({ seed: `${context.config.runId}-one` });
    const right = createSyntheticWorkspace({ seed: `${context.config.runId}-two` });
    right.aliases = [left.aliases[0]];
    const snapshot = {
      schemaVersion: 1,
      syntheticData: true,
      workspaces: [left, right],
    };
    await assert.rejects(
      target.restore(snapshot),
      (error) => error.code === "alias_conflict",
    );
    assert.deepEqual(await target.listWorkspaces(), []);
    return { evidence: { partialRestoreVisible: false } };
  } finally {
    await close(source);
    await close(target);
  }
}

async function unsupportedSchemaRejected(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: context.config.runId });
    workspace.schemaVersion = 999;
    await assert.rejects(
      store.createWorkspace(workspace),
      (error) => error.code === "unsupported_schema",
    );
    return { evidence: { unsupportedVersionFailedClosed: true } };
  } finally {
    await close(store);
  }
}

async function enumerateBeforeUse(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    for (const suffix of ["a", "b", "c"]) {
      await store.createWorkspace(createSyntheticWorkspace({
        seed: `${context.config.runId}-${suffix}`,
      }));
    }
    const workspaces = await store.listWorkspaces();
    assert.equal(workspaces.length, 3);
    return { evidence: { enumeratedWorkspaces: 3 } };
  } finally {
    await close(store);
  }
}

async function rehydrateExactly(context) {
  const source = context.createStore();
  const target = context.createStore({ fresh: true });
  await source.initialize();
  await target.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: context.config.runId });
    await source.createWorkspace(workspace);
    await source.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: {
        selectedDocumentPath: Object.keys(workspace.documentsByPath)[1],
        auditEvent: { actor: "Synthetic Actor", action: "select" },
      },
    });
    const snapshot = await source.backup();
    await target.restore(snapshot);
    const expected = await source.readWorkspace(workspace.workspaceId);
    const actual = await target.readWorkspace(workspace.workspaceId);
    assert.deepEqual(actual, expected);
    return { evidence: { exactRehydration: true, generation: actual.generation } };
  } finally {
    await close(source);
    await close(target);
  }
}

async function consistentBackup(context) {
  const { store, workspace } = await openStore(context);
  try {
    const backup = await store.backup();
    assert.equal(backup.syntheticData, true);
    assert.equal(backup.workspaces.length, 1);
    assert.deepEqual(backup.workspaces[0], workspace);
    return { evidence: { workspaceCount: 1, knownGeneration: 0 } };
  } finally {
    await close(store);
  }
}

async function restoreExact(context) {
  const source = context.createStore();
  const target = context.createStore({ fresh: true });
  await source.initialize();
  await target.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: context.config.runId });
    await source.createWorkspace(workspace);
    const backup = await source.backup();
    await target.restore(backup);
    assert.deepEqual(
      await target.readWorkspace(workspace.workspaceId),
      workspace,
    );
    const broken = deepClone(backup);
    broken.syntheticData = false;
    await assert.rejects(target.restore(broken), CorruptWorkspaceStoreError);
    return { evidence: { exactRestore: true, corruptBackupRejected: true } };
  } finally {
    await close(source);
    await close(target);
  }
}

async function syntheticOnly(context) {
  const fixture = createSyntheticWorkspace({ seed: context.config.runId });
  assert.equal(assertSyntheticOnly(fixture), true);
  const invalid = deepClone(fixture);
  invalid.private.activeContext.actor = "someone@microsoft.com";
  assert.throws(() => assertSyntheticOnly(invalid), /Non-synthetic value/);
  return { evidence: { syntheticFixtureAccepted: true, actualDataRejected: true } };
}

async function startupMeasurement(context) {
  const measurements = {};
  for (const scale of PER_SCALES) {
    const started = performance.now();
    const store = context.createStore({ fresh: true });
    await store.initialize();
    const initializedMs = performance.now() - started;
    try {
      const workspace = createSyntheticWorkspace({
        seed: `${context.config.runId}-${scale}`,
        scale,
      });
      const createStarted = performance.now();
      await store.createWorkspace(workspace);
      const createMs = performance.now() - createStarted;
      const enumerateStarted = performance.now();
      const workspaces = await store.listWorkspaces();
      const enumerateMs = performance.now() - enumerateStarted;
      assert.equal(workspaces.length, 1);
      measurements[`initializedMs_${scale}`] = initializedMs;
      measurements[`createMs_${scale}`] = createMs;
      measurements[`enumerateMs_${scale}`] = enumerateMs;
    } finally {
      await close(store);
    }
  }
  return { evidence: { scales: PER_SCALES.join(",") }, measurements };
}

// --- Durable-adapter scenarios ---------------------------------------------
// These use real OS processes. A single event loop cannot demonstrate that
// independent clients contend safely, and an in-process throw cannot
// demonstrate that a killed writer leaves recoverable state.

const NOT_DURABLE =
  "Requires a durable adapter: an in-memory store cannot demonstrate " +
  "cross-process or restart behaviour.";

function workerArgs(context, workspaceId, extra = []) {
  return [
    `--adapter=${context.adapter}`,
    `--root=${context.primaryRoot}`,
    `--workspace=${workspaceId}`,
    ...extra,
  ];
}

async function withVerifier(context, action) {
  const verifier = context.createStore();
  await verifier.initialize();
  try {
    return await action(verifier);
  } finally {
    await close(verifier);
  }
}

async function crossProcessRace(context, processes) {
  const { store, workspace } = await openStore(context);
  // Release parent handles so the children own the store exactly as separate
  // clients would.
  await close(store);

  const results = await raceWorkers(
    Array.from({ length: processes }, (_, index) =>
      workerArgs(context, workspace.workspaceId, [
        "--mode=write",
        "--expected=0",
        `--actor=Synthetic Process ${index + 1}`,
      ])),
  );

  const committed = results.filter((result) => result.report?.status === "committed");
  const conflicts = results.filter((result) => result.report?.status === "conflict");
  const errors = results.filter((result) =>
    !["committed", "conflict"].includes(result.report?.status));
  assert.deepEqual(errors, [], "A concurrent writer failed for an unexpected reason");
  assert.equal(committed.length, 1, "Exactly one process must win the generation");
  assert.equal(conflicts.length, processes - 1);

  const durable = await withVerifier(context, (verifier) =>
    verifier.readWorkspace(workspace.workspaceId));
  assert.equal(durable.generation, 1, "Durable state must advance exactly one generation");
  assert.equal(durable.private.audit.length, 1, "Only the winning write may persist");
  return {
    evidence: {
      processes,
      winners: committed.length,
      staleConflicts: conflicts.length,
      durableGeneration: durable.generation,
    },
  };
}

async function crashProcessBoundaries(context) {
  const { store, workspace } = await openStore(context);
  await close(store);
  const base = workerArgs(context, workspace.workspaceId, ["--mode=crash", "--expected=0"]);

  const before = await runWorker([...base, "--crash-at=before-commit"]);
  assert.equal(before.code, 9, "Worker must have been killed before commit");
  const afterKillBefore = await withVerifier(context, (verifier) =>
    verifier.readWorkspace(workspace.workspaceId));
  assert.equal(afterKillBefore.generation, 0, "A killed pre-commit write must not be visible");

  const after = await runWorker([...base, "--crash-at=after-commit"]);
  assert.equal(after.code, 9, "Worker must have been killed after commit");
  const afterKillAfter = await withVerifier(context, (verifier) =>
    verifier.readWorkspace(workspace.workspaceId));
  assert.equal(
    afterKillAfter.generation,
    1,
    "A commit that reached durable state must survive the kill",
  );
  assert.equal(afterKillAfter.private.audit.length, 1);
  return {
    evidence: {
      killedBeforeCommitGeneration: afterKillBefore.generation,
      killedAfterCommitGeneration: afterKillAfter.generation,
      lostResponseRecovered: true,
    },
  };
}

async function restartRecovery(context) {
  if (!context.durable) return { skip: NOT_DURABLE };
  const { store, workspace } = await openStore(context);
  const documentPath = Object.keys(workspace.documentsByPath)[1];
  await commitAndRead(store, {
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: {
      selectedDocumentPath: documentPath,
      auditEvent: { actor: "Synthetic Actor", action: "pre-restart" },
    },
  });
  const expected = await store.readWorkspace(workspace.workspaceId);
  await close(store);

  const restarted = await runWorker(workerArgs(context, workspace.workspaceId, ["--mode=read"]));
  assert.equal(restarted.code, 0, restarted.stderr || "Restarted process failed to open the store");
  assert.deepEqual(
    restarted.report?.workspace,
    expected,
    "A separate process must observe byte-identical durable state",
  );
  return {
    evidence: {
      restartedInSeparateProcess: true,
      generation: expected.generation,
      selectionRecovered: expected.selectedDocumentPath === documentPath,
    },
  };
}

async function staleLockRecovery(context) {
  if (!context.durable) return { skip: NOT_DURABLE };
  if (context.adapter !== "local-cas") {
    return {
      skip: "No external lock file: SQLite owns locking internally and " +
        "recovers a killed writer through its own journal on open.",
    };
  }
  const { store, workspace } = await openStore(context);
  await close(store);

  const crashed = await runWorker(workerArgs(context, workspace.workspaceId, [
    "--mode=crash",
    "--expected=0",
    "--crash-at=before-commit",
  ]));
  assert.equal(crashed.code, 9);
  const lockPath = path.join(context.primaryRoot, "locks", `${workspace.workspaceId}.lock`);
  assert.equal(fs.existsSync(lockPath), true, "The killed writer should have orphaned its lock");

  const recovered = await withVerifier(context, async (verifier) => {
    const next = await verifier.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic Recovery", action: "after-stale-lock" } },
    });
    return next;
  });
  assert.equal(recovered.generation, 1, "A provably dead owner must not block progress");
  assert.equal(fs.existsSync(lockPath), false, "The lock must be released after recovery");
  return { evidence: { orphanedLockObserved: true, recoveredGeneration: 1 } };
}

async function atomicReplaceDurability(context) {
  if (!context.durable) return { skip: NOT_DURABLE };
  const { store, workspace } = await openStore(context);
  const commits = 5;
  for (let generation = 0; generation < commits; generation++) {
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: generation,
      operation: { auditEvent: { actor: "Synthetic Actor", action: `write-${generation}` } },
    });
  }
  const stray = typeof store.strayTempFiles === "function" ? store.strayTempFiles() : [];
  assert.deepEqual(stray, [], `Partial write artifacts were left behind: ${stray.join(", ")}`);
  await close(store);

  const reopened = await runWorker(workerArgs(context, workspace.workspaceId, ["--mode=read"]));
  assert.equal(reopened.code, 0, reopened.stderr || "Reopen failed");
  assert.equal(reopened.report?.workspace?.generation, commits);
  assert.equal(reopened.report?.workspace?.private.audit.length, commits);

  const evidence = {
    commits,
    strayTempFiles: stray.length,
    durableGeneration: reopened.report?.workspace?.generation,
  };

  if (context.adapter === "local-cas") {
    // A real kill mid atomic-replace must leave the previous complete generation
    // intact, and the orphaned temp file must never be read back as state.
    const crashed = await runWorker(workerArgs(context, workspace.workspaceId, [
      "--mode=crash",
      `--expected=${commits}`,
      "--crash-at=during-atomic-replace",
    ]));
    assert.equal(crashed.code, 9, "Worker must have been killed mid atomic-replace");
    const afterTear = await withVerifier(context, async (verifier) => {
      const current = await verifier.readWorkspace(workspace.workspaceId);
      // The store still accepts a clean write after the torn attempt.
      const advanced = await verifier.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: commits,
        operation: { auditEvent: { actor: "Synthetic Recovery", action: "post-tear" } },
      });
      return { current, advanced };
    });
    assert.equal(afterTear.current.generation, commits, "A torn replace must not advance or corrupt the generation");
    assert.equal(afterTear.advanced.generation, commits + 1, "The store must recover and accept the next write");
    evidence.tornReplaceKilled = true;
    evidence.previousGenerationIntact = true;
  }

  return { evidence };
}

function percentile(samples, fraction) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function directorySizeBytes(root) {
  let total = 0;
  const walk = (current) => {
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try { total += fs.statSync(full).size; } catch { /* raced with cleanup */ }
      }
    }
  };
  walk(root);
  return total;
}

async function latencyProfile(context) {
  const measurements = {};
  for (const scale of PER_SCALES) {
    const iterations = PER_LATENCY_ITERATIONS[scale];
    const store = context.createStore({ fresh: true });
    await store.initialize();
    try {
      const workspace = createSyntheticWorkspace({
        seed: `${context.config.runId}-lat-${scale}`,
        scale,
      });
      await store.createWorkspace(workspace);
      const alias = workspace.aliases[0];
      const openSamples = [];
      const mutateSamples = [];
      const conflictSamples = [];

      for (let generation = 0; generation < iterations; generation++) {
        let started = performance.now();
        await store.resolveAlias(alias);
        openSamples.push(performance.now() - started);

        started = performance.now();
        await store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: generation,
          operation: { auditEvent: { actor: "Synthetic Actor", action: `latency-${generation}` } },
        });
        mutateSamples.push(performance.now() - started);

        started = performance.now();
        await assert.rejects(
          store.compareAndSwap({
            workspaceId: workspace.workspaceId,
            expectedGeneration: generation,
            operation: { auditEvent: { actor: "Synthetic Stale", action: "stale" } },
          }),
          WorkspaceConflictError,
        );
        conflictSamples.push(performance.now() - started);
      }

      const durable = await store.readWorkspace(workspace.workspaceId);
      assert.equal(durable.generation, iterations, "Every measured mutation must be durable");
      measurements[`openByAliasP50Ms_${scale}`] = percentile(openSamples, 0.5);
      measurements[`openByAliasP95Ms_${scale}`] = percentile(openSamples, 0.95);
      measurements[`mutationP50Ms_${scale}`] = percentile(mutateSamples, 0.5);
      measurements[`mutationP95Ms_${scale}`] = percentile(mutateSamples, 0.95);
      measurements[`conflictP50Ms_${scale}`] = percentile(conflictSamples, 0.5);
      measurements[`conflictP95Ms_${scale}`] = percentile(conflictSamples, 0.95);
    } finally {
      await close(store);
    }
  }
  return { evidence: { scales: PER_SCALES.join(",") }, measurements };
}

async function footprintProfile(context) {
  const measurements = {};
  const evidence = { scales: PER_SCALES.join(",") };
  for (const scale of PER_SCALES) {
    const commits = PER_FOOTPRINT_COMMITS[scale];
    const store = context.createStore({ fresh: true });
    await store.initialize();
    try {
      const workspace = createSyntheticWorkspace({
        seed: `${context.config.runId}-fp-${scale}`,
        scale,
      });
      await store.createWorkspace(workspace);
      for (let generation = 0; generation < commits; generation++) {
        await store.compareAndSwap({
          workspaceId: workspace.workspaceId,
          expectedGeneration: generation,
          operation: { auditEvent: { actor: "Synthetic Actor", action: `footprint-${generation}` } },
        });
      }

      let started = performance.now();
      const snapshot = await store.backup();
      const backupMs = performance.now() - started;

      const target = context.createStore({ fresh: true });
      await target.initialize();
      started = performance.now();
      await target.restore(snapshot);
      const restoreMs = performance.now() - started;
      assert.equal(
        (await target.readWorkspace(workspace.workspaceId)).generation,
        commits,
      );
      await close(target);

      const storeBytes = context.durable ? directorySizeBytes(store.root) : 0;
      const payloadBytes = Buffer.byteLength(JSON.stringify(snapshot));
      measurements[`backupMs_${scale}`] = backupMs;
      measurements[`restoreMs_${scale}`] = restoreMs;
      evidence[`storeBytes_${scale}`] = storeBytes;
      evidence[`payloadBytes_${scale}`] = payloadBytes;
      evidence[`writeAmplification_${scale}`] =
        payloadBytes ? Number((storeBytes / payloadBytes).toFixed(2)) : null;
    } finally {
      await close(store);
    }
  }
  return { evidence, measurements };
}

// --- Milestone B additions -------------------------------------------------

async function permissionDeniedNotAbsent(context) {
  const { store, workspace } = await openStore(context);
  try {
    store.injectReadFault(workspace.workspaceId);
    await assert.rejects(
      store.readWorkspace(workspace.workspaceId),
      (error) => error.code === "store_corrupt",
    );
    const listed = await store.listWorkspaces();
    assert.ok(
      listed.includes(workspace.workspaceId),
      "A permission-denied workspace must remain present, never treated as absent",
    );
    // The one-shot fault clears, so the underlying state was never lost.
    const recovered = await store.readWorkspace(workspace.workspaceId);
    assert.equal(recovered.generation, 0);
    return { evidence: { permissionErrorFailedClosed: true, treatedAsAbsent: false } };
  } finally {
    await close(store);
  }
}

async function indeterminateJournalSurfaced(context) {
  const { store, workspace } = await openStore(context);
  try {
    const intent = firstIntent(workspace);
    const journalId = `syn-journal-${context.config.runId}`;
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: {
        planJournal: {
          journalId,
          workspaceId: workspace.workspaceId,
          generation: 0,
          status: "planned",
          providerCapabilityVersion: "synthetic-v1",
          intentTuples: [{
            intentId: intent.intentId,
            intentRevision: intent.intentRevision,
            contentHash: intent.contentHash,
          }],
        },
      },
    });
    const afterPlan = await store.readWorkspace(workspace.workspaceId);
    assert.equal(needsReconciliation(afterPlan), true);

    // A normal mutation is refused while the journal is indeterminate.
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 1,
        operation: { auditEvent: { actor: "Synthetic Actor", action: "post-plan" } },
      }),
      (error) => error.code === "journal_reconciliation_required",
    );

    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { reconcileJournal: { journalId, outcome: "committed" } },
    });
    const reconciled = await store.readWorkspace(workspace.workspaceId);
    assert.equal(needsReconciliation(reconciled), false);

    const advanced = await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 2,
      operation: { auditEvent: { actor: "Synthetic Actor", action: "after-reconcile" } },
    });
    assert.equal(advanced.generation, 3);
    return { evidence: { surfacedBeforeMutation: true, reconciledThenAccepted: true } };
  } finally {
    await close(store);
  }
}

async function migrationForward(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const legacy = createLegacyWorkspaceV0({ seed: context.config.runId, generation: 2 });
    store.seedLegacy(legacy);
    const first = await store.migrate();
    assert.equal(first.migrated, 1);

    const migrated = await store.readWorkspace(legacy.workspaceId);
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(migrated.generation, 2, "Migration must preserve the workspace generation");
    assert.equal(migrated.aliases[0], legacy.aliases[0], "Migration must preserve aliases");

    // Idempotent: a second run finds nothing pending and changes nothing.
    const second = await store.migrate();
    assert.equal(second.migrated, 0);
    assert.deepEqual(await store.readWorkspace(legacy.workspaceId), migrated);
    return {
      evidence: { migrated: 1, idempotentSecondRun: true, generationPreserved: migrated.generation },
    };
  } finally {
    await close(store);
  }
}

async function migrationInterrupted(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const legacy = createLegacyWorkspaceV0({ seed: context.config.runId });
    store.seedLegacy(legacy);

    await assert.rejects(
      store.migrate({ faultInjector: new FaultInjector(["before-migration-commit"]) }),
      InjectedFaultError,
    );
    // An interrupted migration leaves the original intact and nothing partial.
    await assert.rejects(
      store.readWorkspace(legacy.workspaceId),
      (error) => error.code === "workspace_not_found",
    );

    const resumed = await store.migrate();
    assert.equal(resumed.migrated, 1);
    const migrated = await store.readWorkspace(legacy.workspaceId);
    assert.equal(migrated.schemaVersion, 1);
    return { evidence: { rolledBackOnInterrupt: true, resumedToComplete: true } };
  } finally {
    await close(store);
  }
}

async function migrationUnsupportedVersion(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const legacy = createLegacyWorkspaceV0({ seed: context.config.runId });
    legacy.schemaVersion = 2; // A newer/unknown source version must fail closed.
    store.seedLegacy(legacy);

    await assert.rejects(
      store.migrate(),
      (error) => error.code === "unsupported_schema",
    );
    await assert.rejects(
      store.readWorkspace(legacy.workspaceId),
      (error) => error.code === "workspace_not_found",
    );
    assert.equal(store.diagnostics().pendingMigrations, 1, "The unsupported source must be preserved");
    return { evidence: { failedClosedOnUnsupported: true, sourcePreserved: true } };
  } finally {
    await close(store);
  }
}

async function importValid(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: `${context.config.runId}-import` });
    const envelope = {
      schemaVersion: 1,
      syntheticData: true,
      checksum: checksumWorkspace(workspace),
      workspace,
    };
    const receipt = await store.importEnvelope(envelope);
    assert.ok(receipt.receiptId, "A receipt must be issued only after durable commit");
    assert.equal(receipt.workspaceId, workspace.workspaceId);
    assert.deepEqual(await store.readWorkspace(workspace.workspaceId), workspace);
    return { evidence: { receiptIssued: true, generation: receipt.generation } };
  } finally {
    await close(store);
  }
}

async function importRejectsBad(context) {
  const store = context.createStore();
  await store.initialize();
  try {
    const workspace = createSyntheticWorkspace({ seed: `${context.config.runId}-imp2` });

    // Corrupt: checksum mismatch.
    await assert.rejects(
      store.importEnvelope({
        schemaVersion: 1, syntheticData: true, checksum: "syn-bad-checksum", workspace,
      }),
      CorruptWorkspaceStoreError,
    );
    assert.deepEqual(await store.listWorkspaces(), [], "A rejected import must leave no partial destination");

    // Incomplete: missing workspace body.
    await assert.rejects(
      store.importEnvelope({ schemaVersion: 1, syntheticData: true, checksum: "x" }),
      CorruptWorkspaceStoreError,
    );

    // Duplicate: a valid import, then the same identity again.
    const envelope = {
      schemaVersion: 1, syntheticData: true, checksum: checksumWorkspace(workspace), workspace,
    };
    await store.importEnvelope(envelope);
    await assert.rejects(
      store.importEnvelope(envelope),
      (error) => error.code === "workspace_exists",
    );
    assert.equal((await store.listWorkspaces()).length, 1);
    return {
      evidence: { corruptRejected: true, incompleteRejected: true, duplicateRejected: true },
    };
  } finally {
    await close(store);
  }
}

async function recoveryDiagnosticsRedacted(context) {
  const { store, workspace } = await openStore(context);
  try {
    const bodyMarker = "SYN-BODY-MARKER-do-not-leak";
    const secretMarker = "SYN-SECRET-MARKER-do-not-leak";
    const documentPath = workspace.selectedDocumentPath;
    await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: {
        document: {
          path: documentPath,
          value: {
            ...workspace.documentsByPath[documentPath],
            body: `# ${bodyMarker}`,
            contentHash: "syn-hash-diag",
          },
        },
        auditEvent: { actor: "Synthetic Actor", action: "note", token: secretMarker },
      },
    });

    const diagnostics = store.diagnostics();
    const serialized = JSON.stringify(diagnostics);
    assert.ok(serialized.includes(workspace.workspaceId), "Diagnostics must identify the affected workspace");
    assert.ok(!serialized.includes(bodyMarker), "Diagnostics must not leak document bodies");
    assert.ok(!serialized.includes(secretMarker), "Diagnostics must not leak credential-shaped values");
    assert.deepEqual(findEmbeddedSecrets(diagnostics), [], "Diagnostics must carry no credential-keyed material");
    const entry = diagnostics.workspaces.find((item) => item.workspaceId === workspace.workspaceId);
    assert.equal(entry.health, "ok");
    return { evidence: { identifiesWorkspace: true, leaksBody: false, leaksSecret: false } };
  } finally {
    await close(store);
  }
}

async function preflightRejectsUnsafeCoords() {
  const unsafe = {
    configurationId: "CFG-PROVIDER-UNSAFE",
    adapter: "ado",
    backingPath: "ado",
    runId: "s0-provider-unsafe",
    syntheticDataOnly: true,
    budgets: { maxOperations: 10, maxDurationMs: 1000, maxObjects: 10, maxBytes: 1000 },
    sandbox: {
      kind: "provider",
      approved: true,
      corporateFallbackDisabled: true,
      ownershipMarker: "tippani-s0:s0-provider-unsafe",
    },
  };
  const errors = validatePreflight(unsafe);
  assert.ok(errors.some((error) => /allow-listed/.test(error)), "Non-allow-listed provider coords must be rejected");
  assert.ok(errors.some((error) => /identity/i.test(error)), "Unverified provider identity must be rejected");
  assert.ok(errors.some((error) => /namespace/i.test(error) || /branch/i.test(error)));
  assert.ok(errors.some((error) => /coordinates/i.test(error)), "Missing provider coordinates must be rejected");
  return { evidence: { providerPreflightRejected: true, errorCount: errors.length } };
}

async function identityVerifiedNoCorporateFallback(context) {
  const base = deepClone(context.config);
  assert.deepEqual(validatePreflight(base), [], "The sandbox config must pass its own preflight");
  const fallback = { ...base, sandbox: { ...base.sandbox, corporateFallbackDisabled: false } };
  assert.ok(
    validatePreflight(fallback).some((error) => /Corporate-account fallback/.test(error)),
    "Corporate-account fallback can never be enabled",
  );
  return { evidence: { corporateFallbackImpossible: true } };
}

async function credentialsAbsentFromEvidence(context) {
  const withSecret = { ...deepClone(context.config), adoToken: "syn-should-not-be-here" };
  assert.ok(
    validatePreflight(withSecret).some((error) => /Credential material/.test(error)),
    "A config embedding a credential must be rejected",
  );
  const workspace = createSyntheticWorkspace({ seed: `${context.config.runId}-sec4` });
  assert.deepEqual(findEmbeddedSecrets(workspace), [], "Workspace state must carry no credential-keyed material");
  return { evidence: { configSecretRejected: true, workspaceHasNoSecrets: true } };
}

async function cleanupOnlyOwned(context) {
  const runId = context.config.runId;
  const ownershipMarker = context.config.sandbox.ownershipMarker;
  const manifest = new CleanupManifest({ runId, ownershipMarker });
  const owned = { kind: "synthetic-ref", id: "syn-res-1", runId, ownershipMarker };
  manifest.record(owned);
  assert.equal(manifest.authorize(owned), true);

  const foreign = {
    kind: "synthetic-ref",
    id: "syn-res-2",
    runId: "s0-other-run",
    ownershipMarker: "tippani-s0:s0-other-run",
  };
  assert.equal(manifest.authorize(foreign), false, "A resource from another run is never authorized");
  assert.throws(() => manifest.markCleaned(foreign), /Refusing cleanup/);

  manifest.markCleaned(owned);
  assert.equal(manifest.authorize(owned), false, "An already-cleaned resource is not re-authorized");
  return { evidence: { ownedAuthorized: true, foreignRefused: true } };
}

async function budgetsStopUnsafeRuns(context) {
  const base = deepClone(context.config);
  for (const field of ["maxOperations", "maxDurationMs", "maxObjects", "maxBytes"]) {
    const bad = { ...base, budgets: { ...base.budgets, [field]: 0 } };
    assert.ok(
      validatePreflight(bad).some((error) => error.includes(`budgets.${field}`)),
      `A zero ${field} budget must be rejected`,
    );
  }
  assert.ok(base.budgets.maxOperations > 0 && base.budgets.maxDurationMs > 0);
  return { evidence: { nonPositiveBudgetsRejected: true } };
}

export const SCENARIO_IMPLEMENTATIONS = Object.freeze({
  "S0-ATM-001": atomicMutation,
  "S0-ATM-002": atomicAliasTransition,
  "S0-ATM-003": failedMutationIsInvisible,
  "S0-CON-001": (context) =>
    (context.durable ? crossProcessRace(context, 2) : oneWinner(context, 2)),
  "S0-CON-002": (context) =>
    (context.durable ? crossProcessRace(context, 4) : oneWinner(context, 3)),
  "S0-CON-003": independentWorkspaces,
  "S0-CON-004": concurrentStagePreserved,
  "S0-CON-005": boundedConflict,
  "S0-JRN-001": journalPreparation,
  "S0-JRN-002": danglingJournalRejected,
  "S0-CRS-001": (context) =>
    (context.durable ? crashProcessBoundaries(context) : crashBoundaries(context)),
  "S0-CRS-002": aliasCrash,
  "S0-CRS-003": restoreCrash,
  "S0-COL-001": (context) =>
    (context.durable ? crossProcessRace(context, 3) : oneWinner(context, 2)),
  "S0-BCK-001": atomicReplaceDurability,
  "S0-COR-001": corruptStateDetected,
  "S0-COR-002": duplicateAliasRestoreRejected,
  "S0-COR-003": unsupportedSchemaRejected,
  "S0-COR-004": permissionDeniedNotAbsent,
  "S0-HYD-001": enumerateBeforeUse,
  "S0-HYD-002": rehydrateExactly,
  "S0-HYD-003": indeterminateJournalSurfaced,
  "S0-MIG-001": migrationForward,
  "S0-MIG-002": migrationInterrupted,
  "S0-MIG-003": migrationUnsupportedVersion,
  "S0-IMP-001": importValid,
  "S0-IMP-002": importRejectsBad,
  "S0-BKP-001": consistentBackup,
  "S0-BKP-002": restoreExact,
  "S0-REC-001": restartRecovery,
  "S0-REC-002": staleLockRecovery,
  "S0-REC-005": recoveryDiagnosticsRedacted,
  "S0-SEC-001": preflightRejectsUnsafeCoords,
  "S0-SEC-002": identityVerifiedNoCorporateFallback,
  "S0-SEC-003": syntheticOnly,
  "S0-SEC-004": credentialsAbsentFromEvidence,
  "S0-SEC-005": cleanupOnlyOwned,
  "S0-SEC-006": budgetsStopUnsafeRuns,
  "S0-PER-001": startupMeasurement,
  "S0-PER-002": latencyProfile,
  "S0-PER-003": footprintProfile,
});

// Scenarios that no implementation can honestly claim yet. They must report
// Incomplete rather than borrow a weaker proof.
export const PENDING_REASONS = Object.freeze({});

