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

// Parse an Azure DevOps Git remote URL into the coordinates needed for an
// authenticated Tippani launch. URLs are normalized to the dev.azure.com form.
export function parseAdoRemoteTarget(remoteUrl) {
  let url = String(remoteUrl || "").trim();
  if (!url) return null;
  if (url.toLowerCase().endsWith(".git")) url = url.slice(0, -4);

  let org = "", project = "", repo = "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      const gitIndex = parts.indexOf("_git");
      if (gitIndex < 1 || gitIndex + 1 >= parts.length) return null;
      project = parts[gitIndex - 1];
      repo = parts[gitIndex + 1];
      if (parsed.hostname.toLowerCase() === "dev.azure.com") org = parts[0] || "";
      else if (parsed.hostname.toLowerCase().endsWith(".visualstudio.com")) {
        org = parsed.hostname.slice(0, -".visualstudio.com".length);
      } else {
        return null;
      }
    } catch {
      return null;
    }
  } else {
    const match = url.match(/^git@(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com):v3\/([^/]+)\/([^/]+)\/([^/]+)$/i);
    if (!match) return null;
    [, org, project, repo] = match;
  }
  try { org = decodeURIComponent(org); } catch { /* leave as-is */ }
  try { project = decodeURIComponent(project); } catch { /* leave as-is */ }
  try { repo = decodeURIComponent(repo); } catch { /* leave as-is */ }
  org = org.trim(); project = project.trim(); repo = repo.trim();
  if (!org || !project || !repo) return null;
  return { org: `https://dev.azure.com/${org}`, project, repo };
}

// Backward-compatible project/repo-only shape used by existing callers.
export function parseAdoRemoteUrl(remoteUrl) {
  const target = parseAdoRemoteTarget(remoteUrl);
  if (!target) return null;
  const { project, repo } = target;
  return { project, repo };
}

export function inferAdoTargetFromLocalRepo(repoPath, fsImpl = fs) {
  const resolved = resolveGitDir(repoPath, fsImpl);
  if (!resolved.ok) return null;
  let config;
  try { config = fsImpl.readFileSync(path.join(resolved.gitDir, "config"), "utf8"); }
  catch {
    try {
      const commonDir = fsImpl.readFileSync(path.join(resolved.gitDir, "commondir"), "utf8").trim();
      config = fsImpl.readFileSync(path.join(path.resolve(resolved.gitDir, commonDir), "config"), "utf8");
    } catch {
      return null;
    }
  }
  return parseAdoRemoteTarget(parseGitConfigOriginUrl(config));
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
