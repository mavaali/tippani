import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { ReferenceMemoryWorkspaceStore } from "../src/adapters/reference-memory-store.mjs";
import {
  acquireLock,
  fsyncDirectorySync,
  listTempArtifacts,
  writeFileAtomicSync,
} from "../src/adapters/fs-atomic.mjs";
import { LocalCasWorkspaceStore } from "../src/adapters/local-cas-store.mjs";
import { LocalSqliteWorkspaceStore } from "../src/adapters/local-sqlite-store.mjs";
import {
  APPLICABILITY_PROFILES,
  applicableScenarioIds,
  validateApplicability,
} from "../src/applicability.mjs";
import { CleanupManifest } from "../src/cleanup-manifest.mjs";
import { FaultInjector, InjectedFaultError } from "../src/fault-injector.mjs";
import { validatePreflight } from "../src/preflight.mjs";
import { COMPLEXITY_RUBRIC, complexityAssessment } from "../src/complexity-rubric.mjs";
import { runHarness } from "../src/runner.mjs";
import { runWorker } from "../src/process-runner.mjs";
import { renderOutcomeReport } from "../src/result-writer.mjs";
import { gateSummary } from "../src/eligibility.mjs";
import {
  canonicalSourceContent,
  sourceRevisionFromEntries,
} from "../src/evidence-identity.mjs";
import {
  SCENARIOS,
  validateScenarioCatalog,
} from "../src/scenario-catalog.mjs";
import {
  assertSyntheticOnly,
  createSyntheticWorkspace,
} from "../src/synthetic-fixtures.mjs";
import {
  DURABLE_IDENTITY_CHECKSUM_VERSION,
  LEGACY_WORKSPACE_CHECKSUM_VERSION,
  WorkspaceConflictError,
  applyWorkspaceOperation,
  checksumWorkspace,
  checksumWorkspaceV1,
  validateWorkspaceRecord,
} from "../src/workspace-contract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const config = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "reference-memory.json"),
  "utf8",
));

function writeLockOwner(lockPath, { pid, token }) {
  fs.rmSync(lockPath, { recursive: true, force: true });
  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(
    path.join(lockPath, `${token}.owner`),
    JSON.stringify({ pid, token, at: Date.now() }),
  );
}

function writeLegacyCasEnvelope(storeRoot, workspace) {
  const workspaceDir = path.join(storeRoot, "workspaces");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceDir, `${workspace.workspaceId}.json`),
    JSON.stringify({
      schemaVersion: 1,
      checksum: checksumWorkspaceV1(workspace),
      workspace,
    }),
  );
}

function writeCurrentCasEnvelope(storeRoot, workspace) {
  const workspaceDir = path.join(storeRoot, "workspaces");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(
    path.join(workspaceDir, `${workspace.workspaceId}.json`),
    JSON.stringify({
      schemaVersion: 1,
      checksumVersion: DURABLE_IDENTITY_CHECKSUM_VERSION,
      durableWorkspaceId: workspace.workspaceId,
      checksum: checksumWorkspace(workspace, workspace.workspaceId),
      workspace,
    }),
  );
}

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
  assert.equal(validateApplicability(SCENARIOS), true);
  assert.equal(new Set(SCENARIOS.map((item) => item.id)).size, SCENARIOS.length);
});

await check("source identity is stable across LF and CRLF checkouts", () => {
  assert.equal(canonicalSourceContent("a\r\nb\r\n"), "a\nb\n");
  assert.equal(
    sourceRevisionFromEntries([{ path: "src/example.mjs", content: "a\nb\n" }]),
    sourceRevisionFromEntries([{ path: "src/example.mjs", content: "a\r\nb\r\n" }]),
  );
});

await check("applicability profiles cover the catalog and separate provider-specific gates", () => {
  assert(APPLICABILITY_PROFILES.local.includes("S0-BCK-001"));
  assert(!APPLICABILITY_PROFILES.local.includes("S0-BCK-002"));
  assert(APPLICABILITY_PROFILES.onedrive.includes("S0-BCK-002"));
  assert(!APPLICABILITY_PROFILES.onedrive.includes("S0-BCK-003"));
  assert(APPLICABILITY_PROFILES.ado.includes("S0-BCK-003"));
  assert(APPLICABILITY_PROFILES.github.includes("S0-BCK-004"));
  assert.deepEqual(applicableScenarioIds(config), config.scenarioIds);
});

