import {
  createGitHubReviewProvider,
  mapPullRequest,
} from "./github-review-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
async function rejects(name, fn, pattern) {
  let error = null; try { await fn(); } catch (e) { error = e; }
  ok(name, !!error && (!pattern || pattern.test(error.message)));
}

function rawPr(overrides = {}) {
  return {
    number: 7,
    node_id: "PR_node",
    title: "Add spec",
    body: "description",
    state: "open",
    draft: true,
    created_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    merged_at: null,
    html_url: "https://github.com/o/r/pull/7",
    user: { id: 1, node_id: "U_1", login: "author" },
    head: {
      ref: "spec/x",
      sha: "head-sha",
      repo: {
        name: "r",
        full_name: "o/r",
        html_url: "https://github.com/o/r",
        owner: { login: "o" },
      },
    },
    base: {
      ref: "main",
      repo: {
        name: "r",
        full_name: "o/r",
        html_url: "https://github.com/o/r",
        owner: { login: "o" },
      },
    },
    requested_reviewers: [{ login: "reviewer" }],
    ...overrides,
  };
}

function threadNode({
  nodeId = "THREAD_1",
  rootId = "101",
  resolved = false,
  path = "docs/spec.md",
  line = 12,
  body = "Comment",
} = {}) {
  return {
    id: nodeId,
    isResolved: resolved,
    path,
    line,
    originalLine: null,
    startLine: null,
    comments: {
      nodes: [{
        id: `COMMENT_${rootId}`,
        fullDatabaseId: rootId,
        author: { login: "reviewer" },
        body,
        createdAt: "2026-01-02T00:00:00Z",
      }],
    },
  };
}

function fakeClient({
  request,
  graphql,
  paginate,
} = {}) {
  const calls = [];
  return {
    calls,
    request: async (...args) => {
      calls.push({ name: "request", args });
      return request ? request(...args) : {};
    },
    graphql: async (...args) => {
      calls.push({ name: "graphql", args });
      return graphql ? graphql(...args) : {};
    },
    paginate: async (...args) => {
      calls.push({ name: "paginate", args });
      return paginate ? paginate(...args) : [];
    },
  };
}
const callsOf = (client, name) =>
  client.calls.filter((call) => call.name === name);
const lastCall = (client, name) =>
  [...callsOf(client, name)].reverse()[0];

// --- mapping helpers --------------------------------------------------------
{
  const mapped = mapPullRequest(rawPr(), { owner: "o", repo: "r" });
  eq("PR mapping id/status/source/target", [
    mapped.pullRequestId,
    mapped.status,
    mapped.sourceRefName,
    mapped.targetRefName,
  ], [7, 1, "refs/heads/spec/x", "refs/heads/main"]);
  eq("PR mapping repository context", mapped.repository, {
    id: "o/r",
    name: "r",
    project: { id: "o", name: "o" },
    webUrl: "https://github.com/o/r",
  });
  ok("merged PR maps completed", mapPullRequest(rawPr({
    state: "closed", merged_at: "2026-01-03",
  })).status === 3);
  ok("closed unmerged maps abandoned", mapPullRequest(rawPr({
    state: "closed",
  })).status === 2);
}

