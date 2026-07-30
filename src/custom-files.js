// Persistent "Custom list" store for the Discovery Custom-list tab (clickstop 2).
//
// The user Adds individual .md files to a durable list that survives restarts.
// The list is the SINGLE SOURCE OF TRUTH for the custom-contributed approved
// roots: `customRoots()` derives the distinct parent folders of the listed
// files, and approved-roots.js unions those into its containment check. So the
// allow-list is a pure function of the list — adding a file approves its folder,
// removing the last file under a folder revokes it, and nothing ever accumulates
// as a dead root. Local-clone approvals stay in their own store (local-roots.json)
// so a custom removal can never revoke a clone's root.
//
// Durability mirrors personal-comments-store.js: writes are atomic (temp-file +
// rename) and THROW on failure, and a corrupt store is quarantined (renamed to
// `<file>.corrupt-<ts>`) and throws rather than being silently read as empty —
// which the next save would otherwise launder into permanent loss.
import fsDefault from "node:fs";
import pathDefault from "node:path";

export function createCustomFiles({ fs = fsDefault, path = pathDefault, file, configDir } = {}) {
  let entries = load();

  // Absent file -> []. Corrupt file -> quarantine + throw (never silently empty).
  // Accepts either a bare array or `{ files: [...] }`; each item may be a string
  // path or `{ path, addedAt }`. Deduped by path, order-preserving.
  function load() {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (e) {
      if (e && e.code === "ENOENT") return [];
      throw e;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      let quarantine = `${file}.corrupt-${Date.now()}`;
      try { fs.renameSync(file, quarantine); } catch { quarantine = file; }
      const err = new Error(`Custom-files store is corrupt; quarantined to ${quarantine}`);
      err.code = "CUSTOM_FILES_CORRUPT";
      throw err;
    }
    const arr = Array.isArray(data) ? data : (data && Array.isArray(data.files) ? data.files : []);
    const seen = new Set();
    const out = [];
    for (const it of arr) {
      const p = typeof it === "string" ? it : (it && typeof it.path === "string" ? it.path : "");
      if (!p || seen.has(p)) continue;
      seen.add(p);
      out.push({ path: p, addedAt: (it && it.addedAt) || null });
    }
    return out;
  }

  // Atomic temp-file + rename; THROWS on failure (temp cleaned up) so a handler
  // returns { ok:false } instead of claiming an add/remove that didn't persist.
  function persist() {
    if (configDir) fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = JSON.stringify(entries, null, 2);
    try {
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* temp cleanup best-effort */ }
      throw e;
    }
  }

  function list() { return entries.map((e) => ({ path: e.path, addedAt: e.addedAt })); }

  function has(realpath) { return entries.some((e) => e.path === realpath); }

  // Add a (already realpath'd) file. Idempotent — a second add of the same path
  // is a no-op (no duplicate tile, no rewrite). Persists on a real change.
  function add(realpath, { addedAt = new Date().toISOString() } = {}) {
    const p = String(realpath || "").trim();
    if (!p) throw new Error("custom-files add: empty path");
    if (!has(p)) { entries.push({ path: p, addedAt }); persist(); }
    return list();
  }

  // Remove a file by path. Persists only when the list actually changed.
  function remove(realpath) {
    const p = String(realpath || "").trim();
    const before = entries.length;
    entries = entries.filter((e) => e.path !== p);
    if (entries.length !== before) persist();
    return list();
  }

  // The custom-contributed approved roots: distinct parent folders of the listed
  // files. A folder is approved iff at least one listed file lives directly under
  // it, so removing the last file under a folder drops it automatically.
  function customRoots() {
    const roots = new Set();
    for (const e of entries) roots.add(path.dirname(e.path));
    return [...roots];
  }

  return { list, has, add, remove, customRoots };
}
