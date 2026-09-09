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

export class ReferenceMemoryWorkspaceStore {
  constructor({ configurationId = "CFG-REF-MEM" } = {}) {
    this.configurationId = configurationId;
    this.records = new Map();
    this.aliases = new Map();
    this.readFaults = new Set();
    this.legacy = new Map();
    this.migratedArchive = new Map();
    this.initialized = false;
  }

  async initialize() {
    for (const value of this.records.values()) {
      if (value?.corrupt) throw new CorruptWorkspaceStoreError();
      validateWorkspaceRecord(value);
    }
    this.initialized = true;
    return { workspaceCount: this.records.size };
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
    }
  }

  validateAliases(workspace, aliases = this.aliases) {
    for (const alias of workspace.aliases) {
      const owner = aliases.get(alias);
      if (owner && owner !== workspace.workspaceId) {
        throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
      }
    }
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    if (this.records.has(workspace.workspaceId)) {
      throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
    }
    this.validateAliases(workspace);
    const nextRecords = new Map(this.records);
    const nextAliases = new Map(this.aliases);
    nextRecords.set(workspace.workspaceId, deepClone(workspace));
    for (const alias of workspace.aliases) nextAliases.set(alias, workspace.workspaceId);
    this.records = nextRecords;
    this.aliases = nextAliases;
    return deepClone(workspace);
  }

  readRaw(workspaceId) {
    if (this.readFaults.has(workspaceId)) {
      this.readFaults.delete(workspaceId);
      throw new CorruptWorkspaceStoreError(
        `Cannot read workspace ${workspaceId}: EACCES (injected)`,
      );
    }
    const value = this.records.get(workspaceId);
    if (!value) throw new WorkspaceNotFoundError(workspaceId);
    if (value.corrupt) throw new CorruptWorkspaceStoreError();
    return value;
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    return deepClone(this.readRaw(workspaceId));
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    const workspaceId = this.aliases.get(alias);
    return workspaceId ? this.readWorkspace(workspaceId) : null;
  }

  async listWorkspaces() {
    this.ensureInitialized();
    return [...this.records.keys()].sort();
  }

  async compareAndSwap({
    workspaceId,
    expectedGeneration,
    operation,
    faultInjector = null,
  }) {
    this.ensureInitialized();
    await Promise.resolve();
    const current = this.readRaw(workspaceId);
    if (current.generation !== expectedGeneration) {
      throw new WorkspaceConflictError(
        workspaceId,
        expectedGeneration,
        current.generation,
      );
    }

    this.guard(current, operation);
    const next = applyWorkspaceOperation(current, operation);
    faultInjector?.hit("before-commit");

    const nextRecords = new Map(this.records);
    const nextAliases = new Map(this.aliases);
    this.validateAliases(next, nextAliases);
    nextRecords.set(workspaceId, deepClone(next));
    for (const [alias, owner] of nextAliases) {
      if (owner === workspaceId && !next.aliases.includes(alias)) nextAliases.delete(alias);
    }
    for (const alias of next.aliases) nextAliases.set(alias, workspaceId);

    this.records = nextRecords;
    this.aliases = nextAliases;
    faultInjector?.hit("after-commit");
    return deepClone(next);
  }

  async backup() {
    this.ensureInitialized();
    const workspaces = [];
    for (const workspaceId of [...this.records.keys()].sort()) {
      workspaces.push(deepClone(this.readRaw(workspaceId)));
    }
    return {
      schemaVersion: 1,
      syntheticData: true,
      configurationId: this.configurationId,
      workspaces,
    };
  }

  async restore(snapshot, { faultInjector = null } = {}) {
    this.ensureInitialized();
    if (snapshot?.schemaVersion !== 1 || snapshot?.syntheticData !== true ||
        !Array.isArray(snapshot?.workspaces)) {
      throw new CorruptWorkspaceStoreError("Backup is invalid");
    }

    const nextRecords = new Map();
    const nextAliases = new Map();
    for (const workspace of snapshot.workspaces) {
      validateWorkspaceRecord(workspace);
      if (nextRecords.has(workspace.workspaceId)) {
        throw new CorruptWorkspaceStoreError("Backup contains duplicate workspace IDs");
      }
      this.validateAliases(workspace, nextAliases);
      nextRecords.set(workspace.workspaceId, deepClone(workspace));
      for (const alias of workspace.aliases) nextAliases.set(alias, workspace.workspaceId);
    }
    faultInjector?.hit("before-restore-commit");
    this.records = nextRecords;
    this.aliases = nextAliases;
    faultInjector?.hit("after-restore-commit");
    return { workspaceCount: nextRecords.size };
  }

  injectCorruption(workspaceId) {
    if (!this.records.has(workspaceId)) throw new WorkspaceNotFoundError(workspaceId);
    this.records.set(workspaceId, { corrupt: true });
  }

  /** Reconciliation guard, factored out so a negative-control can disable it. */
  guard(current, operation) {
    assertReconcilable(current, operation);
  }

  /** Force the next raw read of this workspace to fail as permission-denied. */
  injectReadFault(workspaceId) {
    this.readFaults.add(workspaceId);
  }

  seedLegacy(legacyRecord) {
    this.ensureInitialized();
    if (!legacyRecord?.workspaceId) throw new TypeError("Legacy record needs a workspaceId");
    this.legacy.set(legacyRecord.workspaceId, deepClone(legacyRecord));
  }

  async migrate({ faultInjector = null } = {}) {
    this.ensureInitialized();
    let migrated = 0;
    for (const workspaceId of [...this.legacy.keys()]) {
      const legacy = this.legacy.get(workspaceId);
      const migratedWorkspace = migrateWorkspaceV0ToV1(legacy);
      if (!this.records.has(workspaceId)) {
        faultInjector?.hit("before-migration-commit");
        this.records.set(workspaceId, deepClone(migratedWorkspace));
        for (const alias of migratedWorkspace.aliases) this.aliases.set(alias, workspaceId);
        faultInjector?.hit("after-migration-commit");
      }
      this.migratedArchive.set(workspaceId, legacy);
      this.legacy.delete(workspaceId);
      migrated++;
    }
    return { migrated, pending: this.legacy.size };
  }

  async importEnvelope(envelope, { faultInjector = null } = {}) {
    this.ensureInitialized();
    if (envelope?.schemaVersion !== 1 || envelope?.syntheticData !== true || !envelope.workspace) {
      throw new CorruptWorkspaceStoreError("Import envelope is malformed");
    }
    if (envelope.checksum !== checksumWorkspace(envelope.workspace)) {
      throw new CorruptWorkspaceStoreError("Import envelope failed checksum validation");
    }
    validateWorkspaceRecord(envelope.workspace);
    const workspace = envelope.workspace;
    if (this.records.has(workspace.workspaceId)) {
      throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
    }
    faultInjector?.hit("before-import-commit");
    this.records.set(workspace.workspaceId, deepClone(workspace));
    for (const alias of workspace.aliases) this.aliases.set(alias, workspace.workspaceId);
    faultInjector?.hit("after-import-commit");
    return {
      receiptId: `syn-receipt-${workspace.workspaceId}-${workspace.generation}`,
      workspaceId: workspace.workspaceId,
      generation: workspace.generation,
      importedAt: "2000-01-01T00:00:00.000Z",
    };
  }

  diagnostics() {
    this.ensureInitialized();
    return {
      schemaVersion: 1,
      syntheticData: true,
      configurationId: this.configurationId,
      adapter: "reference-memory",
      pendingMigrations: this.legacy.size,
      workspaces: [...this.records.keys()].sort().map((id) => {
        try {
          const workspace = this.readRaw(id);
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

  async close() {
    this.initialized = false;
  }
}
