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
  return workspace;
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

export function checksumWorkspace(workspace) {
  return crypto.createHash("sha256").update(JSON.stringify(workspace)).digest("hex");
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
