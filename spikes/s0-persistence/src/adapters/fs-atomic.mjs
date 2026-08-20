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

let tempCounter = 0;

export function writeFileAtomicSync(filePath, data, { onBeforeRename } = {}) {
  const directory = path.dirname(filePath);
  const temp = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${tempCounter++}.tmp`,
  );
  const handle = fs.openSync(temp, "w");
  try {
    fs.writeFileSync(handle, data);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  // The rename is the atomic commit point. A crash here leaves the fully written
  // temp file behind and the previous target untouched.
  onBeforeRename?.();
  fs.renameSync(temp, filePath);
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

function reapStaleLock(lockPath, staleMs) {
  let owner = null;
  let unreadable = false;
  try {
    owner = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    unreadable = true;
  }
  let expired = false;
  try {
    expired = Date.now() - fs.statSync(lockPath).mtimeMs > staleMs;
  } catch {
    return true; // The lock disappeared underneath us; retry the create.
  }
  // An unreadable record is NOT treated as abandoned on its own. Only a
  // provably dead owner, or a record that has stayed unusable past the stale
  // window, may be stolen: stealing a live lock is what allows two writers to
  // both "win" a generation.
  const ownerDead = !unreadable && Number.isInteger(owner?.pid) && !isPidAlive(owner.pid);
  if (!ownerDead && !expired) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exclusive cross-process lock. The owner record is written to a private
 * temporary file first and published with an atomic link, so the lock path is
 * never observable in a half-written state. A crashed owner leaves the file
 * behind, and it is only stolen when its recorded owner is provably gone or
 * the record has been unusable for longer than the stale window.
 */
export async function acquireLock(lockPath, {
  staleMs = 30_000,
  timeoutMs = 10_000,
  pollMs = 5,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let stolenStaleLock = false;
  for (;;) {
    const staging = `${lockPath}.${process.pid}.${tempCounter++}.claim`;
    const handle = fs.openSync(staging, "w");
    try {
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    try {
      // linkSync fails with EEXIST if the destination exists, so publication of
      // an already-complete record is the atomic acquisition step.
      fs.linkSync(staging, lockPath);
      return {
        path: lockPath,
        stolenStaleLock,
        release() {
          try { fs.unlinkSync(lockPath); } catch { /* already released */ }
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (reapStaleLock(lockPath, staleMs)) {
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
      try { fs.unlinkSync(staging); } catch { /* already cleaned */ }
    }
  }
}
