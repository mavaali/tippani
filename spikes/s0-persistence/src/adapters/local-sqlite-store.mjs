// Candidate B: SQLite transactions over related workspace and alias rows.
//
// Uses the built-in node:sqlite module so the spike needs no native build
// step. Workspace state and the alias index are separate tables updated inside
// one BEGIN IMMEDIATE transaction, which is the property this candidate is
// meant to demonstrate.

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CorruptWorkspaceStoreError,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WorkspaceStoreError,
  applyWorkspaceOperation,
  assertReconcilable,
  checksumWorkspace,
  deepClone,
  needsReconciliation,
  validateWorkspaceRecord,
} from "../workspace-contract.mjs";
import { migrateWorkspaceV0ToV1 } from "../synthetic-fixtures.mjs";

const SCHEMA_VERSION = 1;

export class LocalSqliteWorkspaceStore {
  constructor({ storeRoot, configurationId = "CFG-LOCAL-SQLITE", busyTimeoutMs = 10_000 } = {}) {
    if (!storeRoot) throw new TypeError("storeRoot is required");
    this.configurationId = configurationId;
    this.root = storeRoot;
    this.databasePath = path.join(storeRoot, "workspace.db");
    this.busyTimeoutMs = busyTimeoutMs;
    this.db = null;
    this.readFaults = new Set();
    this.initialized = false;
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
    }
  }

  async initialize() {
    fs.mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(`PRAGMA busy_timeout = ${Number(this.busyTimeoutMs)}`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_id   TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL,
        generation     INTEGER NOT NULL,
        payload        TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS aliases (
        alias        TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS legacy_workspaces (
        workspace_id TEXT PRIMARY KEY,
        payload      TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS migrated_workspaces (
        workspace_id TEXT PRIMARY KEY,
        payload      TEXT NOT NULL
      );
    `);
    // Boot-time validation: every stored record must parse and validate before
    // the store is usable.
    const rows = this.db.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id").all();
    this.initialized = true;
    try {
      for (const row of rows) this.decodeRow(row.workspace_id);
    } catch (error) {
      this.initialized = false;
      throw error;
    }
    return { workspaceCount: rows.length };
  }

  decodeRow(workspaceId) {
    if (this.readFaults.has(workspaceId)) {
      this.readFaults.delete(workspaceId);
      throw new CorruptWorkspaceStoreError(
        `Cannot read workspace ${workspaceId}: EACCES (injected)`,
      );
    }
    const row = this.db
      .prepare("SELECT payload, schema_version FROM workspaces WHERE workspace_id = ?")
      .get(workspaceId);
    if (!row) throw new WorkspaceNotFoundError(workspaceId);
    if (row.schema_version !== SCHEMA_VERSION) {
      throw new WorkspaceStoreError("Unsupported workspace schema version", "unsupported_schema");
    }
    let parsed;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      throw new CorruptWorkspaceStoreError(`Workspace ${workspaceId} payload is not valid JSON`);
    }
    try {
      return validateWorkspaceRecord(parsed);
    } catch (error) {
      throw new CorruptWorkspaceStoreError(
        `Workspace ${workspaceId} payload failed validation: ${error.message}`,
      );
    }
  }

  writeRows(workspace) {
    this.db
      .prepare(`
        INSERT INTO workspaces (workspace_id, schema_version, generation, payload)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET generation = excluded.generation,
                                                payload = excluded.payload
      `)
      .run(workspace.workspaceId, SCHEMA_VERSION, workspace.generation, JSON.stringify(workspace));
    this.db.prepare("DELETE FROM aliases WHERE workspace_id = ?").run(workspace.workspaceId);
    const insert = this.db.prepare("INSERT INTO aliases (alias, workspace_id) VALUES (?, ?)");
    for (const alias of workspace.aliases) {
      try {
        insert.run(alias, workspace.workspaceId);
      } catch (error) {
        if (String(error?.message || "").includes("UNIQUE")) {
          throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
        }
        throw error;
      }
    }
  }

  rollbackQuietly() {
    try { this.db.exec("ROLLBACK"); } catch { /* no active transaction */ }
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.db
        .prepare("SELECT 1 AS present FROM workspaces WHERE workspace_id = ?")
        .get(workspace.workspaceId);
      if (existing) {
        throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
      }
      this.writeRows(workspace);
      this.db.exec("COMMIT");
      return deepClone(workspace);
    } catch (error) {
      this.rollbackQuietly();
      throw error;
    }
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    return this.decodeRow(workspaceId);
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    const row = this.db
      .prepare("SELECT workspace_id FROM aliases WHERE alias = ?")
      .get(alias);
    return row ? this.decodeRow(row.workspace_id) : null;
  }

  async listWorkspaces() {
    this.ensureInitialized();
    return this.db
      .prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id")
      .all()
      .map((row) => row.workspace_id);
  }

  async compareAndSwap({ workspaceId, expectedGeneration, operation, faultInjector = null }) {
    this.ensureInitialized();
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.decodeRow(workspaceId);
      if (current.generation !== expectedGeneration) {
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
      }
      assertReconcilable(current, operation);
      const next = applyWorkspaceOperation(current, operation);
      this.writeRows(next);
      faultInjector?.hit("before-commit");
      this.db.exec("COMMIT");
      committed = true;
      faultInjector?.hit("after-commit");
      return deepClone(next);
    } catch (error) {
      if (!committed) this.rollbackQuietly();
      throw error;
    }
  }

  async backup() {
    this.ensureInitialized();
    const ids = await this.listWorkspaces();
    return {
      schemaVersion: SCHEMA_VERSION,
      syntheticData: true,
      configurationId: this.configurationId,
      workspaces: ids.map((id) => this.decodeRow(id)),
    };
  }

  async restore(snapshot, { faultInjector = null } = {}) {
    this.ensureInitialized();
    if (snapshot?.schemaVersion !== SCHEMA_VERSION || snapshot?.syntheticData !== true ||
        !Array.isArray(snapshot?.workspaces)) {
      throw new CorruptWorkspaceStoreError("Backup is invalid");
    }
    const seen = new Set();
    for (const workspace of snapshot.workspaces) {
      validateWorkspaceRecord(workspace);
      if (seen.has(workspace.workspaceId)) {
        throw new CorruptWorkspaceStoreError("Backup contains duplicate workspace IDs");
      }
      seen.add(workspace.workspaceId);
    }
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec("DELETE FROM aliases");
      this.db.exec("DELETE FROM workspaces");
      for (const workspace of snapshot.workspaces) this.writeRows(workspace);
      faultInjector?.hit("before-restore-commit");
      this.db.exec("COMMIT");
      committed = true;
      faultInjector?.hit("after-restore-commit");
      return { workspaceCount: snapshot.workspaces.length };
    } catch (error) {
      if (!committed) this.rollbackQuietly();
      throw error;
    }
  }

  injectCorruption(workspaceId) {
    const existing = this.db
      .prepare("SELECT 1 AS present FROM workspaces WHERE workspace_id = ?")
      .get(workspaceId);
    if (!existing) throw new WorkspaceNotFoundError(workspaceId);
    this.db
      .prepare("UPDATE workspaces SET payload = ? WHERE workspace_id = ?")
      .run('{"workspaceId":"syn-ws-trunc', workspaceId);
  }

  /** Force the next raw read of this workspace to fail as permission-denied. */
  injectReadFault(workspaceId) {
    this.readFaults.add(workspaceId);
  }

  seedLegacy(legacyRecord) {
    this.ensureInitialized();
    if (!legacyRecord?.workspaceId) throw new TypeError("Legacy record needs a workspaceId");
    this.db
      .prepare(`
        INSERT INTO legacy_workspaces (workspace_id, payload) VALUES (?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET payload = excluded.payload
      `)
      .run(legacyRecord.workspaceId, JSON.stringify(legacyRecord));
  }

  legacyCount() {
    return this.db.prepare("SELECT COUNT(*) AS n FROM legacy_workspaces").get().n;
  }

  async migrate({ faultInjector = null } = {}) {
    this.ensureInitialized();
    const rows = this.db
      .prepare("SELECT workspace_id, payload FROM legacy_workspaces ORDER BY workspace_id")
      .all();
    let migrated = 0;
    for (const row of rows) {
      let legacy;
      try {
        legacy = JSON.parse(row.payload);
      } catch {
        throw new CorruptWorkspaceStoreError(`Legacy record ${row.workspace_id} is not valid JSON`);
      }
      // Fails closed on any unsupported source version before touching the store.
      const migratedWorkspace = migrateWorkspaceV0ToV1(legacy);
      let committed = false;
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const exists = this.db
          .prepare("SELECT 1 AS present FROM workspaces WHERE workspace_id = ?")
          .get(migratedWorkspace.workspaceId);
        if (!exists) this.writeRows(migratedWorkspace);
        this.db.prepare("INSERT OR REPLACE INTO migrated_workspaces (workspace_id, payload) VALUES (?, ?)")
          .run(row.workspace_id, row.payload);
        this.db.prepare("DELETE FROM legacy_workspaces WHERE workspace_id = ?").run(row.workspace_id);
        faultInjector?.hit("before-migration-commit");
        this.db.exec("COMMIT");
        committed = true;
        faultInjector?.hit("after-migration-commit");
        migrated++;
      } catch (error) {
        if (!committed) this.rollbackQuietly();
        throw error;
      }
    }
    return { migrated, pending: this.legacyCount() };
  }

  async importEnvelope(envelope, { faultInjector = null } = {}) {
    this.ensureInitialized();
    if (envelope?.schemaVersion !== SCHEMA_VERSION || envelope?.syntheticData !== true ||
        !envelope.workspace) {
      throw new CorruptWorkspaceStoreError("Import envelope is malformed");
    }
    if (envelope.checksum !== checksumWorkspace(envelope.workspace)) {
      throw new CorruptWorkspaceStoreError("Import envelope failed checksum validation");
    }
    validateWorkspaceRecord(envelope.workspace);
    const workspace = envelope.workspace;
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const exists = this.db
        .prepare("SELECT 1 AS present FROM workspaces WHERE workspace_id = ?")
        .get(workspace.workspaceId);
      if (exists) throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
      this.writeRows(workspace);
      faultInjector?.hit("before-import-commit");
      this.db.exec("COMMIT");
      committed = true;
      faultInjector?.hit("after-import-commit");
      return {
        receiptId: `syn-receipt-${workspace.workspaceId}-${workspace.generation}`,
        workspaceId: workspace.workspaceId,
        generation: workspace.generation,
        importedAt: "2000-01-01T00:00:00.000Z",
      };
    } catch (error) {
      if (!committed) this.rollbackQuietly();
      throw error;
    }
  }

  /** Redacted structural diagnostics: identity and health, never content. */
  diagnostics() {
    this.ensureInitialized();
    const ids = this.db
      .prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id")
      .all()
      .map((row) => row.workspace_id);
    return {
      schemaVersion: SCHEMA_VERSION,
      syntheticData: true,
      configurationId: this.configurationId,
      adapter: "local-sqlite",
      pendingMigrations: this.legacyCount(),
      workspaces: ids.map((id) => {
        try {
          const workspace = this.decodeRow(id);
          return {
            workspaceId: id,
            generation: workspace.generation,
            aliasCount: workspace.aliases.length,
            documentCount: Object.keys(workspace.documentsByPath).length,
            intentCount: workspace.pushable.remote.orderedIntentIds.length,
            activeJournalId: workspace.publication.activeJournalId,
            needsReconciliation: needsReconciliation(workspace),
            health: "ok",
          };
        } catch (error) {
          return {
            workspaceId: id,
            health: error?.code === "workspace_not_found" ? "absent" : "corrupt",
          };
        }
      }),
    };
  }

  strayTempFiles() {
    return [];
  }

  async close() {
    this.initialized = false;
    try { this.db?.close(); } catch { /* already closed */ }
    this.db = null;
  }
}
