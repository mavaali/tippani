// Filesystem primitives shared by the durable local candidates.
//
// Windows notes:
// - fs.renameSync maps to MoveFileExW with MOVEFILE_REPLACE_EXISTING, so a
//   same-directory rename over an existing file is an atomic replace.
// - There is no portable directory fsync on Windows, so file-content fsync is
//   the strongest durability barrier available here. S0 records that limit
//   rather than pretending the guarantee is stronger than it is.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { WorkspaceStoreError } from "../workspace-contract.mjs";

let tempCounter = 0;

const UNSUPPORTED_DIRECTORY_FSYNC_CODES = new Set([
  "EINVAL",
  "ENOTSUP",
  "EISDIR",
  "EPERM",
]);

export class IndeterminateAtomicWriteError extends WorkspaceStoreError {
  constructor(filePath, cause) {
    super(
      `Atomic replacement reached rename but parent-directory fsync failed: ${filePath}`,
      "indeterminate_write",
    );
    this.filePath = filePath;
    this.reason = "directory_fsync_failed";
    this.commitPoint = "rename";
    this.requiresReconciliation = true;
    this.cause = cause;
  }
}

export function isIndeterminateAtomicWrite(error) {
  return error instanceof IndeterminateAtomicWriteError ||
    (error?.code === "indeterminate_write" &&
      error?.reason === "directory_fsync_failed" &&
      error?.commitPoint === "rename");
}

export function fsyncDirectorySync(directory, fsImpl = fs) {
  let handle;
  try {
    handle = fsImpl.openSync(directory, "r");
    fsImpl.fsyncSync(handle);
  } catch (error) {
    if (process.platform === "win32" &&
        UNSUPPORTED_DIRECTORY_FSYNC_CODES.has(error?.code)) {
      return false;
    }
    throw error;
  } finally {
    if (handle !== undefined) fsImpl.closeSync(handle);
  }
  return true;
}

