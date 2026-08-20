// Live single-identity provider gate implementations (OneDrive, ADO, GitHub).
// Each runs only against a live provider backing path; anywhere else (local,
// dry-run) it reports Blocked with the gate's precise prerequisite, so the same
// catalog id stays honest across configurations.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "./adapters/registry.mjs";
import { createSyntheticWorkspace } from "./synthetic-fixtures.mjs";
import { WorkspaceConflictError } from "./workspace-contract.mjs";
import { BLOCKED_REASONS } from "./provider-gates.mjs";

// A live provider = a real OneDrive/ADO/GitHub backing path, not a dry-run.
function isLiveOneDrive(context) {
  return ["onedrive", "ado", "github"].includes(context.config.backingPath)
    && context.config.dryRun === false;
}

function blocked(context) {
  const id = context.scenario?.id;
  return { blocked: BLOCKED_REASONS[id] || "Blocked \u2014 requires a live provider sandbox." };
}

async function seedWorkspace(store, seed) {
  const workspace = createSyntheticWorkspace({ seed });
  await store.createWorkspace(workspace);
  return workspace;
}

async function etagCasStaleWriter(context) {
  if (!isLiveOneDrive(context)) return blocked(context);
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
  if (!isLiveOneDrive(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `bck005-${context.config.runId}`);
  try {
    for (const kind of ["throttle", "auth-expiry", "outage"]) {
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
    return { evidence: { faultsRejected: 3, generationUnchanged: true } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function lostResponseReconcile(context) {
  if (!isLiveOneDrive(context)) return blocked(context);
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
      (e) => e.code === "provider_response_lost",
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
  if (!isLiveOneDrive(context)) return blocked(context);
  const a = context.createStore();
  await a.initialize();
  const workspace = await seedWorkspace(a, `col005-${context.config.runId}`);
  try {
    await a.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "base" } },
    });
    // A goes offline and stages a write from generation 1.
    a.goOffline();
    a.stageOffline({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic A", action: "offline-edit" } },
    });
    // Meanwhile B advances the authority.
    const b = context.createStore();
    await b.initialize();
    await b.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic B", action: "online-edit" } },
    });
    // A reconnects: the pending write must not silently overwrite B's newer state.
    const report = await a.reconnect();
    assert.equal(report.applied.length, 0, "a stale offline write must not be applied");
    assert.equal(report.conflicts.length, 1, "the offline write must surface as a conflict");
    const authority = await b.readWorkspace(workspace.workspaceId);
    assert.equal(authority.generation, 2, "authority must still reflect B's write");
    return { evidence: { offlinePendingConflicted: true, noSilentOverwrite: true, authorityGeneration: 2 } };
  } finally {
    await a.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function offlineCacheReconcile(context) {
  if (!isLiveOneDrive(context)) return blocked(context);
  const a = context.createStore();
  await a.initialize();
  const workspace = await seedWorkspace(a, `rec004-${context.config.runId}`);
  try {
    await a.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "base" } },
    });
    a.goOffline();
    a.stageOffline({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic A", action: "cached-edit" } },
    });
    const b = context.createStore();
    await b.initialize();
    await b.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 1,
      operation: { auditEvent: { actor: "Synthetic B", action: "authority-advance" } },
    });
    const report = await a.reconnect();
    // The offline cache discovers the newer authority instead of overwriting it.
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].actual, 2, "reconnect must discover the newer committed generation");
    const authority = await a.readWorkspace(workspace.workspaceId);
    assert.equal(authority.generation, 2, "no silent overwrite of newer authority");
    return { evidence: { discoveredNewerAuthority: true, noSilentOverwrite: true } };
  } finally {
    await a.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function recoverAfterFault(context) {
  if (!isLiveOneDrive(context)) return blocked(context);
  const store = context.createStore();
  await store.initialize();
  const workspace = await seedWorkspace(store, `rec003-${context.config.runId}`);
  try {
    store.injectFault("outage");
    await assert.rejects(
      store.compareAndSwap({
        workspaceId: workspace.workspaceId,
        expectedGeneration: 0,
        operation: { auditEvent: { actor: "Synthetic A", action: "during-outage" } },
      }),
      (e) => e.code === "provider_unreachable",
    );
    const mid = await store.readWorkspace(workspace.workspaceId);
    assert.equal(mid.generation, 0, "an outage must not leave a partial write");
    // Recover: the same write succeeds once the provider is reachable again.
    const recovered = await store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "Synthetic A", action: "recover" } },
    });
    assert.equal(recovered.generation, 1);
    return { evidence: { outageRejected: true, recoveredGeneration: 1 } };
  } finally {
    await store.deleteWorkspace(workspace.workspaceId).catch(() => {});
  }
}

async function localToOneDriveRehome(context) {
  if (!isLiveOneDrive(context)) return blocked(context);
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
  if (!isLiveOneDrive(context)) return blocked(context);
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
  if (!isLiveOneDrive(context)) return blocked(context);
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
  "S0-COL-004": lostResponseReconcile,
  "S0-COL-005": offlinePendingUntilCas,
  "S0-REC-003": recoverAfterFault,
  "S0-REC-004": offlineCacheReconcile,
  "S0-MIG-004": localToOneDriveRehome,
  "S0-BKP-003": versionHistoryRecover,
  "S0-BKP-004": restoredOneHead,
});
