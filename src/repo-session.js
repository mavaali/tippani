// Repo-scoped pre-PR authoring session (clickstop 2, step 10).
//
// Today a review session assumes a pull request and derives its file set from the
// PR's changed items. Remote spec authoring starts before any PR exists: the user
// opens a `(repo, branch)` and stages a spec file. This module is the pure shape
// and validation for that no-PR session, plus a small token registry that mirrors
// the discipline used for the per-port session-token file in index.js: register
// cleanup only after a successful bind, and only ever release your OWN token — a
// failed open must never clobber another session's shared state.

/** Build a validated no-PR authoring session. Throws on missing repo/branch or a
 *  file entry without a path (so an empty file list is explicit, never a silent drop). */
export function makeRepoSession({ repo, branch, files = [], path = null } = {}) {
  if (!repo || typeof repo !== "string") throw new Error("repo-session requires a repo");
  if (!branch || typeof branch !== "string") throw new Error("repo-session requires a branch");
  const branchRef = branch.startsWith("refs/heads/") ? branch : `refs/heads/${branch}`;
  const list = Array.isArray(files) ? files : [];
  const normFiles = list.map((f, i) => {
    const p = typeof f === "string" ? f : (f && f.path);
    if (!p || typeof p !== "string") throw new Error(`repo-session file[${i}] has no path`);
    return typeof f === "string" ? Object.freeze({ path: p }) : Object.freeze({ ...f, path: p });
  });
  return Object.freeze({
    repo,
    branch,
    branchRef,
    path: path || null,
    pr: null,
    hasPr: false,
    files: Object.freeze(normFiles),
  });
}

/** A per-session token registry. Each session's token is keyed by its own id;
 *  release/bind touch only that id, so one session's failure can't unlink another's. */
export function createSessionTokens() {
  const byId = new Map();
  return {
    bind(id, tokenPath) {
      if (!id) throw new Error("session id required");
      if (!tokenPath || typeof tokenPath !== "string") throw new Error("token path required");
      byId.set(id, tokenPath);
      return tokenPath;
    },
    get(id) { return byId.has(id) ? byId.get(id) : null; },
    has(id) { return byId.has(id); },
    release(id) {
      const t = byId.has(id) ? byId.get(id) : null;
      byId.delete(id);
      return t;
    },
    ids() { return [...byId.keys()]; },
    size() { return byId.size; },
  };
}

/** Open an authoring session: build (may throw) FIRST, then bind the token. If the
 *  build fails nothing is bound and no other session's token is touched. */
export function openRepoSession({ id, repo, branch, files, path, tokenPath }, tokens = null) {
  const session = makeRepoSession({ repo, branch, files, path });
  if (tokens && id && tokenPath) tokens.bind(id, tokenPath);
  return session;
}
