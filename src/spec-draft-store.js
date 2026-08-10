// Durable, corruption-aware disk store for STAGED spec drafts (clickstop 2,
// step 11). A remote-authoring draft is a whole-file markdown body staged for a
// `(repo, branch, path)` before it is pushed as a commit. It mirrors
// personal-comments-store.js exactly: writes are atomic (temp-file + rename) and
// THROW on failure so a handler can honestly return `{ok:false}` instead of
// telling the agent a stage succeeded when it didn't; a genuinely-absent draft
// loads as null (nothing staged yet); a CORRUPT store is quarantined
// (`<key>.json.corrupt-<ts>`) and throws rather than being read as "empty" and
// laundered into a lost draft by the next save.
import fs from "fs";
import path from "path";
import crypto from "crypto";

export function specDraftKey(repoId, branch, filePath) {
  const h = crypto.createHash("sha1");
  h.update(`${repoId}\n${branch}\n${filePath}`);
  return h.digest("hex");
}

function storePath(dir, repoId, branch, filePath) {
  return path.join(dir, `${specDraftKey(repoId, branch, filePath)}.json`);
}

// Load a staged draft. Absent -> null (nothing staged). Corrupt -> quarantine +
// throw (never silently null, so a save can't overwrite a real draft). Other
// read errors also throw.
export function loadSpecDraft(dir, repoId, branch, filePath) {
  const p = storePath(dir, repoId, branch, filePath);
  let raw;
  try {
    raw = fs.readFileSync(p, "utf-8");
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
  try {
    return JSON.parse(raw);
  } catch {
    let quarantine = `${p}.corrupt-${Date.now()}`;
    try { fs.renameSync(p, quarantine); } catch { quarantine = p; }
    const err = new Error(`Spec-draft store is corrupt; quarantined to ${quarantine}`);
    err.code = "SPEC_DRAFT_CORRUPT";
    throw err;
  }
}

// Persist a draft atomically (temp file + rename over target). THROWS on failure
// (temp cleaned up) so the caller reports {ok:false} rather than a false success.
export function saveSpecDraft(dir, repoId, branch, filePath, draft) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = storePath(dir, repoId, branch, filePath);
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    repo: repoId,
    branch,
    path: filePath,
    body: typeof draft.body === "string" ? draft.body : "",
    baseObjectId: draft.baseObjectId || null,
    updatedAt: draft.updatedAt || new Date().toISOString(),
  };
  try {
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* temp cleanup best-effort */ }
    throw e;
  }
  return record;
}

// Remove a staged draft (after a successful push). Best-effort; never throws.
export function deleteSpecDraft(dir, repoId, branch, filePath) {
  const p = storePath(dir, repoId, branch, filePath);
  try { fs.rmSync(p, { force: true }); return true; } catch { return false; }
}
