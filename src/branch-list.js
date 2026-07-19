// Shape ADO Git refs into compact branch rows for the Discovery "Branches" tab.
// Pure + unit-tested (branch-list.test.mjs). "My branches" filtering is done
// server-side by ADO (getRefs with includeMyBranches=true); here we only strip
// the ref prefix, drop the repo's default branch, build the ADO web URL, and
// sort — no network, so it stays testable.

// "refs/heads/dev/kay/x" -> "dev/kay/x". Leaves non-head refs untouched.
export function shortBranchName(refName) {
  return String(refName || "").replace(/^refs\/heads\//, "");
}

// Build the ADO web URL for a branch: {org}/{project}/_git/{repo}?version=GB{branch}.
export function buildBranchWebUrl(org, project, repo, branch) {
  if (!org || !project || !repo || !branch) return null;
  const base = String(org).replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repo)}?version=GB${encodeURIComponent(branch)}`;
}

// One ADO ref -> a compact row, or null when it isn't a branch head.
export function summarizeBranchRef(ref, repo, org) {
  if (!ref || !ref.name || !String(ref.name).startsWith("refs/heads/")) return null;
  const name = shortBranchName(ref.name);
  const repoName = (repo && repo.name) || "";
  const project = (repo && repo.project && repo.project.name) || "";
  return {
    name,
    ref: ref.name,
    repo: repoName,
    repoId: (repo && repo.id) || null,
    project,
    objectId: ref.objectId || null,
    url: buildBranchWebUrl(org, project, repoName, name),
  };
}

// Shape a repo's refs into rows, dropping the repo's default branch (main /
// master / …) so only the user's own branches remain. Returns [] for none.
export function branchesForRepo(refs, repo, org) {
  const def = shortBranchName((repo && repo.defaultBranch) || "");
  const rows = [];
  for (const ref of refs || []) {
    const row = summarizeBranchRef(ref, repo, org);
    if (!row) continue;
    if (def && row.name === def) continue; // drop the default branch
    rows.push(row);
  }
  return rows;
}

// Sort branch rows by repo, then branch name (case-insensitive, stable).
export function sortBranches(list) {
  return (list || []).slice().sort((a, b) => {
    const r = (a.repo || "").localeCompare(b.repo || "", undefined, { sensitivity: "base" });
    if (r !== 0) return r;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });
}
