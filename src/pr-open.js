// PR-open + Spec-review work-item builders (clickstop 2, step 12).
//
// Pure request builders plus an orchestrator whose ADO calls are INJECTED, so
// the whole find-or-create-and-link flow is unit-testable without a live ADO
// connection. Tippani never INFERS the work-item type or the PR title — the
// caller supplies them; a missing type/title is an error, not a guess.
//
// Reuses work-item.js (isReadOnlyWiql / buildWorkItemUrl) — the WIQL this module
// emits to find an existing item must pass the same read-only gate the search
// path enforces.
import { isReadOnlyWiql } from "./work-item.js";

const HEADS = "refs/heads/";
function toRef(branch) {
  return branch.startsWith(HEADS) ? branch : `${HEADS}${branch}`;
}
function sqlQuote(s) {
  return String(s).replace(/'/g, "''"); // double single-quotes for WIQL literals
}

/** Build the ADO GitPullRequest create request. Title is required (never
 *  inferred). Labels/reviewers/isDraft are the caller's explicit choices. */
export function buildPrCreateRequest({ title, description, sourceBranch, targetBranch, isDraft = false, reviewers, labels } = {}) {
  if (!title || typeof title !== "string") throw new Error("PR title is required");
  if (!sourceBranch) throw new Error("PR sourceBranch is required");
  if (!targetBranch) throw new Error("PR targetBranch is required");
  const req = {
    sourceRefName: toRef(sourceBranch),
    targetRefName: toRef(targetBranch),
    title,
    description: description || "",
    isDraft: !!isDraft,
  };
  if (Array.isArray(reviewers) && reviewers.length) req.reviewers = reviewers.map((id) => ({ id }));
  if (Array.isArray(labels) && labels.length) req.labels = labels.map((name) => ({ name }));
  return req;
}

/** The vstfs artifact URI that links a work item to a pull request. ADO expects
 *  the {project}/{repo}/{prId} triple URL-encoded into a single segment. */
export function prArtifactUri({ projectId, repositoryId, pullRequestId } = {}) {
  if (!projectId || !repositoryId || pullRequestId == null) throw new Error("prArtifactUri needs projectId, repositoryId, pullRequestId");
  const seg = `${projectId}/${repositoryId}/${pullRequestId}`;
  return `vstfs:///Git/PullRequestId/${encodeURIComponent(seg)}`;
}

/** Read-only WIQL to find an existing work item by exact title (+ type). Passes
 *  isReadOnlyWiql — asserted here so a future edit can't smuggle a mutation. */
export function buildSpecReviewWiql({ title, type } = {}) {
  if (!title) throw new Error("work-item title is required");
  let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${sqlQuote(title)}'`;
  if (type) wiql += ` AND [System.WorkItemType] = '${sqlQuote(type)}'`;
  if (!isReadOnlyWiql(wiql)) throw new Error("internal: generated WIQL is not read-only");
  return wiql;
}

/** JSON-patch document to CREATE the work item. Type is the caller's — never
 *  inferred. Description/tags are optional. */
export function buildWorkItemCreatePatch({ title, description, tags } = {}) {
  if (!title) throw new Error("work-item title is required");
  const ops = [{ op: "add", path: "/fields/System.Title", value: title }];
  if (description) ops.push({ op: "add", path: "/fields/System.Description", value: description });
  if (Array.isArray(tags) && tags.length) ops.push({ op: "add", path: "/fields/System.Tags", value: tags.join("; ") });
  return ops;
}

/** JSON-patch document to LINK an existing work item to a PR artifact. */
export function buildPrLinkPatch(artifactUri, { comment } = {}) {
  if (!artifactUri) throw new Error("artifactUri is required");
  return [{
    op: "add",
    path: "/relations/-",
    value: { rel: "ArtifactLink", url: artifactUri, attributes: { name: "Pull Request", comment: comment || "" } },
  }];
}

/** Find an existing "Spec review" work item by title, else create one. Returns
 *  {id, created}. ADO calls are injected: findWorkItems(wiql) -> [{id}],
 *  createWorkItem(patch, type) -> {id}. */
export async function findOrCreateSpecReviewWorkItem(deps, { title, type, description, tags } = {}) {
  if (!title) throw new Error("work-item title is required");
  if (!type) throw new Error("work-item type is required (Tippani never infers it)");
  const found = await deps.findWorkItems(buildSpecReviewWiql({ title, type }));
  const existing = Array.isArray(found) && found.length ? found[0] : null;
  if (existing && existing.id != null) return { id: existing.id, created: false };
  const created = await deps.createWorkItem(buildWorkItemCreatePatch({ title, description, tags }), type);
  return { id: created.id, created: true };
}

/** Open a draft/normal PR and find-or-create-and-link a Spec review work item.
 *  Every ADO call is wrapped by `call` (the ado-call timeout in production) so a
 *  hung call rejects instead of hanging. Deps: createPr(req)->{pullRequestId,url},
 *  findWorkItems, createWorkItem,
 *  linkWorkItem(id,{projectId,repositoryId,pullRequestId,comment}). The result reports
 *  only what actually happened — no ADO-MCP, no raw git. */
export async function openSpecReviewPr(deps, args = {}) {
  const {
    title, description, sourceBranch, targetBranch, isDraft = true, reviewers, labels,
    projectId, repositoryId,
    workItemTitle, workItemType, workItemDescription, workItemTags,
  } = args;
  const call = deps.call || ((fn) => fn());

  const pr = await call(() => deps.createPr(buildPrCreateRequest({ title, description, sourceBranch, targetBranch, isDraft, reviewers, labels })));
  const prId = pr.pullRequestId ?? pr.id ?? null;

  let workItemId = null, workItemCreated = false, linked = false;
  if (workItemTitle) {
    const wi = await findOrCreateSpecReviewWorkItem(
      {
        findWorkItems: (wiql) => call(() => deps.findWorkItems(wiql)),
        createWorkItem: (patch, type) => call(() => deps.createWorkItem(patch, type)),
      },
      { title: workItemTitle, type: workItemType, description: workItemDescription, tags: workItemTags },
    );
    workItemId = wi.id;
    workItemCreated = wi.created;
    if (prId != null && workItemId != null) {
      await call(() => deps.linkWorkItem(workItemId, {
        projectId,
        repositoryId,
        pullRequestId: prId,
        comment: "Spec review",
      }));
      linked = true;
    }
  }

  return {
    ok: true,
    pullRequestId: prId,
    url: pr.url || pr.webUrl || null,
    isDraft: !!isDraft,
    workItemId,
    workItemCreated,
    linked,
  };
}
