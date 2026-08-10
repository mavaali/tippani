// Approved local-review roots (allow-list) — extracted from index.js (clickstop 2,
// step 1) into an importable, testable module. Behavior is preserved exactly: the
// local review path reads .md straight off disk from a caller-supplied repo path
// (?local=…, MCP open_branch_file / open_file). Left open, a (possibly
// prompt-injected) agent could read any .md under any git repo on the machine. So
// local reads are gated to roots the user DELIBERATELY approved — opened via the
// Repo box / openLocalRepo or the --local-repo launch arg. Approvals persist so a
// later MCP session still trusts a repo the user set up earlier. realpath-based, so
// a symlinked alias of an approved root still matches.
//
// `isContained(abs)` is a pure string containment check against the (realpath'd)
// roots — used by open-file-path.js to tell a symlink-escape (lexically inside a
// root, real path outside) from a plain outside-a-root path, without re-realpathing.
import fsDefault from "node:fs";
import pathDefault from "node:path";

export function createApprovedRoots({ fs = fsDefault, path = pathDefault, rootsFile, configDir, extraRoots } = {}) {
  const roots = new Set();
  // Additional, DYNAMIC approved roots supplied by another source (the Custom-list
  // store's `customRoots()`), unioned into every containment check. Kept separate
  // from the persisted local-clone `roots` set so the two provenances never mix:
  // a custom-list removal can't revoke a clone's root, and vice versa. Resolved
  // lazily on each call so add/remove in the custom list takes effect immediately.
  const getExtraRoots = typeof extraRoots === "function" ? extraRoots : () => [];

  (function load() {
    try {
      const arr = JSON.parse(fs.readFileSync(rootsFile, "utf8"));
      if (Array.isArray(arr)) for (const r of arr) if (typeof r === "string" && r) roots.add(r);
    } catch { /* none yet */ }
  })();

  function persist() {
    try {
      if (configDir) fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(rootsFile, JSON.stringify([...roots], null, 2), { mode: 0o600 });
    } catch { /* persistence best-effort; the in-memory approval still holds */ }
  }

  function approveLocalRoot(p) {
    let real;
    try { real = fs.realpathSync(String(p || "").trim()); } catch { return null; }
    if (!roots.has(real)) { roots.add(real); persist(); }
    return real;
  }

  // Pure containment against the already-realpath'd roots (no filesystem access).
  function isContained(abs) {
    if (!abs) return false;
    for (const root of roots) {
      if (abs === root || abs.startsWith(root + path.sep)) return true;
    }
    for (const root of getExtraRoots()) {
      if (root && (abs === root || abs.startsWith(root + path.sep))) return true;
    }
    return false;
  }

  // Realpath the candidate, then containment — the gate index.js has always used.
  function isApprovedRoot(p) {
    let real;
    try { real = fs.realpathSync(String(p || "").trim()); } catch { return false; }
    return isContained(real);
  }

  // The most specific approved root that contains `abs` (already realpath'd), or
  // null. Lets a caller decide whether a link stays within the current file's
  // own root folder (open in-app) versus outside it (open externally).
  function containingRoot(abs) {
    if (!abs) return null;
    let best = null;
    const consider = (root) => {
      if (root && (abs === root || abs.startsWith(root + path.sep))) {
        if (!best || root.length > best.length) best = root;
      }
    };
    for (const root of roots) consider(root);
    for (const root of getExtraRoots()) consider(root);
    return best;
  }

  return { approveLocalRoot, isApprovedRoot, isContained, containingRoot, roots };
}
