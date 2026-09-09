// Candidate A: one atomic generation-CAS envelope per workspace plus a
// rebuildable alias index.
//
// The envelope file is the only authority. The alias index is a derived cache
// rebuilt from envelopes at initialize(), so a crash between an envelope write
// and an index update cannot strand an alias pointing at state that never
// committed.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  CorruptWorkspaceStoreError,
  WorkspaceConflictError,
  WorkspaceNotFoundError,
  WorkspaceStoreError,
  DURABLE_IDENTITY_CHECKSUM_VERSION,
  LEGACY_WORKSPACE_CHECKSUM_VERSION,
  applyWorkspaceOperation,
  assertReconcilable,
  checksumWorkspace,
  checksumWorkspaceV1,
  deepClone,
  needsReconciliation,
  validateWorkspaceSnapshot,
  validateWorkspaceRecord,
} from "../workspace-contract.mjs";
import { migrateWorkspaceV0ToV1 } from "../synthetic-fixtures.mjs";
import {
  acquireLock,
  isIndeterminateAtomicWrite,
  listTempArtifacts,
  writeFileAtomicSync,
} from "./fs-atomic.mjs";

const SCHEMA_VERSION = 1;
const HEAD_SCHEMA_VERSION = 1;

function checksumOf(workspace, durableWorkspaceId = workspace.workspaceId) {
  return checksumWorkspace(workspace, durableWorkspaceId);
}

function canonicalEnvelope(workspace) {
  return {
    schemaVersion: SCHEMA_VERSION,
    checksumVersion: DURABLE_IDENTITY_CHECKSUM_VERSION,
    durableWorkspaceId: workspace.workspaceId,
    checksum: checksumOf(workspace),
    workspace,
  };
}

function checksumFormat(envelope, workspaceId) {
  const declaredVersion = envelope.checksumVersion;
  const identityChecksum = checksumOf(envelope.workspace, workspaceId);
  const legacyChecksum = checksumWorkspaceV1(envelope.workspace);
  if (declaredVersion === DURABLE_IDENTITY_CHECKSUM_VERSION) {
    if (envelope.durableWorkspaceId !== workspaceId || envelope.checksum !== identityChecksum) {
      throw new CorruptWorkspaceStoreError(
        `Workspace ${workspaceId} failed durable-identity checksum validation`,
      );
    }
    return { version: declaredVersion, canonical: true };
  }
  if (declaredVersion === LEGACY_WORKSPACE_CHECKSUM_VERSION) {
    if (envelope.checksum !== legacyChecksum) {
      throw new CorruptWorkspaceStoreError(
        `Workspace ${workspaceId} failed legacy checksum validation`,
      );
    }
    return { version: declaredVersion, canonical: false };
  }
  if (declaredVersion === undefined || declaredVersion === null) {
    if (envelope.checksum === legacyChecksum) {
      return { version: LEGACY_WORKSPACE_CHECKSUM_VERSION, canonical: false };
    }
    // Canonicalize the short-lived unversioned identity-bound format too.
    if (envelope.checksum === identityChecksum) {
      return { version: DURABLE_IDENTITY_CHECKSUM_VERSION, canonical: false };
    }
  }
  throw new CorruptWorkspaceStoreError(
    `Workspace ${workspaceId} has an unsupported or invalid checksum format`,
  );
}

export class LocalCasWorkspaceStore {
  constructor({
    storeRoot,
    configurationId = "CFG-LOCAL-CAS",
    lockTimeoutMs = 10_000,
    syncDirectory = null,
  } = {}) {
    if (!storeRoot) throw new TypeError("storeRoot is required");
    this.configurationId = configurationId;
    this.root = storeRoot;
    this.workspaceDir = path.join(storeRoot, "workspaces");
    this.headPath = path.join(storeRoot, "HEAD");
    this.lockDir = path.join(storeRoot, "locks");
    this.legacyDir = path.join(storeRoot, "legacy");
    this.migratedDir = path.join(storeRoot, "migrated");
    this.lockTimeoutMs = lockTimeoutMs;
    this.syncDirectory = syncDirectory;
    this.aliasIndex = new Map();
    this.readFaults = new Set();
    this.initialized = false;
  }

  envelopePath(workspaceId) {
    return path.join(this.activeWorkspaceDir(), `${workspaceId}.json`);
  }

  lockPath(workspaceId) {
    return path.join(this.lockDir, `${workspaceId}.lock`);
  }

  storeLockPath() {
    return path.join(this.lockDir, "store.lock");
  }