// --- construction / identity / PR -----------------------------------------
{
  let threw = false;
  try { createGitHubReviewProvider(null, { owner: "o", repo: "r" }); }
  catch { threw = true; }
  ok("provider requires client", threw);
}
{
  const client = fakeClient({
    request: async (method, path) => {
      if (path === "/user") {
        return { id: 1, node_id: "U", login: "me", name: "My Name" };
      }
      return rawPr();
    },
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  eq("getCurrentUser neutral identity", await provider.getCurrentUser(), {
    id: "me", displayName: "My Name", uniqueName: "me",
  });
  ok("getPullRequest maps raw PR",
    (await provider.getPullRequest(7)).pullRequestId === 7);
  eq("get PR REST path", lastCall(client, "request").args.slice(0, 2), [
    "GET", "/repos/o/r/pulls/7",
  ]);
}

// --- list PRs ---------------------------------------------------------------
{
  const rows = [
    rawPr(),
    rawPr({ number: 8, user: { login: "other" } }),
    rawPr({
      number: 9,
      state: "closed",
      merged_at: "2026-02-01",
      requested_reviewers: [],
    }),
  ];
  const client = fakeClient({ paginate: async () => rows });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  const result = await provider.listPullRequests({
    status: 1,
    creatorId: "author",
    reviewerId: "reviewer",
    targetRefName: "refs/heads/main",
  }, 10);
  eq("list PR filters author+reviewer", result.map((pr) => pr.pullRequestId), [7]);
  const pullsCall = callsOf(client, "paginate").find((call) =>
    call.args[0] === "/repos/o/r/pulls");
  eq("list PR request state/base", pullsCall.args, [
    "/repos/o/r/pulls",
    {
      query: {
        state: "open",
        base: "main",
        sort: "updated",
        direction: "desc",
      },
      maxPages: 1,
    },
  ]);
}
{
  const reviewed = rawPr({
    requested_reviewers: [],
  });
  const client = fakeClient({
    paginate: async (path) => path.endsWith("/pulls")
      ? [reviewed]
      : [{ user: { login: "reviewer" }, state: "CHANGES_REQUESTED" }],
  });
  const result = await createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  }).listPullRequests({ status: 1, reviewerId: "reviewer" });
  eq("reviewer filter includes submitted reviewers, not only pending requests",
    result.map((pr) => pr.pullRequestId), [7]);
  ok("submitted-review endpoint consulted",
    callsOf(client, "paginate").some((call) =>
      call.args[0].endsWith("/pulls/7/reviews")));
}

