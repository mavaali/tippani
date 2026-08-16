// Negative-control ("mutation") verification for the S0 harness.
//
// A harness that only passes its own reference adapter proves nothing. Each
// mutant below breaks exactly one durability invariant that S0 treats as an
// absolute gate. The harness is only trustworthy if every mutant is FAILED by
// the scenario that owns that invariant.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReferenceMemoryWorkspaceStore } from "../src/adapters/reference-memory-store.mjs";
import { runHarness } from "../src/runner.mjs";
import { renderOutcomeReport } from "../src/result-writer.mjs";
import { applyWorkspaceOperation, deepClone } from "../src/workspace-contract.mjs";
import { migrateWorkspaceV0ToV1 } from "../src/synthetic-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const baseConfig = JSON.parse(fs.readFileSync(
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

// --- Mutants ---------------------------------------------------------------

/** Ignores the expected generation entirely: last writer silently wins. */
class NoCasStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap({ workspaceId, operation, faultInjector = null }) {
    this.ensureInitialized();
    await Promise.resolve();
    const current = this.readRaw(workspaceId);
    const next = applyWorkspaceOperation(current, operation);
    faultInjector?.hit("before-commit");
    const nextRecords = new Map(this.records);
    const nextAliases = new Map(this.aliases);
    nextRecords.set(workspaceId, deepClone(next));
    for (const alias of next.aliases) nextAliases.set(alias, workspaceId);
    this.records = nextRecords;
    this.aliases = nextAliases;
    faultInjector?.hit("after-commit");
    return deepClone(next);
  }
}

/** Commits the document but loses the intent revision (non-atomic write). */
class PartialCommitStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap(request) {
    const before = deepClone(this.readRaw(request.workspaceId));
    const next = await super.compareAndSwap(request);
    if (request.operation?.intent) {
      const stored = this.records.get(request.workspaceId);
      const id = request.operation.intent.intentId;
      if (before.pushable.remote.intentsById[id]) {
        stored.pushable.remote.intentsById[id] = before.pushable.remote.intentsById[id];
      }
    }
    return next;
  }
}

/** Treats unreadable state as a brand-new empty workspace. */
class EmptyOnCorruptStore extends ReferenceMemoryWorkspaceStore {
  readRaw(workspaceId) {
    const value = this.records.get(workspaceId);
    if (!value || value.corrupt) {
      return {
        schemaVersion: 1,
        syntheticData: true,
        workspaceId,
        aliases: [],
        activePublicationTarget: null,
        mode: "remote",
        documentsByPath: {},
        selectedDocumentPath: null,
        generation: 0,
        pushable: { remote: { intentsById: {}, orderedIntentIds: [] } },
        localManifest: {},
        private: { audit: [], selection: {} },
        publication: { activeJournalId: null, journalsById: {} },
        lifecycle: { state: "active" },
      };
    }
    return value;
  }
}

/** Loses an already-acknowledged commit when the response is lost. */
class NonDurableCommitStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap(request) {
    const snapshot = new Map(this.records);
    try {
      return await super.compareAndSwap(request);
    } catch (error) {
      if (error?.code === "injected_fault") this.records = snapshot;
      throw error;
    }
  }
}

/** Drops workspace-private state on restore. */
class LossyRestoreStore extends ReferenceMemoryWorkspaceStore {
  async restore(snapshot, options) {
    const stripped = deepClone(snapshot);
    for (const workspace of stripped.workspaces || []) {
      workspace.private = {
        personalAnnotations: [],
        selection: {},
        activeContext: {},
        viewedProgress: {},
        pendingProposals: {},
        paneRecovery: {},
        locksMetadata: {},
        audit: [],
      };
    }
    return super.restore(stripped, options);
  }
}

/** Accepts a journal that references intent revisions which do not exist. */
class DanglingJournalStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap(request) {
    const { planJournal, ...operation } = request.operation || {};
    const next = await super.compareAndSwap({ ...request, operation });
    if (planJournal) {
      const stored = this.records.get(request.workspaceId);
      stored.publication.activeJournalId = planJournal.journalId;
      stored.publication.journalsById[planJournal.journalId] = deepClone(planJournal);
    }
    return next;
  }
}