  readHeadDirectoryName() {
    let head;
    try {
      head = JSON.parse(fs.readFileSync(this.headPath, "utf8"));
    } catch {
      throw new CorruptWorkspaceStoreError("CAS authoritative HEAD is missing or invalid");
    }
    if (head?.schemaVersion !== HEAD_SCHEMA_VERSION ||
        typeof head.directory !== "string" ||
        !/^workspaces(?:\.restore-[a-f0-9-]+)?$/.test(head.directory)) {
      throw new CorruptWorkspaceStoreError("CAS authoritative HEAD is invalid");
    }
    const directory = path.join(this.root, head.directory);
    if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
      throw new CorruptWorkspaceStoreError("CAS authoritative HEAD target is missing");
    }
    return head.directory;
  }

  activeWorkspaceDir() {
    if (!fs.existsSync(this.headPath)) return this.workspaceDir;
    this.workspaceDir = path.join(this.root, this.readHeadDirectoryName());
    return this.workspaceDir;
  }

  writeHead(directoryName, { onBeforeRename = null } = {}) {
    try {
      writeFileAtomicSync(
        this.headPath,
        JSON.stringify({ schemaVersion: HEAD_SCHEMA_VERSION, directory: directoryName }),
        {
          onBeforeRename,
          ...(this.syncDirectory ? { syncDirectory: this.syncDirectory } : {}),
        },
      );
    } catch (error) {
      if (isIndeterminateAtomicWrite(error)) {
        try {
          const persistedDirectory = this.readHeadDirectoryName();
          error.reconciled = persistedDirectory === directoryName;
          error.persistedDirectory = persistedDirectory;
          if (error.reconciled) {
            this.workspaceDir = path.join(this.root, persistedDirectory);
          }
        } catch (reconciliationError) {
          error.reconciled = false;
          error.reconciliationError = reconciliationError;
        }
      }
      throw error;
    }
    this.workspaceDir = path.join(this.root, directoryName);
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new WorkspaceStoreError("Store is not initialized", "store_not_initialized");
    }
  }

  decodeEnvelope(workspaceId) {
    const file = this.envelopePath(workspaceId);
    let raw;
    try {
      if (this.readFaults.has(workspaceId)) {
        this.readFaults.delete(workspaceId);
        const denied = new Error("permission denied (injected)");
        denied.code = "EACCES";
        throw denied;
      }
      raw = fs.readFileSync(file, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") throw new WorkspaceNotFoundError(workspaceId);
      // A present-but-unreadable store is never treated as absent.
      throw new CorruptWorkspaceStoreError(`Cannot read workspace ${workspaceId}: ${error.code}`);
    }
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      throw new CorruptWorkspaceStoreError(`Workspace ${workspaceId} is not valid JSON`);
    }
    if (envelope?.schemaVersion !== SCHEMA_VERSION || !envelope.workspace) {
      throw new CorruptWorkspaceStoreError(`Workspace ${workspaceId} envelope is unusable`);
    }
    if (envelope.workspace.workspaceId !== workspaceId) {
      throw new CorruptWorkspaceStoreError(
        `Workspace ${workspaceId} envelope identity does not match its filename`,
      );
    }
    const format = checksumFormat(envelope, workspaceId);
    return {
      workspace: validateWorkspaceRecord(envelope.workspace),
      checksumVersion: format.version,
      requiresUpgrade: !format.canonical,
    };
  }

  readEnvelope(workspaceId) {
    return this.decodeEnvelope(workspaceId).workspace;
  }

  writeEnvelopeTo(
    directory,
    workspace,
    faultInjector = null,
    faultPoint = "during-atomic-replace",
  ) {
    const filePath = path.join(directory, `${workspace.workspaceId}.json`);
    const serialized = JSON.stringify(canonicalEnvelope(workspace));
    try {
      writeFileAtomicSync(filePath, serialized, {
        onBeforeRename: () => faultInjector?.hit(faultPoint),
        ...(this.syncDirectory ? { syncDirectory: this.syncDirectory } : {}),
      });
    } catch (error) {
      if (isIndeterminateAtomicWrite(error)) {
        try {
          error.reconciled = fs.readFileSync(filePath, "utf8") === serialized;
          error.persistedGeneration = error.reconciled
            ? workspace.generation
            : null;
        } catch (reconciliationError) {
          error.reconciled = false;
          error.reconciliationError = reconciliationError;
        }
      }
      throw error;
    }
  }

  writeEnvelope(workspace, faultInjector = null, faultPoint = "during-atomic-replace") {
    try {
      this.writeEnvelopeTo(this.activeWorkspaceDir(), workspace, faultInjector, faultPoint);
    } catch (error) {
      if (isIndeterminateAtomicWrite(error) && error.reconciled) {
        for (const alias of workspace.aliases) {
          this.aliasIndex.set(alias, workspace.workspaceId);
        }
      }
      throw error;
    }
  }

  workspaceIdsOnDisk() {
    try {
      return fs.readdirSync(this.activeWorkspaceDir())
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .sort();
    } catch {
      return [];
    }
  }

  rebuildAliasIndex() {
    const index = new Map();
    for (const workspaceId of this.workspaceIdsOnDisk()) {
      const workspace = this.readEnvelope(workspaceId);
      for (const alias of workspace.aliases) {
        const owner = index.get(alias);
        if (owner && owner !== workspaceId) {
          throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
        }
        index.set(alias, workspaceId);
      }
    }
    this.aliasIndex = index;
  }

  async initialize({ faultInjector = null } = {}) {
    fs.mkdirSync(this.lockDir, { recursive: true });
    fs.mkdirSync(this.legacyDir, { recursive: true });
    fs.mkdirSync(this.migratedDir, { recursive: true });
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    try {
      if (!fs.existsSync(this.headPath)) {
        fs.mkdirSync(this.workspaceDir, { recursive: true });
        this.writeHead("workspaces");
      } else {
        this.activeWorkspaceDir();
      }
      for (const workspaceId of this.workspaceIdsOnDisk()) {
        const lock = await acquireLock(this.lockPath(workspaceId), {
          timeoutMs: this.lockTimeoutMs,
        });
        try {
          const decoded = this.decodeEnvelope(workspaceId);
          if (decoded.requiresUpgrade) {
            this.writeEnvelope(
              decoded.workspace,
              faultInjector,
              "during-checksum-upgrade",
            );
          }
        } finally {
          lock.release();
        }
      }
      this.rebuildAliasIndex();
      this.initialized = true;
      return { workspaceCount: this.workspaceIdsOnDisk().length };
    } finally {
      storeLock.release();
    }
  }

  async createWorkspace(workspace) {
    this.ensureInitialized();
    validateWorkspaceRecord(workspace);
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    try {
      if (fs.existsSync(this.envelopePath(workspace.workspaceId))) {
        throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
      }
      this.rebuildAliasIndex();
      for (const alias of workspace.aliases) {
        const owner = this.aliasIndex.get(alias);
        if (owner && owner !== workspace.workspaceId) {
          throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
        }
      }
      this.writeEnvelope(workspace);
      for (const alias of workspace.aliases) {
        this.aliasIndex.set(alias, workspace.workspaceId);
      }
      return deepClone(workspace);
    } finally {
      storeLock.release();
    }
  }

  async readWorkspace(workspaceId) {
    this.ensureInitialized();
    return this.readEnvelope(workspaceId);
  }

  async resolveAlias(alias) {
    this.ensureInitialized();
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    try {
      this.rebuildAliasIndex();
      const workspaceId = this.aliasIndex.get(alias);
      return workspaceId ? this.readEnvelope(workspaceId) : null;
    } finally {
      storeLock.release();
    }
  }

  async listWorkspaces() {
    this.ensureInitialized();
    return this.workspaceIdsOnDisk();
  }

  async compareAndSwap({ workspaceId, expectedGeneration, operation, faultInjector = null }) {
    this.ensureInitialized();
    const changesAliases = Array.isArray(operation?.addAliases) &&
      operation.addAliases.length > 0;
    const storeLock = changesAliases
      ? await acquireLock(this.storeLockPath(), { timeoutMs: this.lockTimeoutMs })
      : null;
    let lock = null;
    try {
      lock = await acquireLock(this.lockPath(workspaceId), {
        timeoutMs: this.lockTimeoutMs,
      });
      const current = this.readEnvelope(workspaceId);
      if (current.generation !== expectedGeneration) {
        throw new WorkspaceConflictError(workspaceId, expectedGeneration, current.generation);
      }
      assertReconcilable(current, operation);
      const next = applyWorkspaceOperation(current, operation);
      if (changesAliases) {
        this.rebuildAliasIndex();
        for (const alias of next.aliases) {
          const owner = this.aliasIndex.get(alias);
          if (owner && owner !== workspaceId) {
            throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
          }
        }
      }
      faultInjector?.hit("before-commit");
      this.writeEnvelope(next, faultInjector);
      faultInjector?.hit("after-commit");
      for (const alias of next.aliases) this.aliasIndex.set(alias, workspaceId);
      return deepClone(next);
    } finally {
      lock?.release();
      storeLock?.release();
    }
  }

  async backup() {
    this.ensureInitialized();
    return {
      schemaVersion: SCHEMA_VERSION,
      syntheticData: true,
      configurationId: this.configurationId,
      workspaces: this.workspaceIdsOnDisk().map((id) => this.readEnvelope(id)),
    };
  }

  async restore(snapshot, { faultInjector = null } = {}) {
    this.ensureInitialized();
    const validated = validateWorkspaceSnapshot(snapshot, { schemaVersion: SCHEMA_VERSION });
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    const workspaceLocks = [];
    const previousDirectory = this.readHeadDirectoryName();
    const nextDirectory = `workspaces.restore-${crypto.randomUUID()}`;
    const nextPath = path.join(this.root, nextDirectory);
    let committed = false;
    let failure = null;
    try {
      for (const workspaceId of this.workspaceIdsOnDisk()) {
        workspaceLocks.push(await acquireLock(this.lockPath(workspaceId), {
          timeoutMs: this.lockTimeoutMs,
        }));
      }
      fs.mkdirSync(nextPath);
      for (const workspace of validated.workspaces) {
        this.writeEnvelopeTo(nextPath, workspace);
        faultInjector?.hit("during-restore-stage");
      }
      faultInjector?.hit("before-restore-commit");
      try {
        this.writeHead(nextDirectory, {
          onBeforeRename: () => faultInjector?.hit("during-restore-head-replace"),
        });
        committed = true;
      } catch (error) {
        committed = isIndeterminateAtomicWrite(error) ||
          (fs.existsSync(this.headPath) &&
            this.readHeadDirectoryName() === nextDirectory);
        if (committed) {
          this.workspaceDir = nextPath;
          this.aliasIndex = validated.aliases;
          if (isIndeterminateAtomicWrite(error)) {
            error.reconciled = true;
            error.persistedDirectory = nextDirectory;
          }
        }
        throw error;
      }
      this.aliasIndex = validated.aliases;
      const previousPath = path.join(this.root, previousDirectory);
      if (previousPath !== nextPath) {
        try { fs.rmSync(previousPath, { recursive: true, force: true }); } catch { /* old generation is non-authoritative */ }
      }
      faultInjector?.hit("after-restore-commit");
      return { workspaceCount: validated.workspaces.length };
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      if (!committed) {
        try { fs.rmSync(nextPath, { recursive: true, force: true }); } catch { /* best effort */ }
        if (isIndeterminateAtomicWrite(failure)) {
          try {
            const authoritativeDirectory = this.readHeadDirectoryName();
            failure.reconciled = authoritativeDirectory === previousDirectory;
            failure.authoritativeDirectory = authoritativeDirectory;
            failure.restoreCommitted = false;
            delete failure.persistedGeneration;
          } catch (reconciliationError) {
            failure.reconciled = false;
            failure.reconciliationError = reconciliationError;
          }
        }
      }
      for (const lock of workspaceLocks.reverse()) lock.release();
      storeLock.release();
    }
  }

  injectCorruption(workspaceId, mode = "truncated") {
    const file = this.envelopePath(workspaceId);
    if (!fs.existsSync(file)) throw new WorkspaceNotFoundError(workspaceId);
    if (mode === "valid-json-tamper") {
      const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
      envelope.workspace.private.audit.push({
        actor: "Synthetic Tamper",
        action: "checksum-bypass-attempt",
      });
      fs.writeFileSync(file, JSON.stringify(envelope));
      return;
    }
    fs.writeFileSync(file, '{"schemaVersion":1,"workspace":{"trunc');
  }

  injectIdentitySubstitution(workspaceId, replacementWorkspaceId) {
    const source = this.envelopePath(workspaceId);
    const replacement = this.envelopePath(replacementWorkspaceId);
    if (!fs.existsSync(source)) throw new WorkspaceNotFoundError(workspaceId);
    fs.renameSync(source, replacement);
  }

  /** Force the next raw read of this workspace to fail as permission-denied. */
  injectReadFault(workspaceId) {
    this.readFaults.add(workspaceId);
  }

  legacyPath(workspaceId) {
    return path.join(this.legacyDir, `${workspaceId}.json`);
  }

  legacyIdsOnDisk() {
    try {
      return fs.readdirSync(this.legacyDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.slice(0, -".json".length))
        .sort();
    } catch {
      return [];
    }
  }

  /** Seed a prior-schema record to be migrated. Not part of the v1 read path. */
  seedLegacy(legacyRecord) {
    this.ensureInitialized();
    if (!legacyRecord?.workspaceId) throw new TypeError("Legacy record needs a workspaceId");
    const filePath = this.legacyPath(legacyRecord.workspaceId);
    const serialized = JSON.stringify(legacyRecord);
    try {
      writeFileAtomicSync(
        filePath,
        serialized,
        this.syncDirectory ? { syncDirectory: this.syncDirectory } : undefined,
      );
    } catch (error) {
      if (isIndeterminateAtomicWrite(error)) {
        try {
          error.reconciled = fs.readFileSync(filePath, "utf8") === serialized;
        } catch (reconciliationError) {
          error.reconciled = false;
          error.reconciliationError = reconciliationError;
        }
      }
      throw error;
    }
  }

  async migrate({ faultInjector = null } = {}) {
    this.ensureInitialized();
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    try {
      let migrated = 0;
      this.rebuildAliasIndex();
      for (const workspaceId of this.legacyIdsOnDisk()) {
        const legacyFile = this.legacyPath(workspaceId);
        let legacy;
        try {
          legacy = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
        } catch {
          throw new CorruptWorkspaceStoreError(`Legacy record ${workspaceId} is not valid JSON`);
        }
        const migratedWorkspace = migrateWorkspaceV0ToV1(legacy);
        for (const alias of migratedWorkspace.aliases) {
          const owner = this.aliasIndex.get(alias);
          if (owner && owner !== workspaceId) {
            throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
          }
        }
        if (!fs.existsSync(this.envelopePath(workspaceId))) {
          faultInjector?.hit("before-migration-commit");
          this.writeEnvelope(migratedWorkspace);
          faultInjector?.hit("after-migration-commit");
        }
        fs.renameSync(legacyFile, path.join(this.migratedDir, `${workspaceId}.json`));
        for (const alias of migratedWorkspace.aliases) this.aliasIndex.set(alias, workspaceId);
        migrated++;
      }
      this.rebuildAliasIndex();
      return { migrated, pending: this.legacyIdsOnDisk().length };
    } finally {
      storeLock.release();
    }
  }

  async importEnvelope(envelope, { faultInjector = null } = {}) {
    this.ensureInitialized();
    if (envelope?.schemaVersion !== SCHEMA_VERSION || envelope?.syntheticData !== true ||
        !envelope.workspace) {
      throw new CorruptWorkspaceStoreError("Import envelope is malformed");
    }
    checksumFormat(envelope, envelope.workspace.workspaceId);
    validateWorkspaceRecord(envelope.workspace);
    const workspaceId = envelope.workspace.workspaceId;
    const storeLock = await acquireLock(this.storeLockPath(), {
      timeoutMs: this.lockTimeoutMs,
    });
    try {
      if (fs.existsSync(this.envelopePath(workspaceId))) {
        throw new WorkspaceStoreError("Workspace already exists", "workspace_exists");
      }
      this.rebuildAliasIndex();
      for (const alias of envelope.workspace.aliases) {
        const owner = this.aliasIndex.get(alias);
        if (owner && owner !== workspaceId) {
          throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
        }
      }
      faultInjector?.hit("before-import-commit");
      this.writeEnvelope(envelope.workspace);
      for (const alias of envelope.workspace.aliases) this.aliasIndex.set(alias, workspaceId);
      faultInjector?.hit("after-import-commit");
      return {
        receiptId: `syn-receipt-${workspaceId}-${envelope.workspace.generation}`,
        workspaceId,
        generation: envelope.workspace.generation,
        importedAt: "2000-01-01T00:00:00.000Z",
      };
    } finally {
      storeLock.release();
    }
  }

  /** Redacted structural diagnostics: identity and health, never content. */
  diagnostics() {
    this.ensureInitialized();
    return {
      schemaVersion: SCHEMA_VERSION,
      syntheticData: true,
      configurationId: this.configurationId,
      adapter: "local-cas",
      pendingMigrations: this.legacyIdsOnDisk().length,
      workspaces: this.workspaceIdsOnDisk().map((id) => {
        try {
          const workspace = this.readEnvelope(id);
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

  /** Diagnostics used by the atomic-replace scenario. */
  strayTempFiles() {
    return listTempArtifacts(this.workspaceDir);
  }

  async close() {
    this.initialized = false;
  }
}
