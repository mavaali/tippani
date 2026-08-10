// Tests for the Azure DevOps ReviewProvider capability. The provider is tested
// against a fake azure-devops-node-api connection: no network, but every method
// asserts the exact SDK call shape so extraction cannot quietly swap argument
// order, forget a project/repo coordinate, or return success without invoking
// the backend.
import { createAdoReviewProvider } from "./ado-review-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}
function eq(name, actual, expected) {
  ok(
    name + ` (got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}
async function rejects(name, fn, pattern) {
  let err = null;
  try { await fn(); } catch (e) { err = e; }
  ok(name, !!err && (!pattern || pattern.test(err.message)));
}
async function* chunks(...values) {
  for (const value of values) yield value;
}

function fakeConnection(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => {
    calls.push({ name, args });
    if (typeof result === "function") return result(...args);
    return result;
  };
  const gitApi = {
    getPullRequestById: record("getPullRequestById", { pullRequestId: 42 }),
    getPullRequestsByProject: record("getPullRequestsByProject", []),
    getItemContent: record("getItemContent", chunks("# spec")),
    getPullRequestIterations: record("getPullRequestIterations", [{ id: 1 }]),
    getPullRequestIterationChanges: record(
      "getPullRequestIterationChanges",
      { changeEntries: [] },
    ),
    getThreads: record("getThreads", []),
    createThread: record("createThread", { id: 1 }),
    createComment: record("createComment", { id: 2 }),
    updateThread: record("updateThread", { id: 1, status: 2 }),
    createPullRequestReviewer: record(
      "createPullRequestReviewer",
      { id: "reviewer-1", vote: 10 },
    ),
    getPullRequestProperties: record("getPullRequestProperties", { value: {} }),
    updatePullRequestProperties: record("updatePullRequestProperties", {}),
    getCommits: record("getCommits", []),
    getPullRequestQuery: record("getPullRequestQuery", { results: [] }),
    getRefs: record(
      "getRefs",
      [{ name: "refs/heads/main", objectId: "tip-main" }],
    ),
    createPush: record(
      "createPush",
      { commits: [{ commitId: "new-commit" }] },
    ),
    ...overrides.gitApi,
  };
  const conn = {
    getGitApi: async () => {
      calls.push({ name: "getGitApi", args: [] });
      return gitApi;
    },
    connect: record(
      "connect",
      overrides.connectResult ?? {
        authenticatedUser: { id: "reviewer-1", displayName: "Reviewer" },
      },
    ),
    ...(overrides.withoutSecurityApi ? {} : {
      getSecurityApi: async () => {
        calls.push({ name: "getSecurityApi", args: [] });
        return {
          hasPermissions: async (...args) => {
            calls.push({ name: "hasPermissions", args });
            return overrides.permissionResult ?? [true];
          },
        };
      },
    }),
  };
  return { conn, gitApi, calls };
}

function lastCall(calls, name) {
  return [...calls].reverse().find((c) => c.name === name);
}
function countCalls(calls, name) {
  return calls.filter((c) => c.name === name).length;
}

let currentRepo = "repo-A";
let currentProject = "project-A";
function providerFor(fake, options = {}) {
  return createAdoReviewProvider(fake.conn, {
    getRepo: () => currentRepo,
    getProject: () => currentProject,
    ...options,
  });
}

// --- pull request read/list -------------------------------------------------
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  const pr = await provider.getPullRequest(42);
  eq("getPullRequest returns SDK result", pr, { pullRequestId: 42 });
  eq("getPullRequest -> getPullRequestById(prId)", lastCall(fake.calls, "getPullRequestById").args, [42]);
}
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestsByProject: async (...args) => {
        fake.calls.push({ name: "getPullRequestsByProject", args });
        return null;
      },
    },
  });
  const provider = providerFor(fake);
  const criteria = { status: 1 };
  eq("listPullRequests normalizes null -> []", await provider.listPullRequests(criteria, 25), []);
  eq(
    "listPullRequests forwards project/criteria/top in SDK positions",
    lastCall(fake.calls, "getPullRequestsByProject").args,
    ["project-A", criteria, undefined, undefined, 25],
  );
}

// Defaults are getters, not captured strings: applyRepoContextFromPR can
// re-point them after the provider instance already exists.
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  currentRepo = "repo-after-pr";
  currentProject = "project-after-pr";
  await provider.listThreads(7);
  eq(
    "provider reads dynamic repo/project defaults at call time",
    lastCall(fake.calls, "getThreads").args,
    ["repo-after-pr", 7, "project-after-pr"],
  );
  currentRepo = "repo-A";
  currentProject = "project-A";
}

// --- file content -----------------------------------------------------------
{
  const fake = fakeConnection({
    gitApi: {
      getItemContent: async (...args) => {
        fake.calls.push({ name: "getItemContent", args });
        return chunks(Buffer.from("# "), "Hello");
      },
    },
  });
  const provider = providerFor(fake);
  eq("getFileContent concatenates stream chunks", await provider.getFileContent("/docs/a.md", "refs/heads/spec/x"), "# Hello");
  const args = lastCall(fake.calls, "getItemContent").args;
  eq("getFileContent uses current repo/project", [args[0], args[1], args[2]], ["repo-A", "/docs/a.md", "project-A"]);
  eq("getFileContent normalizes branch version descriptor", args[8], { version: "spec/x", versionType: 0 });
}
{
  const envelope = JSON.stringify({
    message: "TF401175: version could not be resolved",
    typeKey: "GitUnresolvableToCommitException",
  });
  const fake = fakeConnection({
    gitApi: { getItemContent: async () => chunks(envelope) },
  });
  await rejects(
    "getFileContent rejects an ADO error envelope streamed as content",
    () => providerFor(fake).getFileContent("/a.md", "missing"),
    /TF401175/,
  );
}
{
  const fake = fakeConnection();
  await providerFor(fake).getFileContent("/a.md", "main", {
    repo: "repo-explicit",
    project: "project-explicit",
  });
  const args = lastCall(fake.calls, "getItemContent").args;
  eq("getFileContent explicit coordinates override defaults", [args[0], args[2]], ["repo-explicit", "project-explicit"]);
}

// --- changed files ----------------------------------------------------------
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestIterations: async (...args) => {
        fake.calls.push({ name: "getPullRequestIterations", args });
        return [{ id: 1 }, { id: 9 }];
      },
      getPullRequestIterationChanges: async (...args) => {
        fake.calls.push({ name: "getPullRequestIterationChanges", args });
        return {
          changeEntries: [
            { changeType: 2, item: { path: "/docs/a.md" } },
            { changeType: 1, item: { path: "/images/a.png" } },
            { changeType: 16, item: { path: "/docs/deleted.md" } },
            { changeType: 2, item: { path: "/folder", isFolder: true } },
          ],
        };
      },
    },
  });
  const result = await providerFor(fake).listChangedFiles(55);
  eq("listChangedFiles classifies markdown", result.mdFiles, [{ path: "/docs/a.md", changeType: 2 }]);
  eq("listChangedFiles classifies other files + extension", result.otherFiles, [{ path: "/images/a.png", ext: ".png" }]);
  eq("listChangedFiles uses last iteration", lastCall(fake.calls, "getPullRequestIterationChanges").args, ["repo-A", 55, 9, "project-A"]);
}
{
  const fake = fakeConnection({
    gitApi: { getPullRequestIterations: async () => [] },
  });
  eq(
    "listChangedFiles empty iterations -> empty result",
    await providerFor(fake).listChangedFiles(1),
    { mdFiles: [], otherFiles: [] },
  );
  ok("listChangedFiles empty iterations never asks for changes", countCalls(fake.calls, "getPullRequestIterationChanges") === 0);
}

// --- threads/comments -------------------------------------------------------
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  await provider.listThreads(12);
  eq("listThreads coordinates", lastCall(fake.calls, "getThreads").args, ["repo-A", 12, "project-A"]);

  await provider.createComment(12, {
    filePath: "/spec.md", line: 7, body: "Needs evidence",
  });
  const createArgs = lastCall(fake.calls, "createThread").args;
  eq("createComment SDK coordinates", createArgs.slice(1), ["repo-A", 12, "project-A"]);
  eq("createComment builds active single-comment thread", createArgs[0], {
    comments: [{ content: "Needs evidence", commentType: 1 }],
    status: 1,
    threadContext: {
      filePath: "/spec.md",
      rightFileStart: { line: 7, offset: 1 },
      rightFileEnd: { line: 7, offset: 1 },
    },
  });

  await provider.replyToThread(12, 88, "Fixed.");
  eq("replyToThread SDK call", lastCall(fake.calls, "createComment").args, [
    { content: "Fixed.", commentType: 1 },
    "repo-A", 12, 88, "project-A",
  ]);

  await provider.resolveThread(12, 88);
  eq("resolveThread SDK call", lastCall(fake.calls, "updateThread").args, [
    { status: 2 }, "repo-A", 12, 88, "project-A",
  ]);
}

// --- formal review vote -----------------------------------------------------
{
  const fake = fakeConnection();
  eq("getCurrentUser projects neutral identity",
    await providerFor(fake).getCurrentUser(), {
    id: "reviewer-1",
    displayName: "Reviewer",
    uniqueName: null,
  });
}
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  await provider.submitReview(12, -5);
  eq("submitReview connects to resolve reviewer identity", countCalls(fake.calls, "connect"), 1);
  eq("submitReview sends exact vote + reviewer id", lastCall(fake.calls, "createPullRequestReviewer").args, [
    { vote: -5 }, "repo-A", 12, "reviewer-1", "project-A",
  ]);
}
{
  const fake = fakeConnection({ connectResult: {} });
  eq("getCurrentUser missing identity -> null",
    await providerFor(fake).getCurrentUser(), null);
}

// --- edit/push permission probe --------------------------------------------
{
  const fake = fakeConnection();
  const allowed = await providerFor(fake).probePushPermission(
    "project-guid", "repo-guid",
  );
  ok("probePushPermission true result", allowed === true);
  eq("probePushPermission exact namespace/bit/token", lastCall(
    fake.calls, "hasPermissions",
  ).args, [
    "2e9eb7ed-3c0a-47d4-87c1-0ffdd275fd87",
    4,
    "repoV2/project-guid/repo-guid",
  ]);
}
{
  const fake = fakeConnection({ permissionResult: false });
  ok("probePushPermission scalar false", await providerFor(
    fake,
  ).probePushPermission("p", "r") === false);
}
{
  const fake = fakeConnection({ withoutSecurityApi: true });
  ok("probePushPermission unsupported SDK -> null", await providerFor(
    fake,
  ).probePushPermission("p", "r") === null);
}
{
  const fake = fakeConnection({ connectResult: {} });
  await rejects(
    "submitReview refuses to vote without authenticated identity",
    () => providerFor(fake).submitReview(12, 10),
    /resolve your Azure DevOps identity/,
  );
  ok("submitReview missing identity never invokes reviewer write", countCalls(fake.calls, "createPullRequestReviewer") === 0);
}

// --- durable viewed state ---------------------------------------------------
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestProperties: async (...args) => {
        fake.calls.push({ name: "getPullRequestProperties", args });
        return { value: { "tippani.viewed": { $value: '{"101":5}' } } };
      },
    },
  });
  const provider = providerFor(fake);
  eq("readViewed parses PR property", await provider.readViewed(44), { 101: 5 });
  eq("readViewed coordinates", lastCall(fake.calls, "getPullRequestProperties").args, ["repo-A", 44, "project-A"]);
}
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestProperties: async () => ({
        "tippani.viewed": { $value: '{"7":9}' },
      }),
    },
  });
  eq("readViewed accepts alternate SDK response shape", await providerFor(fake).readViewed(1), { 7: 9 });
}
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestProperties: async () => ({
        value: { "tippani.viewed": { $value: "{bad-json" } },
      }),
    },
  });
  const provider = providerFor(fake);
  await rejects("readViewed strict read propagates corrupt JSON", () => provider.readViewed(1));
  eq("getViewed display-only read swallows corrupt JSON -> {}", await provider.getViewed(1), {});
}
{
  const fake = fakeConnection();
  await providerFor(fake).setViewed(3, { 101: 5 });
  const args = lastCall(fake.calls, "updatePullRequestProperties").args;
  eq("setViewed content type", args[0], { "Content-Type": "application/json-patch+json" });
  eq("setViewed patch", args[1], [{ op: "add", path: "/tippani.viewed", value: '{"101":5}' }]);
  eq("setViewed coordinates", args.slice(2), ["repo-A", 3, "project-A"]);
}
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestProperties: async () => {
        throw new Error("401 token expired");
      },
    },
  });
  const provider = providerFor(fake);
  eq("loadViewedState offline does not read", await provider.loadViewedState(1, true), { map: {}, error: null });
  ok("loadViewedState offline never acquires gitApi", countCalls(fake.calls, "getGitApi") === 0);
  eq("loadViewedState auth failure -> sign-in message", await provider.loadViewedState(1, false), { map: {}, error: "ADO sign-in expired." });
}
{
  const fake = fakeConnection({
    gitApi: {
      getPullRequestProperties: async () => {
        throw new Error("network down");
      },
    },
  });
  eq("loadViewedState generic failure -> reachability message", await providerFor(fake).loadViewedState(1, false), {
    map: {}, error: "Couldn't reach Azure DevOps.",
  });
}

// --- file review history ----------------------------------------------------
{
  const completedOld = {
    pullRequestId: 10, status: "completed", closedDate: "2026-01-01",
  };
  const completedNew = {
    pullRequestId: 20, status: 3, closedDate: "2026-02-01",
  };
  const active = {
    pullRequestId: 30, status: "active", creationDate: "2026-03-01",
  };
  const fake = fakeConnection({
    gitApi: {
      getCommits: async (...args) => {
        fake.calls.push({ name: "getCommits", args });
        return [{ commitId: "c1" }, { commitId: "c2" }];
      },
      getPullRequestQuery: async (...args) => {
        fake.calls.push({ name: "getPullRequestQuery", args });
        return {
          results: [
            { c1: [completedOld, active] },
            { c2: [completedNew, completedOld] },
          ],
        };
      },
      getThreads: async (...args) => {
        fake.calls.push({ name: "getThreads", args });
        const prId = args[1];
        if (prId === 20) {
          return [{
            id: 200,
            comments: [{ id: 1, content: "new" }],
            threadContext: { filePath: "\\DOCS\\SPEC.MD" },
          }];
        }
        return [{
          id: 100,
          comments: [{ id: 1, content: "old" }],
          threadContext: { filePath: "/other.md" },
        }];
      },
    },
  });
  const history = await providerFor(fake).getFileReviewHistory(
    "repo-history", "/docs/spec.md", "main",
  );
  eq("getFileReviewHistory keeps only closed PRs with matching file threads", history.map((h) => h.pr.pullRequestId), [20]);
  eq("getFileReviewHistory preserves raw comments for rendering above provider", history[0].threads[0].comments[0].content, "new");
  const commitArgs = lastCall(fake.calls, "getCommits").args;
  eq("getFileReviewHistory commit query", commitArgs, [
    "repo-history",
    { itemPath: "/docs/spec.md", itemVersion: { version: "main", versionType: 0 } },
    undefined, 0, 100,
  ]);
}
{
  const errors = [];
  const fake = fakeConnection({
    gitApi: {
      getCommits: async () => { throw new Error("no history"); },
    },
  });
  const provider = providerFor(fake, {
    logger: { error: (...args) => errors.push(args) },
  });
  eq("getFileReviewHistory best-effort failure -> []", await provider.getFileReviewHistory("r", "/a.md"), []);
  ok("getFileReviewHistory logs the failure", errors.length === 1 && /no history/.test(errors[0][1]));
}

// --- branch tip + commit ----------------------------------------------------
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  eq("getBranchTip finds exact ref", await provider.getBranchTip("refs/heads/main"), "tip-main");
  eq("getBranchTip SDK filter + coordinates", lastCall(fake.calls, "getRefs").args, [
    "repo-A", "project-A", "heads/main",
  ]);
}
{
  const fake = fakeConnection({ gitApi: { getRefs: async () => [] } });
  await rejects(
    "getBranchTip missing ref throws",
    () => providerFor(fake).getBranchTip("refs/heads/missing"),
    /Branch ref not found/,
  );
}
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  const commitId = await provider.commitFile("refs/heads/spec/x", {
    filePath: "/docs/spec.md",
    content: "# updated",
    message: "Update spec",
    expectedOldObjectId: "expected-sha",
  });
  eq("commitFile returns commit id", commitId, "new-commit");
  ok("commitFile supplied SHA skips live tip read", countCalls(fake.calls, "getRefs") === 0);
  const args = lastCall(fake.calls, "createPush").args;
  eq("commitFile coordinates", args.slice(1), ["repo-A", "project-A"]);
  eq("commitFile ref update", args[0].refUpdates, [{
    name: "refs/heads/spec/x", oldObjectId: "expected-sha",
  }]);
  eq("commitFile builds one edit", args[0].commits[0].changes.map((c) => [
    c.changeType, c.item.path, c.newContent.content,
  ]), [[2, "/docs/spec.md", "# updated"]]);
}
{
  const fake = fakeConnection();
  const provider = providerFor(fake);
  await provider.commitFile("refs/heads/main", {
    filePath: "/a.md",
    content: "x",
    message: "m",
    repo: "repo-explicit",
    project: "project-explicit",
  });
  eq("commitFile missing expected SHA reads explicit branch tip first", lastCall(fake.calls, "getRefs").args, [
    "repo-explicit", "project-explicit", "heads/main",
  ]);
  eq("commitFile push uses explicit coordinates", lastCall(fake.calls, "createPush").args.slice(1), [
    "repo-explicit", "project-explicit",
  ]);
}

console.log(`\nado-review-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
