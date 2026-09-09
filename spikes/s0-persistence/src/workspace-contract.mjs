import crypto from "node:crypto";

export class WorkspaceStoreError extends Error {
  constructor(message, code = "store_error") {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}
export class WorkspaceConflictError extends WorkspaceStoreError {
  constructor(workspaceId, expectedGeneration, actualGeneration) {
    super(
      `Workspace ${workspaceId} expected generation ${expectedGeneration}, actual ${actualGeneration}`,
      "generation_conflict",
    );
    this.workspaceId = workspaceId;
    this.expectedGeneration = expectedGeneration;
    this.actualGeneration = actualGeneration;
  }
}

export class WorkspaceNotFoundError extends WorkspaceStoreError {
  constructor(workspaceId) {
    super(`Workspace not found: ${workspaceId}`, "workspace_not_found");
    this.workspaceId = workspaceId;
  }
}

export class CorruptWorkspaceStoreError extends WorkspaceStoreError {
  constructor(message = "Workspace store is corrupt or unreadable") {
    super(message, "store_corrupt");
  }
}

export function deepClone(value) {
  return structuredClone(value);
}

export function assertWorkspaceStore(store) {
  const required = [
    "initialize",
    "createWorkspace",
    "readWorkspace",
    "resolveAlias",
    "listWorkspaces",
    "compareAndSwap",
    "backup",
    "restore",
    "close",
  ];
  for (const method of required) {
    if (typeof store?.[method] !== "function") {
      throw new TypeError(`Workspace store is missing ${method}()`);
    }
  }
  return store;
}

export function validateWorkspaceRecord(workspace) {
  if (!workspace || typeof workspace !== "object") throw new TypeError("workspace is required");
  if (workspace.schemaVersion !== 1) {
    throw new WorkspaceStoreError("Unsupported workspace schema version", "unsupported_schema");
  }
  if (workspace.syntheticData !== true) {
    throw new WorkspaceStoreError("Workspace is not marked synthetic", "non_synthetic_data");
  }
  if (!/^syn-ws-[a-z0-9-]+$/.test(workspace.workspaceId || "")) {
    throw new WorkspaceStoreError("Invalid synthetic workspace ID", "invalid_workspace_id");
  }
  if (!Number.isInteger(workspace.generation) || workspace.generation < 0) {
    throw new WorkspaceStoreError("Invalid workspace generation", "invalid_generation");
  }
  if (!Array.isArray(workspace.aliases) || new Set(workspace.aliases).size !== workspace.aliases.length) {
    throw new WorkspaceStoreError("Workspace aliases must be unique", "invalid_aliases");
  }
  const intents = workspace.pushable?.remote?.intentsById;
  const ordered = workspace.pushable?.remote?.orderedIntentIds;
  if (!intents || typeof intents !== "object" || !Array.isArray(ordered)) {
    throw new WorkspaceStoreError("Invalid pushable intent partition", "invalid_intents");
  }
  if (ordered.some((id) => !intents[id]) || new Set(ordered).size !== ordered.length) {
    throw new WorkspaceStoreError("Intent order references missing or duplicate IDs", "invalid_intent_order");
  }
  if (!workspace.publication?.journalsById || !workspace.private || !workspace.lifecycle) {
    throw new WorkspaceStoreError("Workspace partitions are incomplete", "invalid_workspace");
  }
  const journals = workspace.publication.journalsById;
  for (const [journalId, journal] of Object.entries(journals)) {
    if (!journal || journal.journalId !== journalId) {
      throw new WorkspaceStoreError("Journal identity does not match its key", "invalid_journal");
    }
    if (journal.workspaceId !== workspace.workspaceId) {
      throw new WorkspaceStoreError("Journal references another workspace", "invalid_journal_workspace");
    }
    if (!Number.isInteger(journal.generation) ||
        journal.generation < 0 ||
        journal.generation > workspace.generation) {
      throw new WorkspaceStoreError("Journal references an invalid generation", "invalid_journal_generation");
    }
    if (!["planned", "committed", "aborted"].includes(journal.status) ||
        !Array.isArray(journal.intentTuples)) {
      throw new WorkspaceStoreError("Journal shape is invalid", "invalid_journal");
    }
    for (const tuple of journal.intentTuples) {
      if (!tuple?.intentId || !Number.isInteger(tuple.intentRevision) || !tuple.contentHash) {
        throw new WorkspaceStoreError("Journal tuple is invalid", "dangling_journal_tuple");
      }
      if (journal.status === "planned" && !tupleMatchesIntent(tuple, intents[tuple.intentId])) {
        throw new WorkspaceStoreError(
          `Journal tuple does not resolve: ${tuple?.intentId || "unknown"}`,
          "dangling_journal_tuple",
        );
      }
    }
  }
  const activeJournalId = workspace.publication.activeJournalId;
  if (activeJournalId !== null && activeJournalId !== undefined && !journals[activeJournalId]) {
    throw new WorkspaceStoreError("Active journal does not resolve", "dangling_active_journal");
  }
  if (activeJournalId && journals[activeJournalId]?.status !== "planned") {
    throw new WorkspaceStoreError("Active journal must be planned", "invalid_active_journal");
  }
  for (const journal of Object.values(journals)) {
    if (journal.status === "planned") {
      if (journal.journalId !== activeJournalId) {
        throw new WorkspaceStoreError("Planned journal must be active", "invalid_active_journal");
      }
      if (journal.generation !== workspace.generation - 1) {
        throw new WorkspaceStoreError(
          "Planned journal generation must be the exact pre-mutation generation",
          "invalid_journal_generation",
        );
      }
    }
  }
  return workspace;
}

export function validateWorkspaceSnapshot(snapshot, { schemaVersion = 1 } = {}) {
  if (snapshot?.schemaVersion !== schemaVersion ||
      snapshot?.syntheticData !== true ||
      !Array.isArray(snapshot?.workspaces)) {
    throw new CorruptWorkspaceStoreError("Backup is invalid");
  }
  const workspaces = [];
  const workspaceIds = new Set();
  const aliases = new Map();
  for (const workspace of snapshot.workspaces) {
    validateWorkspaceRecord(workspace);
    if (workspaceIds.has(workspace.workspaceId)) {
      throw new CorruptWorkspaceStoreError("Backup contains duplicate workspace IDs");
    }
    workspaceIds.add(workspace.workspaceId);
    for (const alias of workspace.aliases) {
      const owner = aliases.get(alias);
      if (owner && owner !== workspace.workspaceId) {
        throw new WorkspaceStoreError(`Alias collision: ${alias}`, "alias_conflict");
      }
      aliases.set(alias, workspace.workspaceId);
    }
    workspaces.push(deepClone(workspace));
  }
  return { workspaces, workspaceIds, aliases };
}

function tupleMatchesIntent(tuple, intent) {
  return !!intent &&
    tuple.intentId === intent.intentId &&
    tuple.intentRevision === intent.intentRevision &&
    tuple.contentHash === intent.contentHash;
}

export function applyWorkspaceOperation(current, operation = {}) {
  validateWorkspaceRecord(current);
  const next = deepClone(current);

  if (operation.document) {
    const { path, value } = operation.document;
    if (!path || typeof value?.body !== "string") {
      throw new WorkspaceStoreError("Document path and body are required", "invalid_document");
    }
    next.documentsByPath[path] = deepClone(value);
  }

  if (operation.intent) {
    const intent = deepClone(operation.intent);
    if (!intent.intentId || !Number.isInteger(intent.intentRevision) || !intent.contentHash) {
      throw new WorkspaceStoreError("Intent identity, revision, and hash are required", "invalid_intent");
    }
    next.pushable.remote.intentsById[intent.intentId] = intent;
    if (!next.pushable.remote.orderedIntentIds.includes(intent.intentId)) {
      next.pushable.remote.orderedIntentIds.push(intent.intentId);
    }
  }

  for (const alias of operation.addAliases || []) {
    if (!next.aliases.includes(alias)) next.aliases.push(alias);
  }

  if (Object.hasOwn(operation, "selectedDocumentPath")) {
    next.selectedDocumentPath = operation.selectedDocumentPath;
    next.private.selection = { documentPath: operation.selectedDocumentPath };
  }

  if (operation.clearIntentTuple) {
    const tuple = operation.clearIntentTuple;
    const intent = next.pushable.remote.intentsById[tuple.intentId];
    if (tupleMatchesIntent(tuple, intent)) {
      delete next.pushable.remote.intentsById[tuple.intentId];
      next.pushable.remote.orderedIntentIds =
        next.pushable.remote.orderedIntentIds.filter((id) => id !== tuple.intentId);
    }
  }

  if (operation.planJournal) {
    const journal = deepClone(operation.planJournal);
    if (!journal.journalId || journal.status !== "planned" || !Array.isArray(journal.intentTuples)) {
      throw new WorkspaceStoreError("Invalid planned journal", "invalid_journal");
    }
    if (journal.workspaceId !== current.workspaceId) {
      throw new WorkspaceStoreError("Journal references another workspace", "invalid_journal_workspace");
    }
    if (journal.generation !== current.generation) {
      throw new WorkspaceStoreError(
        "Planned journal generation must equal the pre-mutation generation",
        "invalid_journal_generation",
      );
    }
    for (const tuple of journal.intentTuples) {
      const intent = next.pushable.remote.intentsById[tuple.intentId];
      if (!tupleMatchesIntent(tuple, intent)) {
        throw new WorkspaceStoreError(
          `Journal tuple does not resolve: ${tuple.intentId}`,
          "dangling_journal_tuple",
        );
      }
    }
    next.publication.activeJournalId = journal.journalId;
    next.publication.journalsById[journal.journalId] = journal;
  }

  if (operation.reconcileJournal) {
    const { journalId, outcome } = operation.reconcileJournal;
    const journal = next.publication.journalsById[journalId];
    if (!journal) {
      throw new WorkspaceStoreError(`Unknown journal: ${journalId}`, "invalid_reconciliation");
    }
    if (journal.status !== "planned") {
      throw new WorkspaceStoreError("Only a planned journal can be reconciled", "invalid_reconciliation");
    }
    if (!["committed", "aborted"].includes(outcome)) {
      throw new WorkspaceStoreError("Reconciliation outcome must be committed or aborted", "invalid_reconciliation");
    }
    journal.status = outcome;
    if (next.publication.activeJournalId === journalId) next.publication.activeJournalId = null;
  }

  if (operation.auditEvent) {
    next.private.audit.push(deepClone(operation.auditEvent));
  }

  next.generation = current.generation + 1;
  validateWorkspaceRecord(next);
  return next;
}

export const LEGACY_WORKSPACE_CHECKSUM_VERSION = 1;
export const DURABLE_IDENTITY_CHECKSUM_VERSION = 2;

export function checksumWorkspaceV1(workspace) {
  return crypto.createHash("sha256").update(JSON.stringify(workspace)).digest("hex");
}

export function checksumWorkspace(workspace, durableWorkspaceId = workspace?.workspaceId) {
  return crypto.createHash("sha256").update(JSON.stringify({
    durableWorkspaceId,
    workspace,
  })).digest("hex");
}

// A workspace whose active journal is still `planned` has an indeterminate
// publication: the provider operation may or may not have happened. It must be
// reconciled (committed or aborted) before any further mutation is accepted,
// otherwise a second write could silently strand or duplicate a publication.
export function needsReconciliation(workspace) {
  const activeId = workspace?.publication?.activeJournalId;
  if (!activeId) return false;
  return workspace.publication.journalsById?.[activeId]?.status === "planned";
}

export function assertReconcilable(current, operation = {}) {
  if (needsReconciliation(current) && !Object.hasOwn(operation, "reconcileJournal")) {
    throw new WorkspaceStoreError(
      `Workspace ${current.workspaceId} has an indeterminate journal that must be reconciled first`,
      "journal_reconciliation_required",
    );
  }
}
