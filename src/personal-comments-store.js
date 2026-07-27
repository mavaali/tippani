// Durable, corruption-aware disk I/O for the file/branch-scoped "Personal
// Comments" store. Extracted from index.js so the atomic-write and
// corruption-quarantine behaviour is unit-testable without booting the server.
// The pure list-shaping ops live in personal-comments.js; this module only
// touches disk.
//
// A crash / ENOSPC mid-write must never leave a half-written JSON file, and a
// corrupt store must never be silently read as "zero comments" (which the next
// save would then launder into permanent loss). So: writes are atomic
// (temp-file + rename) and THROW on failure; a corrupt file is quarantined and
// throws rather than returning [].
import fs from "fs";
import path from "path";
import crypto from "crypto";

export function personalCommentsKey(repoId, branch, filePath) {
  const h = crypto.createHash("sha1");
  h.update(`${repoId}\n${branch}\n${filePath}`);
  return h.digest("hex");
}

function storePath(dir, repoId, branch, filePath) {
  return path.join(dir, `${personalCommentsKey(repoId, branch, filePath)}.json`);
}

// Load the comment list. A genuinely-absent file returns [] (a fresh draft has
// no notes yet). A CORRUPT file is quarantined (renamed to
// `<key>.json.corrupt-<ts>`, preserving the bytes for recovery) and throws —
// never silently returns [], so a subsequent save can't overwrite real notes
// with an empty list. Other read errors (EACCES/EIO) also throw rather than
// masquerading as "no comments".
export function loadPersonalComments(dir, repoId, branch, filePath) {
  const p = storePath(dir, repoId, branch, filePath);
  let raw;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch (e) {
    if (e && e.code === "ENOENT") return [];
    throw e;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    let quarantine = `${p}.corrupt-${Date.now()}`;
    try { fs.renameSync(p, quarantine); } catch { quarantine = p; }
    const err = new Error(`Personal-comments store is corrupt; quarantined to ${quarantine}`);
    err.code = "PC_STORE_CORRUPT";
    throw err;
  }
  return Array.isArray(data.comments) ? data.comments : [];
}

// Persist the comment list atomically: write a sibling temp file then rename it
// over the target (atomic on the same volume) so the store is always either the
// full old contents or the full new contents — never a half-written truncation.
// THROWS on failure (the temp file is cleaned up) so callers can report
// { ok: false } instead of telling the agent a note saved when it didn't.
export function savePersonalComments(dir, repoId, branch, filePath, comments) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = storePath(dir, repoId, branch, filePath);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const body = JSON.stringify({ repo: repoId, branch, path: filePath, comments }, null, 2);
  try {
    fs.writeFileSync(tmp, body, { mode: 0o600 });
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* temp cleanup best-effort */ }
    throw e;
  }
}
