import {
  createGitHubReviewProvider,
  mapPullRequest,
  parseViewedMarker,
  viewedMarker,
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
{
  const marker = viewedMarker({ 101: 5 });
  eq("viewed marker round-trip", parseViewedMarker(marker), { 101: 5 });
  eq("non-marker -> null", parseViewedMarker("hello"), null);
  let threw = false;
  try { parseViewedMarker("<!-- tippani:viewed:{bad} -->"); }
  catch { threw = true; }
  ok("corrupt viewed marker throws", threw);
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
    id: "U", displayName: "My Name", uniqueName: "me",
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
  eq("list PR request state/base", lastCall(client, "paginate").args, [
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

// --- content + changed files -----------------------------------------------
{
  const client = fakeClient({
    request: async () => "# raw markdown",
    paginate: async () => [
      { filename: "docs/a.md", status: "modified" },
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
    mdFiles: [{ path: "/docs/a.md", changeType: "modified" }],
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
  let comments = [];
  const client = fakeClient({
    paginate: async () => comments,
    request: async (method, path, options) => {
      if (method === "POST") {
        const comment = { id: 50, body: options.body.body };
        comments = [comment];
        return comment;
      }
      if (method === "PATCH") {
        comments[0].body = options.body.body;
        return comments[0];
      }
      return {};
    },
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  eq("no marker -> empty viewed", await provider.readViewed(7), {});
  await provider.setViewed(7, { 101: 5 });
  eq("created marker round trip", await provider.readViewed(7), { 101: 5 });
  await provider.setViewed(7, { 101: 6 });
  eq("updated existing marker", await provider.readViewed(7), { 101: 6 });
  ok("second write PATCHed rather than creating duplicate",
    callsOf(client, "request").some((call) => call.args[0] === "PATCH"));
}
{
  const client = fakeClient({
    paginate: async () => [{
      id: 1,
      body: "<!-- tippani:viewed:{bad} -->",
    }],
  });
  const provider = createGitHubReviewProvider(client, {
    owner: "o", repo: "r",
  });
  await rejects("strict viewed read propagates corrupt marker",
    () => provider.readViewed(7));
  eq("lenient viewed read -> {}", await provider.getViewed(7), {});
}
{
  const client = fakeClient({
    paginate: async () => {
      const error = new Error("forbidden");
      error.status = 403;
      throw error;
    },
  });
  eq("viewed auth failure maps sign-in error",
    await createGitHubReviewProvider(client, {
      owner: "o", repo: "r",
    }).loadViewedState(7, false),
    { map: {}, error: "GitHub sign-in expired." });
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
    { query: { path: "docs/spec.md", sha: "main" } },
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

console.log(`\ngithub-review-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