await check("all five candidates use the same bounded complexity rubric", () => {
  const candidates = [
    { adapter: "local-sqlite", backingPath: "local" },
    { adapter: "local-cas", backingPath: "local" },
    { adapter: "onedrive", backingPath: "onedrive" },
    { adapter: "ado", backingPath: "ado" },
    { adapter: "github", backingPath: "github" },
  ];
  for (const candidate of candidates) {
    const assessment = complexityAssessment(candidate);
    assert.deepEqual(Object.keys(assessment.scores), [...COMPLEXITY_RUBRIC.dimensions]);
    assert(Object.values(assessment.scores).every((score) => Number.isInteger(score) && score >= 1 && score <= 5));
    assert.equal(Object.keys(assessment.evidence).length, COMPLEXITY_RUBRIC.dimensions.length);
  }
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

await check("scenario discriminator survives long run-id slug truncation", async () => {
  const longConfig = structuredClone(config);
  longConfig.runId = "s0-local-cross-platform-runner-with-a-long-identifier";
  longConfig.sandbox.ownershipMarker = `tippani-s0:${longConfig.runId}`;
  const { run } = await runHarness({
    config: longConfig,
    scenarioIds: ["S0-CON-003", "S0-COR-002", "S0-HYD-001"],
    writeArtifacts: false,
  });
  assert(run.results.every((result) => result.status === "Pass"));
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

  await check("workspace journal validation rejects foreign workspace and invalid generation references", () => {
    const workspace = createSyntheticWorkspace({ seed: "journal-validation" });
    const intent = workspace.pushable.remote.intentsById[
      workspace.pushable.remote.orderedIntentIds[0]
    ];
    const journal = {
      journalId: "syn-journal-validation",
      workspaceId: workspace.workspaceId,
      generation: 0,
      status: "planned",
      intentTuples: [{
        intentId: intent.intentId,
        intentRevision: intent.intentRevision,
        contentHash: intent.contentHash,
      }],
    };
    const planned = applyWorkspaceOperation(workspace, { planJournal: journal });
    assert.equal(validateWorkspaceRecord(planned), planned);

    assert.throws(
      () => applyWorkspaceOperation(workspace, {
        planJournal: { ...journal, workspaceId: "syn-ws-foreign" },
      }),
      (error) => error.code === "invalid_journal_workspace",
    );
    assert.throws(
      () => applyWorkspaceOperation(workspace, {
        planJournal: { ...journal, generation: workspace.generation + 1 },
      }),
      (error) => error.code === "invalid_journal_generation",
    );

    const reconciled = applyWorkspaceOperation(planned, {
      reconcileJournal: { journalId: journal.journalId, outcome: "committed" },
    });
    const cleaned = applyWorkspaceOperation(reconciled, {
      clearIntentTuple: journal.intentTuples[0],
    });
    assert.equal(cleaned.pushable.remote.intentsById[intent.intentId], undefined);
    assert.equal(cleaned.publication.journalsById[journal.journalId].status, "committed");
    assert.equal(validateWorkspaceRecord(cleaned), cleaned);
  });

  await check("a live PID lock is never reaped merely because its mtime is old", async () => {
    const directory = path.join(spikeRoot, ".test-state", "lock-live-owner");
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    const lockPath = path.join(directory, "workspace.lock");
    const owner = await acquireLock(lockPath, { timeoutMs: 100 });
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(lockPath, old, old);
    try {
      await assert.rejects(
        acquireLock(lockPath, { timeoutMs: 20, pollMs: 1 }),
        (error) => error.code === "lock_timeout",
      );
    } finally {
      owner.release();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  await check("lock release cannot unlink a replacement owner's claim", async () => {
    const directory = path.join(spikeRoot, ".test-state", "lock-owner-token");
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    const lockPath = path.join(directory, "workspace.lock");
    const owner = await acquireLock(lockPath);
    const replacement = {
      pid: process.pid,
      token: crypto.randomUUID(),
    };
    writeLockOwner(lockPath, replacement);
    assert.equal(owner.release(), false);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(lockPath, `${replacement.token}.owner`), "utf8")).token,
      replacement.token,
    );
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await check("a crashed reclaimer and its stale marker cannot wedge the lock", async () => {
    const directory = path.join(spikeRoot, ".test-state", "lock-reclaimer-crash");
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    const lockPath = path.join(directory, "workspace.lock");
    const deadOwner = { pid: 2147483647, token: crypto.randomUUID() };
    fs.writeFileSync(lockPath, JSON.stringify({ ...deadOwner, at: 0 }));
    fs.writeFileSync(`${lockPath}.reclaim`, "legacy interrupted reclaimer");

    const crashed = await runWorker([
      "--mode=lock-reclaim-crash",
      `--lock-path=${lockPath}`,
    ]);
    assert.equal(crashed.code, 9);
    assert.equal(crashed.report?.phase, "lock-reclamation");
    assert.equal(fs.existsSync(`${lockPath}.reclaim`), true);

    const recovered = await acquireLock(lockPath, { timeoutMs: 100, pollMs: 1 });
    assert.equal(recovered.stolenStaleLock, true);
    assert.equal(fs.existsSync(`${lockPath}.reclaim`), false);
    assert.equal(recovered.release(), true);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await check("stale-lock reaping preserves a replacement owner across the pathname race", async () => {
    const directory = path.join(spikeRoot, ".test-state", "lock-replacement-race");
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    const lockPath = path.join(directory, "workspace.lock");
    const deadOwner = {
      pid: 2147483647,
      token: crypto.randomUUID(),
    };
    writeLockOwner(lockPath, deadOwner);
    const replacement = {
      pid: process.pid,
      token: crypto.randomUUID(),
    };
    let replaced = false;
    await assert.rejects(
      acquireLock(lockPath, {
        timeoutMs: 20,
        pollMs: 1,
        onBeforeReapDelete() {
          if (replaced) return;
          replaced = true;
          fs.rmSync(lockPath, { recursive: true, force: true });
          fs.writeFileSync(lockPath, JSON.stringify({ ...replacement, at: Date.now() }));
        },
      }),
      (error) => error.code === "lock_timeout",
    );
    assert.equal(JSON.parse(fs.readFileSync(lockPath, "utf8")).token, replacement.token);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await check("SQLite persists checksums and fails closed on valid-JSON tamper after restart", async () => {
    const storeRoot = path.join(spikeRoot, ".test-state", "sqlite-checksum-restart");
    fs.rmSync(storeRoot, { recursive: true, force: true });
    const store = new LocalSqliteWorkspaceStore({ storeRoot });
    await store.initialize();
    const workspace = createSyntheticWorkspace({ seed: "sqlite-checksum-restart" });
    await store.createWorkspace(workspace);
    store.injectCorruption(workspace.workspaceId, "valid-json-tamper");
    await store.close();

    const restarted = new LocalSqliteWorkspaceStore({ storeRoot });
    await assert.rejects(
      restarted.initialize(),
      (error) => error.code === "store_corrupt" && /checksum/.test(error.message),
    );
    assert.equal(fs.existsSync(path.join(storeRoot, "workspace.db")), true);
    await restarted.close();
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  await check("SQLite checksum backfill is transactional and resumes after a killed migration", async () => {
    const storeRoot = path.join(spikeRoot, ".test-state", "sqlite-checksum-backfill");
    fs.rmSync(storeRoot, { recursive: true, force: true });
    fs.mkdirSync(storeRoot, { recursive: true });
    const databasePath = path.join(storeRoot, "workspace.db");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);
    const insert = database.prepare(`
      INSERT INTO workspaces (workspace_id, schema_version, generation, payload)
      VALUES (?, 1, ?, ?)
    `);
    for (const seed of ["backfill-one", "backfill-two"]) {
      const workspace = createSyntheticWorkspace({ seed });
      insert.run(workspace.workspaceId, workspace.generation, JSON.stringify(workspace));
    }
    database.close();

    const crashed = await runWorker([
      "--mode=checksum-backfill-crash",
      "--adapter=local-sqlite",
      `--root=${storeRoot}`,
      "--crash-at=during-checksum-backfill",
    ]);
    assert.equal(crashed.code, 9);

    const afterCrash = new DatabaseSync(databasePath);
    const columns = afterCrash.prepare("PRAGMA table_info(workspaces)").all();
    if (columns.some((column) => column.name === "checksum")) {
      assert.equal(
        afterCrash.prepare("SELECT COUNT(*) AS n FROM workspaces WHERE checksum IS NOT NULL").get().n,
        0,
        "A killed backfill must not leave partially checksummed rows",
      );
    }
    afterCrash.close();

    const resumed = new LocalSqliteWorkspaceStore({ storeRoot });
    assert.equal((await resumed.initialize()).workspaceCount, 2);
    const verified = new DatabaseSync(databasePath);
    assert.equal(
      verified.prepare(`
        SELECT COUNT(*) AS n
        FROM workspaces
        WHERE checksum IS NULL OR checksum = ''
           OR checksum_version IS NULL
           OR checksum_version != ?
      `).get(DURABLE_IDENTITY_CHECKSUM_VERSION).n,
      0,
    );
    verified.close();
    await resumed.close();
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  await check("CAS upgrades PR-head v1 envelopes to the identity-bound checksum format", async () => {
    const storeRoot = path.join(spikeRoot, ".test-state", "cas-checksum-v1-upgrade");
    fs.rmSync(storeRoot, { recursive: true, force: true });
    const workspace = createSyntheticWorkspace({ seed: "cas-checksum-v1-upgrade" });
    writeLegacyCasEnvelope(storeRoot, workspace);

    const store = new LocalCasWorkspaceStore({ storeRoot });
    assert.equal((await store.initialize()).workspaceCount, 1);
    assert.deepEqual(await store.readWorkspace(workspace.workspaceId), workspace);
    const upgraded = JSON.parse(fs.readFileSync(store.envelopePath(workspace.workspaceId), "utf8"));
    assert.equal(upgraded.checksumVersion, DURABLE_IDENTITY_CHECKSUM_VERSION);
    assert.equal(upgraded.durableWorkspaceId, workspace.workspaceId);
    assert.equal(upgraded.checksum, checksumWorkspace(workspace, workspace.workspaceId));
    assert.notEqual(upgraded.checksum, checksumWorkspaceV1(workspace));
    await store.close();
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  await check("CAS checksum upgrade survives a killed atomic replacement and resumes", async () => {
    const storeRoot = path.join(spikeRoot, ".test-state", "cas-checksum-upgrade-crash");
    fs.rmSync(storeRoot, { recursive: true, force: true });
    const current = createSyntheticWorkspace({ seed: "cas-checksum-upgrade-a-current" });
    const legacy = ["b-one", "c-two"].map((suffix) =>
      createSyntheticWorkspace({ seed: `cas-checksum-upgrade-${suffix}` }));
    writeCurrentCasEnvelope(storeRoot, current);
    for (const workspace of legacy) writeLegacyCasEnvelope(storeRoot, workspace);

    const crashed = await runWorker([
      "--mode=checksum-backfill-crash",
      "--adapter=local-cas",
      `--root=${storeRoot}`,
      "--crash-at=during-checksum-upgrade",
    ]);
    assert.equal(crashed.code, 9);
    const preserved = JSON.parse(fs.readFileSync(
      path.join(storeRoot, "workspaces", `${current.workspaceId}.json`),
      "utf8",
    ));
    assert.equal(preserved.checksumVersion, DURABLE_IDENTITY_CHECKSUM_VERSION);
    for (const workspace of legacy) {
      const envelope = JSON.parse(fs.readFileSync(
        path.join(storeRoot, "workspaces", `${workspace.workspaceId}.json`),
        "utf8",
      ));
      assert.equal(envelope.checksumVersion, undefined);
      assert.equal(envelope.checksum, checksumWorkspaceV1(workspace));
    }

    const resumed = new LocalCasWorkspaceStore({ storeRoot });
    const workspaces = [current, ...legacy];
    assert.equal((await resumed.initialize()).workspaceCount, workspaces.length);
    for (const workspace of workspaces) {
      assert.deepEqual(await resumed.readWorkspace(workspace.workspaceId), workspace);
      const envelope = JSON.parse(fs.readFileSync(resumed.envelopePath(workspace.workspaceId), "utf8"));
      assert.equal(envelope.checksumVersion, DURABLE_IDENTITY_CHECKSUM_VERSION);
      assert.equal(envelope.durableWorkspaceId, workspace.workspaceId);
    }
    await resumed.close();
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  await check("SQLite versions and upgrades legacy checksums transactionally", async () => {
    const storeRoot = path.join(spikeRoot, ".test-state", "sqlite-checksum-v1-upgrade");
    fs.rmSync(storeRoot, { recursive: true, force: true });
    fs.mkdirSync(storeRoot, { recursive: true });
    const workspace = createSyntheticWorkspace({ seed: "sqlite-checksum-v1-upgrade" });
    const databasePath = path.join(storeRoot, "workspace.db");
    const database = new DatabaseSync(databasePath);
    database.exec(`
      CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        generation INTEGER NOT NULL,
        payload TEXT NOT NULL,
        checksum TEXT,
        checksum_version INTEGER
      )
    `);
    database.prepare(`
      INSERT INTO workspaces (
        workspace_id, schema_version, generation, payload, checksum, checksum_version
      )
      VALUES (?, 1, ?, ?, ?, ?)
    `).run(
      workspace.workspaceId,
      workspace.generation,
      JSON.stringify(workspace),
      checksumWorkspaceV1(workspace),
      LEGACY_WORKSPACE_CHECKSUM_VERSION,
    );
    database.close();

    const store = new LocalSqliteWorkspaceStore({ storeRoot });
    assert.equal((await store.initialize()).workspaceCount, 1);
    assert.deepEqual(await store.readWorkspace(workspace.workspaceId), workspace);
    const verified = new DatabaseSync(databasePath);
    const row = verified.prepare(`
      SELECT checksum, checksum_version
      FROM workspaces
      WHERE workspace_id = ?
    `).get(workspace.workspaceId);
    assert.equal(row.checksum_version, DURABLE_IDENTITY_CHECKSUM_VERSION);
    assert.equal(row.checksum, checksumWorkspace(workspace, workspace.workspaceId));
    verified.close();
    await store.close();
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  await check("durable record identity prevents CAS filename and SQLite row substitution", async () => {
    const casRoot = path.join(spikeRoot, ".test-state", "cas-identity-binding");
    fs.rmSync(casRoot, { recursive: true, force: true });
    const cas = new LocalCasWorkspaceStore({ storeRoot: casRoot });
    await cas.initialize();
    const casWorkspace = createSyntheticWorkspace({ seed: "cas-identity-source" });
    const replacementId = "syn-ws-cas-identity-replacement";
    await cas.createWorkspace(casWorkspace);
    cas.injectIdentitySubstitution(casWorkspace.workspaceId, replacementId);
    await assert.rejects(
      cas.readWorkspace(replacementId),
      (error) => error.code === "store_corrupt" && /filename/.test(error.message),
    );
    await cas.close();

    const legacyCasRoot = path.join(spikeRoot, ".test-state", "cas-v1-identity-binding");
    fs.rmSync(legacyCasRoot, { recursive: true, force: true });
    const legacyWorkspace = createSyntheticWorkspace({ seed: "cas-v1-identity-source" });
    writeLegacyCasEnvelope(legacyCasRoot, legacyWorkspace);
    const legacyPath = path.join(
      legacyCasRoot,
      "workspaces",
      `${legacyWorkspace.workspaceId}.json`,
    );
    const legacyReplacementId = "syn-ws-cas-v1-identity-replacement";
    fs.renameSync(
      legacyPath,
      path.join(legacyCasRoot, "workspaces", `${legacyReplacementId}.json`),
    );
    const legacyCas = new LocalCasWorkspaceStore({ storeRoot: legacyCasRoot });
    await assert.rejects(
      legacyCas.initialize(),
      (error) => error.code === "store_corrupt" && /filename/.test(error.message),
    );
    const substituted = JSON.parse(fs.readFileSync(
      path.join(legacyCasRoot, "workspaces", `${legacyReplacementId}.json`),
      "utf8",
    ));
    assert.equal(substituted.checksumVersion, undefined);
    await legacyCas.close();

    const sqliteRoot = path.join(spikeRoot, ".test-state", "sqlite-identity-binding");
    fs.rmSync(sqliteRoot, { recursive: true, force: true });
    const sqlite = new LocalSqliteWorkspaceStore({ storeRoot: sqliteRoot });
    await sqlite.initialize();
    const sqliteWorkspace = createSyntheticWorkspace({ seed: "sqlite-identity-source" });
    await sqlite.createWorkspace(sqliteWorkspace);
    sqlite.injectIdentitySubstitution(
      sqliteWorkspace.workspaceId,
      "syn-ws-sqlite-identity-replacement",
    );
    await assert.rejects(
      sqlite.readWorkspace(sqliteWorkspace.workspaceId),
      (error) => error.code === "store_corrupt" && /database key/.test(error.message),
    );
    await sqlite.close();
    fs.rmSync(casRoot, { recursive: true, force: true });
    fs.rmSync(legacyCasRoot, { recursive: true, force: true });
    fs.rmSync(sqliteRoot, { recursive: true, force: true });
  });
  const owned = {
    kind: "synthetic-ref",
    id: "syn-resource-1",
    runId: config.runId,
    ownershipMarker: config.sandbox.ownershipMarker,
  };
  manifest.record(owned);
  assert.equal(manifest.authorize(owned), true);
  manifest.bindCondition(owned, { syntheticPrepared: true });
  manifest.markMutating(owned);
  manifest.markDeleted(owned);
  manifest.markCleaned(owned);
  assert.equal(manifest.authorize(owned), false);
  assert.throws(() => manifest.markCleaned(owned), /Refusing cleanup/);
});

await check("CAS serializes global alias claims across store instances", async () => {
  const storeRoot = path.join(spikeRoot, ".test-state", "cas-global-alias");
  fs.rmSync(storeRoot, { recursive: true, force: true });
  const first = new LocalCasWorkspaceStore({ storeRoot });
  const second = new LocalCasWorkspaceStore({ storeRoot });
  await first.initialize();
  await second.initialize();
  const left = createSyntheticWorkspace({ seed: "cas-global-alias-left" });
  const right = createSyntheticWorkspace({ seed: "cas-global-alias-right" });
  right.aliases = [left.aliases[0]];
  const settled = await Promise.allSettled([
    first.createWorkspace(left),
    second.createWorkspace(right),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(
    settled.filter((result) =>
      result.status === "rejected" && result.reason?.code === "alias_conflict").length,
    1,
  );
  const winner = settled.find((result) => result.status === "fulfilled").value;
  const verifier = new LocalCasWorkspaceStore({ storeRoot });
  await verifier.initialize();
  assert.equal((await verifier.resolveAlias(left.aliases[0])).workspaceId, winner.workspaceId);
  await first.close();
  await second.close();
  await verifier.close();
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

await check("CAS restore switches one authoritative HEAD only after a complete stage", async () => {
  const storeRoot = path.join(spikeRoot, ".test-state", "cas-restore-head");
  fs.rmSync(storeRoot, { recursive: true, force: true });
  const store = new LocalCasWorkspaceStore({ storeRoot });
  await store.initialize();
  const stale = createSyntheticWorkspace({ seed: "cas-restore-stale" });
  const left = createSyntheticWorkspace({ seed: "cas-restore-left" });
  const right = createSyntheticWorkspace({ seed: "cas-restore-right" });
  await store.createWorkspace(stale);
  const headBefore = fs.readFileSync(path.join(storeRoot, "HEAD"), "utf8");
  const snapshot = {
    schemaVersion: 1,
    syntheticData: true,
    workspaces: [left, right],
  };
  await assert.rejects(
    store.restore(snapshot, {
      faultInjector: new FaultInjector(["during-restore-stage"]),
    }),
    InjectedFaultError,
  );
  assert.equal(fs.readFileSync(path.join(storeRoot, "HEAD"), "utf8"), headBefore);
  assert.deepEqual(await store.listWorkspaces(), [stale.workspaceId]);

  await store.restore(snapshot);
  assert.deepEqual(await store.listWorkspaces(), [left.workspaceId, right.workspaceId].sort());
  await assert.rejects(
    store.readWorkspace(stale.workspaceId),
    (error) => error.code === "workspace_not_found",
  );
  const head = JSON.parse(fs.readFileSync(path.join(storeRoot, "HEAD"), "utf8"));
  assert.match(head.directory, /^workspaces\.restore-/);
  assert.equal(fs.existsSync(path.join(storeRoot, head.directory)), true);
  await store.close();
  fs.rmSync(storeRoot, { recursive: true, force: true });
});

await check("cleanup manifest rejects stale two-instance transitions", () => {
  const root = path.join(spikeRoot, ".test-state", "cleanup-stale-instance");
  const filePath = path.join(root, "cleanup-manifest.json");
  fs.rmSync(root, { recursive: true, force: true });
  const resource = {
    kind: "synthetic-ref",
    id: "syn-stale-resource",
    runId: "s0-cleanup-stale",
    ownershipMarker: "tippani-s0:s0-cleanup-stale",
  };
  const created = new CleanupManifest({
    runId: resource.runId,
    ownershipMarker: resource.ownershipMarker,
    filePath,
  });
  created.record(resource);
  const first = CleanupManifest.load(filePath);
  const second = CleanupManifest.load(filePath);
  const firstResource = structuredClone(first.resources[0]);
  delete firstResource.cleaned;
  const secondResource = structuredClone(second.resources[0]);
  delete secondResource.cleaned;
  first.bindCondition(firstResource, { expected: "v1" });
  assert.throws(
    () => second.bindCondition(secondResource, { expected: "stale" }),
    (error) => error.code === "cleanup_manifest_stale",
  );
  const persisted = CleanupManifest.load(filePath);
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.resources[0].phase, "prepared");
  assert.deepEqual(persisted.resources[0].condition, { expected: "v1" });
  fs.rmSync(root, { recursive: true, force: true });
});

await check("cleanup manifest reconciles an indeterminate post-rename write", () => {
  const root = path.join(spikeRoot, ".test-state", "cleanup-indeterminate-write");
  const filePath = path.join(root, "cleanup-manifest.json");
  fs.rmSync(root, { recursive: true, force: true });
  let failSync = false;
  const resource = {
    kind: "synthetic-ref",
    id: "syn-indeterminate-resource",
    runId: "s0-cleanup-indeterminate",
    ownershipMarker: "tippani-s0:s0-cleanup-indeterminate",
  };
  const manifest = new CleanupManifest({
    runId: resource.runId,
    ownershipMarker: resource.ownershipMarker,
    filePath,
    syncDirectory(directory) {
      if (failSync) {
        const error = new Error("injected directory fsync failure");
        error.code = "EIO";
        throw error;
      }
      return fsyncDirectorySync(directory);
    },
  });
  manifest.record(resource);
  failSync = true;
  assert.throws(
    () => manifest.bindCondition(resource, { expected: "v2" }),
    (error) =>
      error.code === "indeterminate_write" &&
      error.reason === "directory_fsync_failed" &&
      error.requiresReconciliation === true &&
      error.reconciled === true &&
      error.persistedRevision === 2,
  );
  assert.equal(manifest.revision, 2);
  assert.equal(manifest.resources[0].phase, "prepared");
  assert.equal(resource.phase, "prepared");
  assert.deepEqual(resource.condition, { expected: "v2" });
  assert.equal(CleanupManifest.load(filePath).revision, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

await check("cleanup manifest preserves and poisons indeterminate state when reload fails", () => {
  const root = path.join(spikeRoot, ".test-state", "cleanup-indeterminate-reload");
  const filePath = path.join(root, "cleanup-manifest.json");
  fs.rmSync(root, { recursive: true, force: true });
  let failSync = false;
  let failReload = false;
  const resource = {
    kind: "synthetic-ref",
    id: "syn-indeterminate-reload-resource",
    runId: "s0-cleanup-indeterminate-reload",
    ownershipMarker: "tippani-s0:s0-cleanup-indeterminate-reload",
  };
  const manifest = new CleanupManifest({
    runId: resource.runId,
    ownershipMarker: resource.ownershipMarker,
    filePath,
    loadPersisted(target) {
      if (failReload) {
        const error = new Error("injected persisted-state read failure");
        error.code = "EIO";
        throw error;
      }
      return CleanupManifest.load(target);
    },
    syncDirectory(directory) {
      if (failSync) {
        failReload = true;
        const error = new Error("injected directory fsync failure");
        error.code = "EIO";
        throw error;
      }
      return fsyncDirectorySync(directory);
    },
  });
  manifest.record(resource);
  failSync = true;
  assert.throws(
    () => manifest.bindCondition(resource, { expected: "indeterminate" }),
    (error) =>
      error.code === "indeterminate_write" &&
      error.requiresReconciliation === true &&
      error.reconciled === false &&
      error.reconciliationError?.code === "EIO",
  );
  assert.equal(manifest.revision, 2);
  assert.equal(manifest.resources[0].phase, "prepared");
  assert.equal(resource.phase, "prepared");
  assert.deepEqual(resource.condition, { expected: "indeterminate" });
  assert.equal(manifest.reconciliationRequired, true);
  assert.throws(
    () => manifest.markMutating(resource),
    (error) =>
      error.code === "cleanup_manifest_reconciliation_required" &&
      error.requiresReconciliation === true,
  );
  assert.equal(manifest.revision, 2);
  assert.equal(manifest.resources[0].phase, "prepared");

  failSync = false;
  failReload = false;
  manifest.reloadPersisted(resource);
  assert.equal(manifest.reconciliationRequired, false);
  manifest.markMutating(resource);
  assert.equal(manifest.revision, 3);
  assert.equal(manifest.resources[0].phase, "mutating");
  fs.rmSync(root, { recursive: true, force: true });
});

await check("atomic file replacement fsyncs its parent and cleans failed temps", () => {
  const root = path.join(spikeRoot, ".test-state", "atomic-parent-fsync");
  const filePath = path.join(root, "state.json");
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  let syncedDirectory = null;
  writeFileAtomicSync(filePath, "one", {
    syncDirectory(directory) {
      syncedDirectory = directory;
    },
  });
  assert.equal(syncedDirectory, root);
  assert.equal(fs.readFileSync(filePath, "utf8"), "one");
  assert.throws(
    () => writeFileAtomicSync(filePath, "two", {
      syncDirectory() {
        const error = new Error("injected directory fsync failure");
        error.code = "EIO";
        throw error;
      },
    }),
    (error) =>
      error.code === "indeterminate_write" &&
      error.reason === "directory_fsync_failed" &&
      error.commitPoint === "rename" &&
      error.requiresReconciliation === true &&
      error.cause?.code === "EIO",
  );
  assert.equal(fs.readFileSync(filePath, "utf8"), "two");
  assert.throws(
    () => writeFileAtomicSync(filePath, "three", {
      onBeforeRename() {
        throw new Error("injected before rename");
      },
    }),
    /injected before rename/,
  );
  assert.equal(fs.readFileSync(filePath, "utf8"), "two");
  assert.deepEqual(listTempArtifacts(root), []);
  fs.rmSync(root, { recursive: true, force: true });
});

await check("CAS reconciles an indeterminate post-rename workspace write", async () => {
  const storeRoot = path.join(spikeRoot, ".test-state", "cas-indeterminate-write");
  fs.rmSync(storeRoot, { recursive: true, force: true });
  let failSync = false;
  const store = new LocalCasWorkspaceStore({
    storeRoot,
    syncDirectory(directory) {
      if (failSync) {
        const error = new Error("injected directory fsync failure");
        error.code = "EIO";
        throw error;
      }
      return fsyncDirectorySync(directory);
    },
  });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "cas-indeterminate-write" });
  await store.createWorkspace(workspace);
  const alias = "syn-alias-indeterminate-write";
  failSync = true;
  await assert.rejects(
    store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { addAliases: [alias] },
    }),
    (error) =>
      error.code === "indeterminate_write" &&
      error.requiresReconciliation === true &&
      error.reconciled === true &&
      error.persistedGeneration === 1,
  );
  assert.equal((await store.readWorkspace(workspace.workspaceId)).generation, 1);
  assert.equal((await store.resolveAlias(alias)).workspaceId, workspace.workspaceId);
  await store.close();
  fs.rmSync(storeRoot, { recursive: true, force: true });
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

await check("a reviewer-approved N/A gate is not-applicable, not unresolved, and does not block eligibility", () => {
  const catalog = [
    { id: "S0-ATM-001", criterionType: "absolute", title: "a" },
    { id: "S0-REC-002", criterionType: "absolute", title: "stale lock recovery" },
  ];
  const withNa = {
    catalog,
    results: [
      { scenarioId: "S0-ATM-001", criterionType: "absolute", status: "Pass" },
      {
        scenarioId: "S0-REC-002",
        criterionType: "absolute",
        status: "N/A",
        reason: "contract",
        contractRationale: {
          scenarioId: "S0-REC-002",
          rationale: "This scenario form is replaced by an independently verified engine journal.",
        },
        approval: {
          approver: "Synthetic Independent Reviewer",
          approvedAt: "2026-09-03T20:00:00.000Z",
          reference: "syn-review-91",
        },
      },
    ],
  };
  const gates = gateSummary(withNa);
  assert.equal(gates.na.length, 1);
  assert.equal(gates.notApplicable.length, 0);
  assert.equal(gates.unresolved.length, 0);
  assert.equal(gates.eligible, "Yes");
});

await check("an unstructured N/A is incomplete and blocks eligibility", () => {
  const run = {
    catalog: [{ id: "S0-REC-002", criterionType: "absolute", title: "stale lock recovery" }],
    results: [{ scenarioId: "S0-REC-002", status: "N/A", reason: "unreviewed" }],
  };
  const gates = gateSummary(run);
  assert.equal(gates.na.length, 0);
  assert.equal(gates.invalidNa.length, 1);
  assert.equal(gates.unresolved[0].status, "Incomplete");
  assert.equal(gates.eligible, "Incomplete");
});

await check("an approved N/A without a scenario-specific rationale remains incomplete", () => {
  const run = {
    catalog: [{ id: "S0-REC-002", criterionType: "absolute", title: "stale lock recovery" }],
    results: [{
      scenarioId: "S0-REC-002",
      status: "N/A",
      reason: "generic exception",
      approval: {
        approver: "Synthetic Independent Reviewer",
        approvedAt: "2026-09-03T20:00:00.000Z",
        reference: "syn-review-91",
      },
    }],
  };
  const gates = gateSummary(run);
  assert.equal(gates.eligible, "Incomplete");
  assert.match(gates.unresolved[0].reason, /scenario-specific contract rationale/);
});

await check("a future-dated N/A approval is incomplete at the run time", () => {
  const run = {
    completedAt: "2026-09-08T20:00:00.000Z",
    catalog: [{ id: "S0-REC-002", criterionType: "absolute", title: "recovery" }],
    results: [{
      scenarioId: "S0-REC-002",
      status: "N/A",
      approval: {
        approver: "Synthetic Reviewer",
        approvedAt: "2026-09-09T20:00:00.000Z",
        reference: "syn-future",
      },
      contractRationale: {
        scenarioId: "S0-REC-002",
        rationale: "Synthetic rationale.",
      },
    }],
  };
  const gates = gateSummary(run);
  assert.equal(gates.eligible, "Incomplete");
  assert.match(gates.unresolved[0].reason, /future/);
});

await check("corrected local SQLite gates report checksum coverage, real migration kill, and known limitations", async () => {
  const sqliteConfig = JSON.parse(fs.readFileSync(
    path.join(spikeRoot, "config", "local-sqlite.json"),
    "utf8",
  ));
  const { run } = await runHarness({
    config: sqliteConfig,
    scenarioIds: ["S0-CON-003", "S0-CRS-003", "S0-COR-001", "S0-PER-001", "S0-PER-003"],
    writeArtifacts: false,
  });
  const byId = new Map(run.results.map((result) => [result.scenarioId, result]));
  assert.equal(byId.get("S0-CON-003").status, "Fail");
  assert.equal(byId.get("S0-CON-003").error.code, "global_write_serialization");
  assert.equal(byId.get("S0-CRS-003").status, "Pass");
  assert.equal(byId.get("S0-CRS-003").evidence.operation, "migration");
  assert.equal(byId.get("S0-COR-001").status, "Pass");
  assert.equal(byId.get("S0-COR-001").evidence.validJsonChecksumTamperRejected, true);
  assert.equal(byId.get("S0-PER-001").status, "Incomplete");
  assert.equal(byId.get("S0-PER-003").status, "Incomplete");
});

await check("gates assigned to another configuration are Not applicable, not missing", () => {
  const catalog = [
    { id: "S0-ATM-001", criterionType: "absolute", title: "local" },
    { id: "S0-COL-002", criterionType: "absolute", title: "provider" },
  ];
  const run = {
    applicableScenarioIds: ["S0-ATM-001"],
    catalog,
    results: [{ scenarioId: "S0-ATM-001", criterionType: "absolute", status: "Pass" }],
  };
  const gates = gateSummary(run);
  assert.equal(gates.eligible, "Yes");
  assert.equal(gates.missing.length, 0);
  assert.deepEqual(gates.notApplicable.map((item) => item.id), ["S0-COL-002"]);
});

console.log(`s0-persistence-harness: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
