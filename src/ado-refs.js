// ADO ref (branch) helpers (clickstop 2, step 9). Pure: building the payload to
// CREATE a branch, normalizing a branch name to a ref, and resolving a base branch
// from the available set with no dead-ends. No I/O.

// A brand-new ref updates from all-zeros (it doesn't exist yet) to the base tip.
export const ZERO_OBJECT_ID = "0000000000000000000000000000000000000000";

// Base-branch candidates in priority order — main/master, then develop/trunk, so
// a repo that doesn't use main/master still resolves instead of dead-ending.
export const BASE_BRANCH_CANDIDATES = ["main", "master", "develop", "trunk"];

export function normalizeBranchRef(branch) {
  const b = String(branch || "").trim().replace(/^refs\/heads\//, "");
  return b ? "refs/heads/" + b : "";
}

export function buildCreateBranchRef({ branch, baseTip } = {}) {
  const name = normalizeBranchRef(branch);
  if (!name) throw new Error("buildCreateBranchRef: branch required");
  if (!baseTip) throw new Error("buildCreateBranchRef: baseTip required");
  return { name, oldObjectId: ZERO_OBJECT_ID, newObjectId: baseTip };
}

// Resolve which existing branch to fork from: a caller preference if present,
// else the first of main/master/develop/trunk that exists. Null if none match.
export function resolveBaseBranch(available, preferred) {
  const set = new Set((available || []).map((b) => String(b || "").replace(/^refs\/heads\//, "")));
  const pref = preferred && String(preferred).replace(/^refs\/heads\//, "");
  if (pref && set.has(pref)) return pref;
  for (const c of BASE_BRANCH_CANDIDATES) if (set.has(c)) return c;
  return null;
}
