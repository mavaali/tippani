// Validate a local clone and enumerate its branches for the Discovery
// "Branches" tab (Local mode). The parsing helpers (parseGitHead,
// parsePackedRefs, mergeLocalBranches) are pure; resolveGitDir / validateLocalRepo
// do fs checks through an injected fs module so tests can supply a fake.
// Unit-tested (local-repo.test.mjs).
import fs from "node:fs";
import path from "node:path";

// Parse a .git/HEAD body -> the checked-out branch name, or null when detached
// (HEAD points straight at a commit sha).
export function parseGitHead(headContent) {
  const line = String(headContent || "").trim();
  const m = line.match(/^ref:\s*refs\/heads\/(.+)$/);
  return m ? m[1].trim() : null;
}

// Parse a .git/packed-refs body -> the branch (heads) names it lists.
export function parsePackedRefs(content) {
  const out = [];
  for (const raw of String(content || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    const m = line.match(/^[0-9a-f]+\s+refs\/heads\/(.+)$/i);
    if (m) out.push(m[1].trim());
  }
  return out;
}

// Merge loose + packed branch names, dedupe, sort (case-insensitive), and flag
// the current (checked-out) branch. Returns [{ name, current }].
export function mergeLocalBranches(loose, packed, headBranch) {
  const set = new Set([...(loose || []), ...(packed || [])]);
  const cur = headBranch || null;
  return [...set]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({ name, current: name === cur }));
}

// Resolve the real .git directory for a working tree. Handles both a .git
// directory and a .git *file* pointer (worktree / submodule). fsImpl is injected
// for tests. Returns { ok:true, gitDir } or { ok:false, error }.
export function resolveGitDir(repoPath, fsImpl = fs) {
  const p = String(repoPath || "").trim();
  if (!p) return { ok: false, error: "No path provided." };
  let stat;
  try { stat = fsImpl.statSync(p); } catch { return { ok: false, error: "Path not found." }; }
  if (!stat.isDirectory()) return { ok: false, error: "Path is not a directory." };

  const gitEntry = path.join(p, ".git");
  let gitStat;
  try { gitStat = fsImpl.statSync(gitEntry); } catch { return { ok: false, error: "Not a git repository (no .git)." }; }
  if (gitStat.isDirectory()) return { ok: true, gitDir: gitEntry };

  // A .git *file* (worktree / submodule) points elsewhere: "gitdir: <path>".
  let ptr;
  try { ptr = fsImpl.readFileSync(gitEntry, "utf8"); } catch { return { ok: false, error: "Unreadable .git pointer." }; }
  const m = String(ptr).match(/gitdir:\s*(.+)/);
  if (!m) return { ok: false, error: "Unreadable .git pointer." };
  const gd = m[1].trim();
  return { ok: true, gitDir: path.isAbsolute(gd) ? gd : path.join(p, gd) };
}

// Validate that `repoPath` is a git working tree and return its current branch.
// fsImpl is injected for tests. Returns { ok:true, path, branch, detached } or
// { ok:false, error }.
export function validateLocalRepo(repoPath, fsImpl = fs) {
  const resolved = resolveGitDir(repoPath, fsImpl);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  let head;
  try { head = fsImpl.readFileSync(path.join(resolved.gitDir, "HEAD"), "utf8"); }
  catch { return { ok: false, error: "Unreadable HEAD." }; }
  const branch = parseGitHead(head);
  return { ok: true, path: String(repoPath).trim(), branch: branch || null, detached: !branch };
}
