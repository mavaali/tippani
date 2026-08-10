// Build an ADO GitPullRequestSearchCriteria from list_prs filter args (item 6).
// Defaults to the authenticated user's ACTIVE pull requests; the agent (or the
// /prs filter bar) can widen it to any creator / status. Pure — no ADO calls.
//
// ADO PullRequestStatus enum: active=1, abandoned=2, completed=3, all=4.

export const PR_STATUS = { active: 1, abandoned: 2, completed: 3, all: 4 };

export function buildPrCriteria(args = {}, { currentUserId = null } = {}) {
  const { status = "active", creator, reviewer, target } = args || {};
  const crit = {};
  const st = PR_STATUS[String(status).toLowerCase()];
  crit.status = st === undefined ? PR_STATUS.active : st;
  // creator defaults to "me" (current user); "any"/"all"/null clears it; any
  // other truthy value is treated as an explicit ADO identity id.
  const c = creator === undefined ? "me" : creator;
  if (c === "me") { if (currentUserId) crit.creatorId = currentUserId; }
  else if (c === "any" || c === "all" || c === null) { /* no creator constraint */ }
  else if (c) { crit.creatorId = c; }
  if (reviewer) crit.reviewerId = reviewer;
  if (target) crit.targetRefName = String(target).startsWith("refs/") ? target : `refs/heads/${target}`;
  return crit;
}

// Project a raw ADO pull request into the summary the /prs page + list_prs tool
// return. Keeps the wire shape stable and small.
export function summarizePr(pr) {
  const repo = pr.repository || {};
  return {
    id: pr.pullRequestId,
    title: pr.title || "",
    author: pr.createdBy?.displayName || "",
    status: pr.status,
    isDraft: !!pr.isDraft,
    source: (pr.sourceRefName || "").replace("refs/heads/", ""),
    target: (pr.targetRefName || "").replace("refs/heads/", ""),
    repo: repo.name || null,
    project: repo.project?.name || null,
    created: pr.creationDate || null,
    webUrl: pr._links?.web?.href || repo.webUrl || null,
  };
}

// A pull request's status arrives in two shapes depending on the source: the
// SDK PR-search returns the numeric GitPullRequestStatus enum (active=1,
// abandoned=2, completed=3), while the org-wide REST endpoint returns it as a
// STRING ("active"/"completed"/"abandoned"). Normalize both to a display label
// so a consumer (e.g. the Discovery home cards) doesn't render a blank chip when
// it's handed the form it didn't expect. Same string-vs-enum discrepancy that
// bit getPullRequestQuery's status filter.
export function prStatusLabel(s) {
  if (s === 1 || s === "active") return "Active";
  if (s === 3 || s === "completed") return "Completed";
  if (s === 2 || s === "abandoned") return "Abandoned";
  return "";
}

// Merge the two role-scoped result sets (specs I'm authoring + specs I'm
// reviewing) into one list, de-duped by PR id (a PR I both authored and review
// appears once) and tagged with the role(s) it matched. `authored` and
// `reviewing` are arrays of summarized PRs (see summarizePr); order is authored
// first, then any reviewing-only PRs, so my own specs lead the queue.
export function mergeRolePrs(authored = [], reviewing = []) {
  const byId = new Map();
  const add = (pr, role) => {
    const key = `${pr.project || ""}/${pr.repo || ""}#${pr.id}`;
    const existing = byId.get(key);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
    } else {
      byId.set(key, { ...pr, roles: [role] });
    }
  };
  for (const pr of authored) add(pr, "author");
  for (const pr of reviewing) add(pr, "reviewer");
  return [...byId.values()];
}
