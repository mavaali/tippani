// Tests for PR-open + Spec-review work-item builders (clickstop 2, step 12).
import {
  buildPrCreateRequest,
  prArtifactUri,
  buildSpecReviewWiql,
  buildWorkItemCreatePatch,
  buildPrLinkPatch,
  findOrCreateSpecReviewWorkItem,
  openSpecReviewPr,
} from "./pr-open.js";
import { isReadOnlyWiql } from "./work-item.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
async function threwAsync(name, fn) { let t = false; try { await fn(); } catch { t = true; } ok(name, t); }
function threw(name, fn) { let t = false; try { fn(); } catch { t = true; } ok(name, t); }

// --- buildPrCreateRequest ---
const pr = buildPrCreateRequest({ title: "Add spec", sourceBranch: "spec/x", targetBranch: "main", isDraft: true, labels: ["spec"] });
eq("PR source ref qualified", pr.sourceRefName, "refs/heads/spec/x");
eq("PR target ref qualified", pr.targetRefName, "refs/heads/main");
ok("PR carries the caller's title (never inferred)", pr.title === "Add spec");
ok("PR isDraft honored", pr.isDraft === true);
eq("PR labels mapped", pr.labels, [{ name: "spec" }]);
ok("qualified branch stays", buildPrCreateRequest({ title: "t", sourceBranch: "refs/heads/a", targetBranch: "refs/heads/b" }).sourceRefName === "refs/heads/a");
threw("missing title throws", () => buildPrCreateRequest({ sourceBranch: "a", targetBranch: "b" }));
threw("missing source throws", () => buildPrCreateRequest({ title: "t", targetBranch: "b" }));

// --- prArtifactUri ---
eq("artifact uri encodes the triple",
  prArtifactUri({ projectId: "P", repositoryId: "R", pullRequestId: 42 }),
  "vstfs:///Git/PullRequestId/P%2FR%2F42");
threw("artifact uri needs all parts", () => prArtifactUri({ projectId: "P", repositoryId: "R" }));

// --- buildSpecReviewWiql (read-only) ---
const wiql = buildSpecReviewWiql({ title: "Spec: O'Brien", type: "Task" });
ok("WIQL is read-only", isReadOnlyWiql(wiql));
ok("WIQL escapes single quotes", wiql.includes("O''Brien"));
ok("WIQL filters by type", wiql.includes("[System.WorkItemType] = 'Task'"));
threw("WIQL needs a title", () => buildSpecReviewWiql({ type: "Task" }));

// --- buildWorkItemCreatePatch ---
const patch = buildWorkItemCreatePatch({ title: "Spec review", description: "d", tags: ["spec", "review"] });
eq("create patch sets title", patch[0], { op: "add", path: "/fields/System.Title", value: "Spec review" });
ok("create patch includes description", patch.some((o) => o.path === "/fields/System.Description"));
ok("create patch joins tags", patch.some((o) => o.path === "/fields/System.Tags" && o.value === "spec; review"));

// --- buildPrLinkPatch ---
const link = buildPrLinkPatch("vstfs:///Git/PullRequestId/x", { comment: "Spec review" });
eq("link patch adds an ArtifactLink relation", link[0].value.rel, "ArtifactLink");
ok("link patch carries the artifact uri", link[0].value.url === "vstfs:///Git/PullRequestId/x");

// --- findOrCreateSpecReviewWorkItem ---
{
  const found = await findOrCreateSpecReviewWorkItem(
    { findWorkItems: async () => [{ id: 7 }], createWorkItem: async () => { throw new Error("should not create"); } },
    { title: "Spec review", type: "Task" });
  ok("reuses an existing work item", found.id === 7 && found.created === false);
}
{
  let createdWith = null;
  const created = await findOrCreateSpecReviewWorkItem(
    { findWorkItems: async () => [], createWorkItem: async (p, type) => { createdWith = { p, type }; return { id: 99 }; } },
    { title: "Spec review", type: "Bug", description: "d" });
  ok("creates when none found", created.id === 99 && created.created === true);
  ok("creates with the caller's type (not inferred)", createdWith.type === "Bug");
}
await threwAsync("work item create needs a type", () =>
  findOrCreateSpecReviewWorkItem({ findWorkItems: async () => [] }, { title: "t" }));

// --- openSpecReviewPr orchestration ---
{
  const calls = [];
  const deps = {
    createPr: async (req) => { calls.push(["createPr", req]); return { pullRequestId: 55, url: "http://pr/55" }; },
    findWorkItems: async () => [],
    createWorkItem: async () => ({ id: 88 }),
    linkWorkItem: async (id, linkIdentity) => { calls.push(["link", id, linkIdentity]); return {}; },
  };
  const r = await openSpecReviewPr(deps, {
    title: "Add spec", sourceBranch: "spec/x", targetBranch: "main",
    projectId: "P", repositoryId: "R",
    workItemTitle: "Spec review", workItemType: "Task",
  });
  ok("PR opened + work item created + linked", r.ok && r.pullRequestId === 55 && r.workItemId === 88 && r.workItemCreated && r.linked);
  ok("createPr got a well-formed request", calls[0][1].sourceRefName === "refs/heads/spec/x");
  eq("link receives backend-neutral PR identity (provider builds backend patch)",
    calls.find((c) => c[0] === "link")[2],
    { projectId: "P", repositoryId: "R", pullRequestId: 55, comment: "Spec review" });
}
{
  // No work-item title -> PR only, no work item touched.
  const r = await openSpecReviewPr({ createPr: async () => ({ pullRequestId: 1, url: "u" }) }, {
    title: "t", sourceBranch: "a", targetBranch: "b",
  });
  ok("PR-only when no work item requested", r.pullRequestId === 1 && r.workItemId === null && r.linked === false);
}
{
  // A hung ADO call rejects via the injected timeout wrapper.
  const hang = () => new Promise(() => {});
  const call = (fn) => Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), 20))]);
  await threwAsync("a hung ADO call times out", () =>
    openSpecReviewPr({ createPr: hang, call }, { title: "t", sourceBranch: "a", targetBranch: "b" }));
}

console.log(`pr-open: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