export function writeFileAtomicSync(filePath, data, {
  onBeforeRename,
  syncDirectory = fsyncDirectorySync,
} = {}) {
  const directory = path.dirname(filePath);
  const temp = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${tempCounter++}.tmp`,
  );
  let handle;
  let renamed = false;
  try {
    handle = fs.openSync(temp, "w");
    fs.writeFileSync(handle, data);
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    onBeforeRename?.();
    fs.renameSync(temp, filePath);
    renamed = true;
    try {
      syncDirectory(directory);
    } catch (error) {
      throw new IndeterminateAtomicWriteError(filePath, error);
    }
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* preserve original error */ }
    }
    if (!renamed) {
      try { fs.unlinkSync(temp); } catch { /* absent or retained after process death */ }
    }
    throw error;
  }
}

export function listTempArtifacts(directory) {
  try {
    return fs.readdirSync(directory).filter((name) => name.endsWith(".tmp"));
  } catch {
    return [];
  }
}

export function isPidAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepSync = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const OWNER_SUFFIX = ".owner";

function sameOwner(left, right) {
  return left?.token === right?.token && left?.pid === right?.pid;
}

function readLockClaim(lockPath) {
  try {
    const stat = fs.statSync(lockPath);
    if (!stat.isDirectory()) {
      return {
        kind: "legacy-file",
        owner: JSON.parse(fs.readFileSync(lockPath, "utf8")),
        stat,
      };
    }
    const entries = fs.readdirSync(lockPath);
    const ownerEntries = entries.filter((name) => name.endsWith(OWNER_SUFFIX));
    if (entries.length === 0) {
      return { kind: "directory", owner: null, empty: true, stat };
    }
    if (entries.length !== 1 || ownerEntries.length !== 1) {
      return { kind: "directory", owner: null, empty: false, stat };
    }
    const ownerPath = path.join(lockPath, ownerEntries[0]);
    const owner = JSON.parse(fs.readFileSync(ownerPath, "utf8"));
    if (`${owner?.token}${OWNER_SUFFIX}` !== ownerEntries[0]) {
      return { kind: "directory", owner: null, empty: false, stat };
    }
    return { kind: "directory", owner, ownerPath, empty: false, stat };
  } catch {
    return null;
  }
}

export function reapStaleLock(lockPath, { onBeforeDelete = null } = {}) {
  const claim = readLockClaim(lockPath);
  if (claim?.kind === "directory" && claim.empty) {
    try {
      fs.rmdirSync(lockPath);
      return true;
    } catch (error) {
      return error?.code === "ENOENT";
    }
  }
  const owner = claim?.owner;
  if (!owner?.token || !Number.isInteger(owner.pid) || owner.pid <= 0 || isPidAlive(owner.pid)) {
    return false;
  }
  return removeOwnedLock(lockPath, owner, { onBeforeDelete });
}

function removeOwnedDirectoryLock(lockPath, expectedOwner, { onBeforeDelete = null } = {}) {
  const claim = readLockClaim(lockPath);
  if (claim?.kind !== "directory" || !sameOwner(claim.owner, expectedOwner)) return false;
  onBeforeDelete?.({ owner: { ...claim.owner }, lockPath });
  const current = readLockClaim(lockPath);
  if (current?.kind !== "directory" || !sameOwner(current.owner, expectedOwner)) return false;
  try {
    fs.unlinkSync(current.ownerPath);
  } catch (error) {
    if (error?.code !== "ENOENT") return false;
  }
  try {
    fs.rmdirSync(lockPath);
    return true;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

function removeOwnedLegacyFileLock(lockPath, expectedOwner, { onBeforeDelete = null } = {}) {
  const snapshotPath = `${lockPath}.reclaim.${process.pid}.${crypto.randomUUID()}`;
  try {
    const claim = readLockClaim(lockPath);
    if (claim?.kind !== "legacy-file" || !sameOwner(claim.owner, expectedOwner)) return false;
    try {
      fs.linkSync(lockPath, snapshotPath);
    } catch (error) {
      return error?.code === "ENOENT";
    }
    const snapshot = readLockClaim(snapshotPath);
    if (snapshot?.kind !== "legacy-file" || !sameOwner(snapshot.owner, expectedOwner)) return false;
    onBeforeDelete?.({ owner: { ...claim.owner }, lockPath });
    const current = readLockClaim(lockPath);
    if (current?.kind !== "legacy-file" || !sameOwner(current.owner, expectedOwner)) return false;
    if (current.stat.dev !== snapshot.stat.dev || current.stat.ino !== snapshot.stat.ino) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(snapshotPath); } catch { /* no snapshot */ }
  }
}

function removeOwnedLock(lockPath, expectedOwner, options = {}) {
  const claim = readLockClaim(lockPath);
  if (!claim) return true;
  if (claim.kind === "directory") {
    return removeOwnedDirectoryLock(lockPath, expectedOwner, options);
  }
  return removeOwnedLegacyFileLock(lockPath, expectedOwner, options);
}

function cleanupReclaimArtifacts(lockPath) {
  const directory = path.dirname(lockPath);
  const basename = path.basename(lockPath);
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name !== `${basename}.reclaim` && !name.startsWith(`${basename}.reclaim.`)) continue;
    try { fs.unlinkSync(path.join(directory, name)); } catch { /* best effort */ }
  }
}

/**
 * Exclusive cross-process lock. A complete owner directory is assembled at a
 * private path and atomically renamed into place. The token is also the owner
 * filename, so a delayed releaser can only unlink its own claim; a replacement
 * owner keeps a different non-empty directory that rmdir cannot remove. An
 * empty lock directory is therefore unambiguously an interrupted release and
 * can be recovered without a persistent reclamation mutex.
 */
export async function acquireLock(lockPath, {
  timeoutMs = 10_000,
  pollMs = 5,
  onBeforeReapDelete = null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let stolenStaleLock = false;
  for (;;) {
    const token = crypto.randomUUID();
    const staging = `${lockPath}.${process.pid}.${tempCounter++}.claim`;
    fs.mkdirSync(staging);
    const ownerPath = path.join(staging, `${token}${OWNER_SUFFIX}`);
    const handle = fs.openSync(ownerPath, "wx");
    try {
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, token, at: Date.now() }));
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    try {
      fs.renameSync(staging, lockPath);
      cleanupReclaimArtifacts(lockPath);
      return {
        path: lockPath,
        token,
        stolenStaleLock,
        release() {
          return removeOwnedLock(lockPath, { pid: process.pid, token });
        },
      };
    } catch (error) {
      try {
        fs.statSync(lockPath);
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (reapStaleLock(lockPath, { onBeforeDelete: onBeforeReapDelete })) {
        stolenStaleLock = true;
        continue;
      }
      if (Date.now() > deadline) {
        const timeout = new Error(`Timed out acquiring lock: ${lockPath}`);
        timeout.code = "lock_timeout";
        throw timeout;
      }
      await sleep(pollMs);
    } finally {
      try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* already moved */ }
    }
  }
}

export function acquireLockSync(lockPath, {
  timeoutMs = 10_000,
  pollMs = 5,
  onBeforeReapDelete = null,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let stolenStaleLock = false;
  for (;;) {
    const token = crypto.randomUUID();
    const staging = `${lockPath}.${process.pid}.${tempCounter++}.claim`;
    fs.mkdirSync(staging);
    const ownerPath = path.join(staging, `${token}${OWNER_SUFFIX}`);
    const handle = fs.openSync(ownerPath, "wx");
    try {
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, token, at: Date.now() }));
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    try {
      fs.renameSync(staging, lockPath);
      cleanupReclaimArtifacts(lockPath);
      return {
        path: lockPath,
        token,
        stolenStaleLock,
        release() {
          return removeOwnedLock(lockPath, { pid: process.pid, token });
        },
      };
    } catch (error) {
      try {
        fs.statSync(lockPath);
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (reapStaleLock(lockPath, { onBeforeDelete: onBeforeReapDelete })) {
        stolenStaleLock = true;
        continue;
      }
      if (Date.now() > deadline) {
        const timeout = new Error(`Timed out acquiring lock: ${lockPath}`);
        timeout.code = "lock_timeout";
        throw timeout;
      }
      sleepSync(pollMs);
    } finally {
      try {
        fs.rmSync(staging, { recursive: true, force: true });
      } catch {
        // The staging claim was moved or already removed.
      }
    }
  }
}
