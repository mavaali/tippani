// Pure, testable helpers for the local-clone (server-side git) review path,
// extracted from index.js so the base-branch selection and the symlink-safe
// working-tree path check can be unit-tested without spawning git or booting
// the server. The actual `git` invocation stays in index.js (it owns execFile);
// these are the decision bits the PR review flagged (base dead-ends on
// develop/trunk; a `..` string check that never inspects a symlink's target).
import fs from "fs";
import path from "path";

// Ordered list of base-revision candidates to diff a local branch against.
// Seeds the clone's real origin default (from `refs/remotes/origin/HEAD`) FIRST,
// then the conventional names — including develop/trunk, which the old list
// dead-ended by omitting. Leading-`-` names are rejected (git-flag injection).
export function baseCandidates(originHeadRef) {
  const out = [];
  const push = (c) => {
    const v = String(c || "").trim();
    if (v && !v.startsWith("-") && !out.includes(v)) out.push(v);
  };
  const def = String(originHeadRef || "").trim().replace(/^origin\//, "");
  if (def) { push(def); push("origin/" + def); }
  for (const n of ["main", "master", "develop", "trunk"]) { push(n); push("origin/" + n); }
  return out;
}

// Resolve a repo-relative file path to an absolute path that is PROVABLY inside
// the repo — following symlinks. Returns the real absolute path, or null when
// the path (or a symlink along it) escapes the repo root. The prior code only
// string-checked for `..` in the request, so an in-repo symlink pointing outside
// the clone slipped through; realpath-ing both ends closes that.
export function safeLocalPath(repoRoot, filePath) {
  let root;
  try { root = fs.realpathSync(repoRoot); }
  catch { return null; }
  const fp = String(filePath || "").replace(/^\/+/, "");
  if (!fp || fp.includes("\0") || /(^|[\\/])\.\.([\\/]|$)/.test(fp)) return null;
  const joined = path.resolve(root, fp);
  // Lexical containment first (covers a non-existent target).
  const lexRel = path.relative(root, joined);
  if (lexRel === "" || lexRel.startsWith("..") || path.isAbsolute(lexRel)) return null;
  // Then resolve symlinks and re-check — an in-repo link may target outside.
  let real;
  try { real = fs.realpathSync(joined); }
  catch { return joined; } // doesn't exist yet: the lexical check already held
  const rel = path.relative(root, real);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return real;
}