// --- content + changed files -----------------------------------------------
{
  const client = fakeClient({
    request: async () => "# raw markdown",
    paginate: async () => [
      { filename: "docs/a.md", status: "modified" },
      { filename: "docs/new.md", status: "added" },
      { filename: "docs/moved.md", status: "renamed" },
      { filename: "image.png", status: "added" },
      { filename: "gone.md", status: "removed" },
    ],
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  eq("getFileContent raw response", await provider.getFileContent(
    "/docs/a.md", "refs/heads/spec/x",
  ), "# raw markdown");
  const contentCall = lastCall(client, "request").args;
  eq("getFileContent path/options", contentCall, [
    "GET",
    "/repos/o/r/contents/docs/a.md",
    {
      query: { ref: "spec/x" },
      accept: "application/vnd.github.raw+json",
      responseType: "text",
    },
  ]);
  eq("changed files classification", await provider.listChangedFiles(7), {
    mdFiles: [
      { path: "/docs/a.md", changeType: 2 },
      { path: "/docs/new.md", changeType: 1 },
      { path: "/docs/moved.md", changeType: 8 },
    ],
    otherFiles: [{ path: "/image.png", ext: ".png" }],
  });
}

// --- threads/comments/resolve ----------------------------------------------
{
  let graphPage = 0;
  const client = fakeClient({
    graphql: async () => {
      graphPage++;
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [threadNode({
                nodeId: `THREAD_${graphPage}`,
                rootId: String(100 + graphPage),
                resolved: graphPage === 2,
              })],
              pageInfo: {
                hasNextPage: graphPage === 1,
                endCursor: graphPage === 1 ? "cursor" : null,
              },
            },
          },
        },
      };
    },
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  const threads = await provider.listThreads(7);
  eq("thread pagination + numeric handles", threads.map((thread) => [
    thread.id, thread.status, thread.threadContext.filePath,
  ]), [[101, 1, "/docs/spec.md"], [102, 2, "/docs/spec.md"]]);
  await provider.resolveThread(7, 101);
  const mutation = lastCall(client, "graphql").args;
  ok("resolve uses private GraphQL node id",
    mutation[1].threadId === "THREAD_1");
}
{
  const client = fakeClient({
    request: async (method, path, options) => {
      if (path === "/repos/o/r/pulls/7") return rawPr();
      if (path.endsWith("/comments")) return { id: 101 };
      if (path.endsWith("/replies")) return { id: 102 };
      return {};
    },
    graphql: async () => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [threadNode()],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  const created = await provider.createComment(7, {
    filePath: "/docs/spec.md", line: 12, body: "Review",
  });
  ok("createComment returns containing thread", created.id === 101);
  const post = callsOf(client, "request").find((call) =>
    call.args[0] === "POST" && call.args[1].endsWith("/comments"));
  eq("create comment body", post.args[2].body, {
    body: "Review",
    commit_id: "head-sha",
    path: "docs/spec.md",
    line: 12,
    side: "RIGHT",
  });
  await provider.replyToThread(7, 101, "Reply");
  ok("reply endpoint uses root numeric comment",
    lastCall(client, "request").args[1].endsWith(
      "/pulls/7/comments/101/replies"));
}
{
  let readCount = 0;
  const postedShas = [];
  const client = fakeClient({
    request: async (method, path, options) => {
      if (method === "GET" && path === "/repos/o/r/pulls/7") {
        readCount++;
        return rawPr({
          head: {
            ...rawPr().head,
            sha: readCount === 1 ? "sha-A" : "sha-B",
          },
        });
      }
      if (method === "POST" && path.endsWith("/comments")) {
        postedShas.push(options.body.commit_id);
        return { id: 101 };
      }
      return {};
    },
    graphql: async () => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [threadNode()],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  await provider.createComment(7, {
    filePath: "/docs/spec.md", line: 1, body: "first",
  });
  await provider.createComment(7, {
    filePath: "/docs/spec.md", line: 1, body: "second",
  });
  eq("createComment refreshes PR head before every anchored write",
    postedShas, ["sha-A", "sha-B"]);
}
{
  const client = fakeClient({
    graphql: async () => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [threadNode({ rootId: "9007199254740993" })],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  await rejects(
    "unsafe numeric thread handle rejected explicitly",
    () => createGitHubReviewProvider(client, {
      owner: "o", repo: "r",
    }).listThreads(7),
    /no safe numeric root comment id/,
  );
}

// --- formal review / permission --------------------------------------------
{
  const client = fakeClient({
    request: async (method, path, options) => {
      if (path === "/repos/o/r") return { permissions: { push: true } };
      return options?.body || {};
    },
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  eq("approve event", await provider.submitReview(7, 10), {
    event: "APPROVE",
  });
  eq("request-changes event/body", await provider.submitReview(7, -5), {
    event: "REQUEST_CHANGES",
    body: "Changes requested via Tippani.",
  });
  await rejects("zero vote unsupported", () => provider.submitReview(7, 0));
  ok("push permission", await provider.probePushPermission() === true);
}

// --- viewed state -----------------------------------------------------------
{
  const state = new Map();
  const writes = [];
  const client = fakeClient();
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
    viewedStore: {
      read: async (key) => state.get(key) || {},
      write: async (key, map) => {
        writes.push([key, map]);
        state.set(key, { ...map });
      },
    },
  });
  eq("no local state -> empty viewed", await provider.readViewed(7), {});
  await provider.setViewed(7, { 101: 5 });
  eq("private local viewed round trip", await provider.readViewed(7), { 101: 5 });
  await provider.setViewed(7, { 101: 6 });
  eq("updated local state", await provider.readViewed(7), { 101: 6 });
  eq("store key is owner/repo#PR", writes[0][0], "o/r#7");
  ok("viewed state makes no GitHub API call", client.calls.length === 0);
}
{
  const provider = createGitHubReviewProvider(fakeClient(), {
    owner: "o", repo: "r",
    viewedStore: {
      read: async () => "corrupt",
      write: async () => {},
    },
  });
  await rejects("strict viewed read propagates corrupt local state",
    () => provider.readViewed(7));
  eq("lenient viewed read -> {}", await provider.getViewed(7), {});
}
{
  const client = fakeClient();
  eq("viewed store failure maps local-state error",
    await createGitHubReviewProvider(client, {
      owner: "o", repo: "r",
      viewedStore: {
        read: async () => { throw new Error("disk"); },
        write: async () => {},
      },
    }).loadViewedState(7, false),
    { map: {}, error: "Couldn't load local GitHub viewed state." });
  eq("offline viewed state skips store",
    await createGitHubReviewProvider(client, {
      owner: "o", repo: "r",
      viewedStore: {
        read: async () => { throw new Error("must not read"); },
        write: async () => {},
      },
    }).loadViewedState(7, true),
    { map: {}, error: null });
}

// --- file review history ----------------------------------------------------
{
  const closed = rawPr({
    number: 12,
    state: "closed",
    closed_at: "2026-02-01T00:00:00Z",
  });
  const open = rawPr({ number: 13, state: "open" });
  const client = fakeClient({
    paginate: async (path) => {
      if (path.endsWith("/commits")) {
        return [{ sha: "c1" }, { sha: "c2" }];
      }
      return [];
    },
    request: async (method, path) => {
      if (path.includes("/commits/c1/pulls")) return [closed, open];
      if (path.includes("/commits/c2/pulls")) return [closed];
      return {};
    },
    graphql: async (_query, variables) => ({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [threadNode({
              rootId: String(100 + variables.number),
              path: variables.number === 12
                ? "docs/spec.md"
                : "other.md",
            })],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    }),
  });
  const history = await createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  }).getFileReviewHistory("o/r", "/docs/spec.md", "main");
  eq("history dedupes closed PRs and filters file threads",
    history.map((item) => item.pr.pullRequestId), [12]);
  eq("history commit query path/branch", callsOf(
    client, "paginate",
  )[0].args, [
    "/repos/o/r/commits",
    {
      query: { path: "docs/spec.md", sha: "main" },
      perPage: 100,
      maxPages: 1,
    },
  ]);
}

// --- branch tip + commit ----------------------------------------------------
{
  let tip = "base";
  const client = fakeClient({
    request: async (method, path, options) => {
      if (path.includes("/git/ref/")) return { object: { sha: tip } };
      if (method === "GET" && path.includes("/contents/")) {
        return { sha: "blob-sha" };
      }
      if (method === "PUT") {
        return { commit: { sha: "commit-sha" } };
      }
      return {};
    },
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  eq("branch tip", await provider.getBranchTip(
    "refs/heads/spec/x",
  ), "base");
  eq("commit returns sha", await provider.commitFile(
    "refs/heads/spec/x",
    {
      filePath: "/docs/a.md",
      content: "# updated",
      message: "Update",
      expectedOldObjectId: "base",
    },
  ), "commit-sha");
  const put = callsOf(client, "request").find((call) =>
    call.args[0] === "PUT");
  eq("commit contents body", put.args[2].body, {
    message: "Update",
    content: Buffer.from("# updated").toString("base64"),
    branch: "spec/x",
    sha: "blob-sha",
  });
  tip = "moved";
  await rejects(
    "stale branch -> 409 conflict",
    () => provider.commitFile("spec/x", {
      filePath: "/docs/a.md",
      content: "x",
      message: "m",
      expectedOldObjectId: "base",
    }),
    /already been updated/,
  );
}
{
  let tipReads = 0;
  let putCalled = false;
  const client = fakeClient({
    request: async (method, path) => {
      if (path.includes("/git/ref/")) {
        tipReads++;
        return { object: { sha: tipReads === 1 ? "base" : "moved" } };
      }
      if (method === "GET" && path.includes("/contents/")) {
        return { sha: "new-blob-sha" };
      }
      if (method === "PUT") {
        putCalled = true;
        return { commit: { sha: "should-not-happen" } };
      }
      return {};
    },
  });
  await rejects(
    "movement between first tip check and metadata read -> conflict",
    () => createGitHubReviewProvider(client, {
      owner: "o", repo: "r",
    }).commitFile("spec/x", {
      filePath: "/docs/a.md",
      content: "x",
      message: "m",
      expectedOldObjectId: "base",
    }),
    /already been updated/,
  );
  ok("raced commit never reaches PUT", !putCalled);
}

console.log(`\ngithub-review-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
