import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CorruptWorkspaceStoreError,
  WorkspaceStoreError,
  deepClone,
} from "../workspace-contract.mjs";
import {
  acquireLock,
  isIndeterminateAtomicWrite,
  writeFileAtomicSync,
} from "./fs-atomic.mjs";

const SCHEMA_VERSION = 1;

function checksum(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object" ||
      typeof entry.id !== "string" || !entry.id ||
      !entry.request || typeof entry.request !== "object") {
    throw new CorruptWorkspaceStoreError("Pending queue entry is invalid");
  }
  const generation = entry.generation ?? 0;
  if (!Number.isInteger(generation) || generation < 0) {
    throw new CorruptWorkspaceStoreError("Pending queue entry generation is invalid");
  }
  return {
    id: entry.id,
    generation,
    request: deepClone(entry.request),
  };
}

export class PersistentPendingQueue {
  constructor({ storeRoot, provider, runId, lockTimeoutMs = 10_000 }) {
    this.provider = provider;
    this.runId = runId;
    this.filePath = storeRoot
      ? path.join(storeRoot, "pending", `${provider}-${runId}.json`)
      : null;
    this.lockPath = this.filePath ? `${this.filePath}.lock` : null;
    this.lockTimeoutMs = lockTimeoutMs;
  }

  ensureAvailable() {
    if (!this.filePath) {
      throw new WorkspaceStoreError(
        "Offline pending work requires a local queue root",
        "pending_queue_unavailable",
      );
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  readUnlocked() {
    if (!fs.existsSync(this.filePath)) return [];
    let envelope;
    try {
      envelope = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    } catch {
      throw new CorruptWorkspaceStoreError("Pending queue is not valid JSON");
    }
    const payload = envelope?.payload;
    if (envelope?.schemaVersion !== SCHEMA_VERSION ||
        envelope?.checksum !== checksum(payload) ||
        payload?.syntheticData !== true ||
        payload?.provider !== this.provider ||
        payload?.runId !== this.runId ||
        !Array.isArray(payload?.entries)) {
      throw new CorruptWorkspaceStoreError("Pending queue failed integrity validation");
    }
    return payload.entries.map(normalizeEntry);
  }

  writeUnlocked(entries) {
    const payload = {
      syntheticData: true,
      provider: this.provider,
      runId: this.runId,
      entries,
    };
    try {
      writeFileAtomicSync(this.filePath, JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        checksum: checksum(payload),
        payload,
      }));
    } catch (error) {
      if (isIndeterminateAtomicWrite(error)) {
        try {
          const persisted = this.readUnlocked();
          error.reconciled = JSON.stringify(persisted) === JSON.stringify(entries);
          error.persistedEntryCount = persisted.length;
        } catch (reconciliationError) {
          error.reconciled = false;
          error.reconciliationError = reconciliationError;
        }
      }
      throw error;
    }
  }

  async withLock(action) {
    this.ensureAvailable();
    const lock = await acquireLock(this.lockPath, { timeoutMs: this.lockTimeoutMs });
    try {
      return await action(this.readUnlocked());
    } finally {
      lock.release();
    }
  }

  async append(request) {
    return this.withLock(async (entries) => {
      const entry = {
        id: `syn-pending-${crypto.randomUUID()}`,
        generation: 0,
        request: deepClone(request),
      };
      entries.push(entry);
      this.writeUnlocked(entries);
      return deepClone(entry);
    });
  }

  async list() {
    return this.withLock((entries) => entries.map((entry) => deepClone(entry)));
  }

  async count() {
    return this.withLock((entries) => entries.length);
  }

  async inspectHead() {
    return this.withLock((entries) => ({
      empty: entries.length === 0,
      head: entries.length ? deepClone(entries[0]) : null,
      pendingCount: entries.length,
    }));
  }

  async resolveHead({
    headId,
    headGeneration,
    action,
    replacement = null,
  } = {}) {
    if (!["discard", "replace"].includes(action)) {
      throw new WorkspaceStoreError(
        "Pending queue resolution must be discard or replace",
        "pending_queue_resolution_invalid",
      );
    }
    if (action === "replace" && (!replacement || typeof replacement !== "object")) {
      throw new WorkspaceStoreError(
        "Replacing a pending queue head requires a request",
        "pending_queue_resolution_invalid",
      );
    }
    return this.withLock((entries) => {
      const head = entries[0];
      if (!head || head.id !== headId || head.generation !== headGeneration) {
        throw new WorkspaceStoreError(
          "Pending queue head changed before resolution",
          "pending_queue_head_changed",
        );
      }
      const resolved = deepClone(head);
      if (action === "discard") {
        entries.shift();
      } else {
        entries[0] = {
          id: head.id,
          generation: head.generation + 1,
          request: deepClone(replacement),
        };
      }
      this.writeUnlocked(entries);
      return {
        action,
        resolved,
        head: entries.length ? deepClone(entries[0]) : null,
        pendingCount: entries.length,
      };
    });
  }

  async processHead(handler) {
    return this.withLock(async (entries) => {
      if (!entries.length) return { empty: true };
      const entry = deepClone(entries[0]);
      const outcome = await handler(entry);
      if (outcome?.remove === true) {
        entries.shift();
        this.writeUnlocked(entries);
      }
      return {
        empty: false,
        entry,
        pendingCount: entries.length,
        ...outcome,
      };
    });
  }
}
