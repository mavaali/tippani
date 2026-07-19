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

// Parse a .git/refs/remotes/origin/HEAD symref -> the clone's default branch
// name (e.g. "ref: refs/remotes/origin/main" -> "main"), or null.
export function parseOriginHeadDefault(headContent) {
  const m = String(headContent || "").trim().match(/^ref:\s*refs\/remotes\/origin\/(.+)$/);
  return m ? m[1].trim() : null;
}

// Drop the clone's default/mainline branches so only user-created branches
// remain. Uses the resolved default when known, else the common main/master.
export function userCreatedBranches(branches, defaultName) {
  const drop = defaultName ? [defaultName] : ["main", "master"];
  return (branches || []).filter((b) => drop.indexOf(b.name) < 0);
}

// Parse a .git/config body -> the `origin` remote's URL (or null). INI-ish:
// a `[remote "origin"]` section header followed by a `url = …` line.
export function parseGitConfigOriginUrl(configText) {
  let inOrigin = false;
  for (const raw of String(configText || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      inOrigin = line.toLowerCase().replace(/\s+/g, " ").includes('[remote "origin"]');
      continue;
    }
    if (inOrigin && line.toLowerCase().startsWith("url")) {
      const eq = line.indexOf("=");
      if (eq >= 0) return line.slice(eq + 1).trim() || null;
    }
  }
  return null;
}

// Parse an Azure DevOps Git remote URL -> { project, repo } (or null). Handles
// dev.azure.com and *.visualstudio.com HTTPS forms (…/{project}/_git/{repo}) and
// the SSH form (git@ssh.dev.azure.com:v3/{org}/{project}/{repo}). Segments are
// URL-decoded; a trailing .git is stripped.
export function parseAdoRemoteUrl(remoteUrl) {
  let url = String(remoteUrl || "").trim();
  if (!url) return null;
  if (url.toLowerCase().endsWith(".git")) url = url.slice(0, -4);
  let project = "", repo = "";
  const marker = "/_git/";
  const gi = url.indexOf(marker);
  if (gi >= 0) {
    repo = url.slice(gi + marker.length).split("/")[0];
    const before = url.slice(0, gi).split("/").filter(Boolean);
    project = before.length ? before[before.length - 1] : "";
  } else {
    const ci = url.indexOf(":v3/");
    if (ci >= 0) {
      const seg = url.slice(ci + 4).split("/").filter(Boolean); // [org, project, repo]
      if (seg.length >= 3) { project = seg[seg.length - 2]; repo = seg[seg.length - 1]; }
    }
  }
  try { project = decodeURIComponent(project); } catch { /* leave as-is */ }
  try { repo = decodeURIComponent(repo); } catch { /* leave as-is */ }
  project = project.trim(); repo = repo.trim();
  if (!project || !repo) return null;
  return { project, repo };
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