/** Publishes the alias index before the workspace commit is durable. */
class AliasLeakStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap(request) {
    for (const alias of request.operation?.addAliases || []) {
      this.aliases.set(alias, request.workspaceId);
    }
    return super.compareAndSwap(request);
  }
}

/** Cleans up published intent by logical ID, discarding a newer revision. */
class ClearsNewerIntentStore extends ReferenceMemoryWorkspaceStore {
  async compareAndSwap(request) {
    const { clearIntentTuple, ...operation } = request.operation || {};
    const next = await super.compareAndSwap({ ...request, operation });
    if (clearIntentTuple) {
      const stored = this.records.get(request.workspaceId);
      delete stored.pushable.remote.intentsById[clearIntentTuple.intentId];
      stored.pushable.remote.orderedIntentIds =
        stored.pushable.remote.orderedIntentIds.filter((id) => id !== clearIntentTuple.intentId);
    }
    return next;
  }
}

/** Treats a permission-denied read as a brand-new empty workspace. */
class EmptyOnDeniedStore extends ReferenceMemoryWorkspaceStore {
  readRaw(workspaceId) {
    if (this.readFaults.has(workspaceId)) {
      this.readFaults.delete(workspaceId);
      return {
        schemaVersion: 1,
        syntheticData: true,
        workspaceId,
        aliases: [],
        activePublicationTarget: null,
        mode: "remote",
        documentsByPath: {},
        selectedDocumentPath: null,
        generation: 0,
        pushable: { remote: { intentsById: {}, orderedIntentIds: [] } },
        localManifest: {},
        private: { audit: [], selection: {} },
        publication: { activeJournalId: null, journalsById: {} },
        lifecycle: { state: "active" },
      };
    }
    return super.readRaw(workspaceId);
  }
}

/** Applies a mutation while an indeterminate journal still needs reconciling. */
class IgnoresReconciliationStore extends ReferenceMemoryWorkspaceStore {
  guard() { /* skips the reconciliation gate */ }
}

/** Migrates any source, including an unsupported/newer schema version. */
class MigratesUnsupportedStore extends ReferenceMemoryWorkspaceStore {
  async migrate() {
    for (const workspaceId of [...this.legacy.keys()]) {
      const legacy = { ...this.legacy.get(workspaceId), schemaVersion: 0 };
      const migrated = migrateWorkspaceV0ToV1(legacy);
      this.records.set(workspaceId, deepClone(migrated));
      for (const alias of migrated.aliases) this.aliases.set(alias, workspaceId);
      this.legacy.delete(workspaceId);
    }
    return { migrated: 1, pending: 0 };
  }
}

/** Discards the original before durability, so an interrupt loses it forever. */
class LosesLegacyOnInterruptStore extends ReferenceMemoryWorkspaceStore {
  async migrate({ faultInjector = null } = {}) {
    for (const workspaceId of [...this.legacy.keys()]) {
      const legacy = this.legacy.get(workspaceId);
      this.legacy.delete(workspaceId);
      faultInjector?.hit("before-migration-commit");
      const migrated = migrateWorkspaceV0ToV1(legacy);
      this.records.set(workspaceId, deepClone(migrated));
      faultInjector?.hit("after-migration-commit");
    }
    return { migrated: this.records.size, pending: 0 };
  }
}

/** Imports an envelope without validating its checksum. */
class ImportsWithoutChecksumStore extends ReferenceMemoryWorkspaceStore {
  async importEnvelope(envelope) {
    const workspace = envelope.workspace;
    this.records.set(workspace.workspaceId, deepClone(workspace));
    for (const alias of workspace.aliases) this.aliases.set(alias, workspace.workspaceId);
    return { receiptId: "syn-receipt-unchecked", workspaceId: workspace.workspaceId, generation: workspace.generation };
  }
}

/** Dumps full workspace state, leaking document bodies into diagnostics. */
class LeakyDiagnosticsStore extends ReferenceMemoryWorkspaceStore {
  diagnostics() {
    return { workspaces: [...this.records.values()] };
  }
}

const MUTANTS = [
  ["no generation CAS", NoCasStore, ["S0-CON-001", "S0-CON-002"]],
  ["partial (non-atomic) commit", PartialCommitStore, ["S0-ATM-001"]],
  ["empty workspace on corrupt state", EmptyOnCorruptStore, ["S0-COR-001"]],
  ["loses acknowledged commit", NonDurableCommitStore, ["S0-CRS-001"]],
  ["drops private state on restore", LossyRestoreStore, ["S0-HYD-002", "S0-BKP-002"]],
  ["accepts dangling journal tuple", DanglingJournalStore, ["S0-JRN-002"]],
  ["leaks alias before commit", AliasLeakStore, ["S0-ATM-003", "S0-CRS-002"]],
  ["clears newer intent revision", ClearsNewerIntentStore, ["S0-CON-004"]],
  ["treats permission-denied as empty", EmptyOnDeniedStore, ["S0-COR-004"]],
  ["ignores journal reconciliation", IgnoresReconciliationStore, ["S0-HYD-003"]],
  ["migrates an unsupported source version", MigratesUnsupportedStore, ["S0-MIG-003"]],
  ["loses the original on interrupted migration", LosesLegacyOnInterruptStore, ["S0-MIG-002"]],
  ["imports without checksum validation", ImportsWithoutChecksumStore, ["S0-IMP-002"]],
  ["leaks document bodies in diagnostics", LeakyDiagnosticsStore, ["S0-REC-005"]],
];

async function runWith(Adapter, scenarioIds) {
  const { run } = await runHarness({
    config: baseConfig,
    scenarioIds,
    adapterFactory: () => new Adapter(),
    writeArtifacts: false,
  });
  return run;
}

// --- Detection power -------------------------------------------------------

for (const [name, Adapter, owningScenarios] of MUTANTS) {
  await check(`detects: ${name}`, async () => {
    const run = await runWith(Adapter, owningScenarios);
    for (const result of run.results) {
      assert.equal(
        result.status,
        "Fail",
        `${result.scenarioId} passed a store that ${name}`,
      );
    }
    assert.equal(renderOutcomeReport(run).includes("Do not proceed"), true);
  });
}

await check("mutants stay narrow: unrelated scenarios still pass", async () => {
  const run = await runWith(NoCasStore, ["S0-BKP-001", "S0-SEC-003"]);
  assert(run.results.every((result) => result.status === "Pass"));
});

// --- Report integrity ------------------------------------------------------

await check("a failing absolute gate blocks the recommendation", async () => {
  const run = await runWith(NoCasStore, ["S0-CON-001"]);
  const report = renderOutcomeReport(run);
  assert(report.includes("**Recommendation:** Do not proceed"));
  assert(report.includes("## Failures and recovery"));
  assert(report.includes("S0-CON-001"));
});

await check("unimplemented scenarios are reported, never silently skipped", async () => {
  const run = await runWith(ReferenceMemoryWorkspaceStore, ["S0-COL-002"]);
  assert.equal(run.results[0].status, "Incomplete");
  assert(renderOutcomeReport(run).includes("Incomplete"));
});

await check("results are deterministic across repeated runs", async () => {
  const shape = (run) => run.results.map((r) => `${r.scenarioId}:${r.status}`).join(",");
  const first = await runWith(ReferenceMemoryWorkspaceStore, baseConfig.scenarioIds);
  const second = await runWith(ReferenceMemoryWorkspaceStore, baseConfig.scenarioIds);
  assert.equal(shape(first), shape(second));
});

await check("budgets stop an oversized run before it executes", async () => {
  const tight = structuredClone(baseConfig);
  tight.budgets.maxOperations = 1;
  await assert.rejects(
    runHarness({
      config: tight,
      scenarioIds: ["S0-ATM-001", "S0-ATM-002"],
      writeArtifacts: false,
    }),
    /operation budget/,
  );
});

console.log(`s0-detection-power: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
