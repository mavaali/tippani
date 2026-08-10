// End-to-end direct GitHub PR portal smoke against a local fake GitHub API.
// No network, no real repository writes.

import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "tippani-gh-smoke-"));
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++;
  else { fail++; console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`); }
}
const listen = (server) => new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(server));
});
const close = (server) => new Promise((resolve) => server.close(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let commentCreated = false;
let draftPublished = false;
const writes = [];
const rawPr = {
  number: 7,
  node_id: "PR_7",
  title: "GitHub spec",
  body: "Description",
  state: "open",
  draft: false,
  created_at: "2026-01-01T00:00:00Z",
  user: { login: "author", node_id: "U" },
  head: {
    ref: "spec/x",
    sha: "head-sha",
    repo: {
      name: "r", full_name: "o/r",
      owner: { login: "o" },
      html_url: "https://github.com/o/r",
    },
  },
  base: {
    ref: "main",
    repo: {
      name: "r", full_name: "o/r",
      owner: { login: "o" },
      html_url: "https://github.com/o/r",
    },
  },
  html_url: "https://github.com/o/r/pull/7",
};

const api = await listen(http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://fake");
  let body = "";
  for await (const chunk of req) body += chunk;
  const parsed = body ? JSON.parse(body) : null;
  const sendJson = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };

  if (url.pathname === "/user") {
    return sendJson({ login: "reviewer", name: "Reviewer" });
  }
  if (url.pathname === "/user/orgs") return sendJson([]);
  if (url.pathname === "/user/repos") {
    return sendJson([{
      full_name: "o/r",
      name: "r",
      owner: { login: "o" },
      default_branch: "main",
      html_url: "https://github.com/o/r",
      permissions: { push: true },
    }]);
  }
  if (url.pathname === "/users/o") {
    return sendJson({ login: "o", type: "Organization" });
  }
  if (url.pathname === "/search/code") {
    return sendJson({
      total_count: 1,
      items: [{
        path: "docs/spec.md",
        html_url: "https://github.com/o/r/blob/main/docs/spec.md",
        repository: {
          full_name: "o/r",
          name: "r",
          default_branch: "main",
          owner: { login: "o" },
        },
      }],
    });
  }
  if (url.pathname === "/repos/o/r/pulls/7") return sendJson(rawPr);
  if (url.pathname === "/repos/o/r/pulls/8") {
    return sendJson({
      ...rawPr,
      number: 8,
      node_id: "PR_8",
      draft: !draftPublished,
      html_url: "https://github.com/o/r/pull/8",
    });
  }
  if (url.pathname === "/repos/o/r/git/ref/heads/spec/authored") {
    return sendJson({
      ref: "refs/heads/spec/authored",
      object: { sha: "authored-tip" },
    });
  }
  if (req.method === "POST" && url.pathname === "/repos/o/r/pulls") {
    writes.push(["create-pr", parsed]);
    return sendJson({
      ...rawPr,
      number: 8,
      node_id: "PR_8",
      title: parsed.title,
      body: parsed.body,
      draft: parsed.draft,
      head: { ...rawPr.head, ref: parsed.head },
      base: { ...rawPr.base, ref: parsed.base },
      html_url: "https://github.com/o/r/pull/8",
    }, 201);
  }
  if (url.pathname === "/repos/o/r/pulls/7/files") {
    return sendJson([{ filename: "docs/spec.md", status: "modified" }]);
  }
  if (url.pathname === "/repos/o/r/contents/docs/spec.md") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("# GitHub Spec\n\nBody.");
  }
  if (url.pathname === "/repos/o/r") {
    return sendJson({
      full_name: "o/r",
      name: "r",
      owner: { login: "o" },
      default_branch: "main",
      html_url: "https://github.com/o/r",
      permissions: { push: true },
    });
  }
  if (
    req.method === "POST" &&
    url.pathname === "/repos/o/r/pulls/7/comments"
  ) {
    writes.push(["comment", parsed]);
    commentCreated = true;
    return sendJson({ id: 101 });
  }
  if (
    req.method === "POST" &&
    url.pathname === "/repos/o/r/pulls/7/reviews"
  ) {
    writes.push(["review", parsed]);
    return sendJson({ id: 1, state: parsed.event });
  }
  if (req.method === "POST" && url.pathname === "/graphql") {
    if (parsed.query.includes("TippaniPullRequestSearch")) {
      return sendJson({
        data: {
          search: {
            nodes: [{
              number: 7,
              title: "GitHub spec",
              url: "https://github.com/o/r/pull/7",
              state: "OPEN",
              isDraft: false,
              mergedAt: null,
              createdAt: "2026-01-01T00:00:00Z",
              headRefName: "spec/x",
              baseRefName: "main",
              author: { login: "author" },
              repository: { name: "r", owner: { login: "o" } },
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    }
    if (parsed.query.includes("PublishTippaniPullRequest")) {
      draftPublished = true;
      writes.push(["publish-pr", parsed.variables]);
      return sendJson({
        data: {
          markPullRequestReadyForReview: {
            pullRequest: {
              id: "PR_8",
              number: 8,
              isDraft: false,
              url: "https://github.com/o/r/pull/8",
            },
          },
        },
      });
    }
    const nodes = commentCreated ? [{
      id: "THREAD_1",
      isResolved: false,
      path: "docs/spec.md",
      line: 3,
      originalLine: null,
      startLine: null,
      comments: {
        nodes: [{
          id: "COMMENT_101",
          fullDatabaseId: "101",
          author: { login: "reviewer" },
          body: "Comment",
          createdAt: "2026-01-02T00:00:00Z",
        }],
      },
    }] : [];
    return sendJson({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    });
  }
  return sendJson({ message: `Unhandled ${req.method} ${url.pathname}` }, 404);
}));

const apiBase = `http://127.0.0.1:${api.address().port}`;
const portal = http.createServer();
await listen(portal);
const portalPort = portal.address().port;
await close(portal);

const child = spawn(process.execPath, [
  path.join(ROOT, "src", "index.js"),
  "github:o/r#7",
  "--gh-token=test-token",
  "--headless",
  `--port=${portalPort}`,
], {
  cwd: ROOT,
  env: {
    ...process.env,
    HOME: home,
    TIPPANI_GITHUB_API_BASE: apiBase,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

const base = `http://127.0.0.1:${portalPort}`;
async function waitReady(url = `${base}/file/0`) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

let browseChild = null;
try {
  const ready = await waitReady();
  check("GitHub portal boots to rendered spec", ready, stderr || stdout);
  if (ready) {
    const page = await (await fetch(`${base}/file/0`)).text();
    check("rendered page contains GitHub spec", page.includes("GitHub Spec"));

    const comment = await fetch(`${base}/api/comment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${portalPort}`,
      },
      body: JSON.stringify({
        filePath: "/docs/spec.md",
        line: 3,
        content: "Review",
      }),
    });
    const commentResult = await comment.json();
    check("inline comment syncs through GitHub provider",
      commentResult.ok && commentResult.synced === true,
      JSON.stringify(commentResult));
    check("comment used live head/path/line",
      writes.some(([kind, value]) =>
        kind === "comment" &&
        value.commit_id === "head-sha" &&
        value.path === "docs/spec.md" &&
        value.line === 3));

    // Refresh the portal's cached thread list after the successful write, just
    // as a normal sync/reload does, so the control API can resolve handle 101.
    await fetch(`${base}/api/sync`, {
      method: "POST",
      headers: { Origin: `http://localhost:${portalPort}` },
    });

    const tokenPath = path.join(
      home, ".tippani", `session-token-${portalPort}`,
    );
    const sessionToken = fs.readFileSync(tokenPath, "utf8").trim();
    const discovery = await fetch(`${base}/api/v1/prs`, {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "X-Tippani-Client": "smoke-github-pr",
      },
    });
    const discoveryResult = await discovery.json();
    check("GitHub PR discovery returns neutral results",
      discovery.status === 200 &&
      Array.isArray(discoveryResult.prs) &&
      discoveryResult.prs.length === 1 &&
      discoveryResult.prs[0].repo === "r",
      JSON.stringify(discoveryResult));

    const specs = await fetch(`${base}/api/v1/specs/search`, {
      method: "POST",
      headers: {
        Origin: `http://localhost:${portalPort}`,
        "X-Tippani-Client": "smoke-github-pr",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "GitHub", project: "o" }),
    });
    const specsResult = await specs.json();
    check("GitHub spec search returns repository-qualified Markdown",
      specs.status === 200 &&
      specsResult.specs?.[0]?.repoId === "o/r" &&
      specsResult.specs?.[0]?.path === "/docs/spec.md",
      JSON.stringify(specsResult));

    const discoveryPage = await (await fetch(`${base}/discovery`)).text();
    check("GitHub Discovery hides unsupported work items",
      discoveryPage.includes("GitHub repositories") &&
      !discoveryPage.includes('data-tab="workitems"'));

    const searchedSpec = await fetch(
      `${base}/spec?repo=o%2Fr&path=%2Fdocs%2Fspec.md&repoName=r&project=o&branch=main`,
    );
    const searchedSpecPage = await searchedSpec.text();
    check("GitHub search result opens read-only in Tippani",
      searchedSpec.ok && searchedSpecPage.includes("GitHub Spec"),
      `status=${searchedSpec.status}`);

    const mutationHeaders = {
      Authorization: "Bearer " + sessionToken,
      "X-Tippani-Client": "smoke-github-pr",
      "Content-Type": "application/json",
    };
    const stagedCreate = await fetch(`${base}/api/v1/pr/stage`, {
      method: "POST",
      headers: mutationHeaders,
      body: JSON.stringify({
        org: "https://github.com",
        project: "o",
        repo: "o/r",
        title: "Authored spec",
        description: "Created through Tippani",
        sourceBranch: "spec/authored",
        targetBranch: "main",
        isDraft: true,
      }),
    });
    const stagedCreateResult = await stagedCreate.json();
    check("GitHub PR creation stages locally",
      stagedCreate.status === 200 && stagedCreateResult.ok === true,
      JSON.stringify(stagedCreateResult));
    const pushedCreate = await fetch(`${base}/api/v1/branches/push`, {
      method: "POST",
      headers: mutationHeaders,
      body: "{}",
    });
    const pushedCreateResult = await pushedCreate.json();
    check("GitHub PR creation crosses on explicit push",
      pushedCreate.status === 200 &&
      pushedCreateResult.ok === true &&
      pushedCreateResult.results?.[0]?.pullRequestId === 8,
      JSON.stringify(pushedCreateResult));
    check("GitHub PR creation maps neutral request",
      writes.some(([kind, value]) =>
        kind === "create-pr" &&
        value.title === "Authored spec" &&
        value.head === "spec/authored" &&
        value.base === "main" &&
        value.draft === true));

    const stagedPublish = await fetch(
      `${base}/api/v1/pr/publish/stage`,
      {
        method: "POST",
        headers: mutationHeaders,
        body: JSON.stringify({
          org: "https://github.com",
          project: "o",
          repo: "o/r",
          pullRequestId: 8,
          title: "Authored spec",
        }),
      },
    );
    const stagedPublishResult = await stagedPublish.json();
    check("GitHub draft publication stages locally",
      stagedPublish.status === 200 && stagedPublishResult.ok === true,
      JSON.stringify(stagedPublishResult));
    const pushedPublish = await fetch(`${base}/api/v1/branches/push`, {
      method: "POST",
      headers: mutationHeaders,
      body: "{}",
    });
    const pushedPublishResult = await pushedPublish.json();
    check("GitHub draft publication crosses on explicit push",
      pushedPublish.status === 200 &&
      pushedPublishResult.ok === true &&
      pushedPublishResult.publishes?.results?.[0]?.pullRequestId === 8,
      JSON.stringify(pushedPublishResult));
    check("GitHub draft publication uses GraphQL node id",
      draftPublished &&
      writes.some(([kind, value]) =>
        kind === "publish-pr" && value.pullRequestId === "PR_8"));

    const viewed = await fetch(`${base}/api/v1/threads/101/viewed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "X-Tippani-Client": "smoke-github-pr",
      },
    });
    check("mark-viewed writes through private GitHub store",
      viewed.status === 200, `status=${viewed.status}`);

    const review = await fetch(`${base}/api/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${portalPort}`,
      },
      body: JSON.stringify({ type: "approve" }),
    });
    const reviewResult = await review.json();
    check("formal approval syncs through GitHub provider",
      review.status === 200 && reviewResult.ok === true);
    check("approval sent APPROVE event",
      writes.some(([kind, value]) =>
        kind === "review" && value.event === "APPROVE"));

    const viewedPath = path.join(home, ".tippani", "github-viewed.json");
    check("viewed state remains private (no GitHub issue comment writes)",
      !writes.some(([kind]) => kind === "issue-comment"));
    check("viewed state is durable local JSON", fs.existsSync(viewedPath));
    if (fs.existsSync(viewedPath)) {
      const viewedJson = JSON.parse(fs.readFileSync(viewedPath, "utf8"));
      check("viewed store key/value", viewedJson["o/r#7"]?.["101"] === 101);
    }

    const browseProbe = http.createServer();
    await listen(browseProbe);
    const browsePort = browseProbe.address().port;
    await close(browseProbe);
    browseChild = spawn(process.execPath, [
      path.join(ROOT, "src", "index.js"),
      "--browse",
      "--github=o/r",
      "--gh-token=test-token",
      "--headless",
      `--port=${browsePort}`,
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOME: home,
        TIPPANI_GITHUB_API_BASE: apiBase,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let browseErr = "";
    browseChild.stderr.on("data", (chunk) => { browseErr += chunk; });
    const browseBase = `http://127.0.0.1:${browsePort}`;
    const browseReady = await waitReady(`${browseBase}/discovery`);
    check("GitHub --browse portal boots end to end",
      browseReady, browseErr);
    if (browseReady) {
      const browsePage = await (await fetch(`${browseBase}/discovery`)).text();
      check("GitHub browse home includes review results",
        browsePage.includes("GitHub spec") &&
        browsePage.includes("/open/7?owner=o&amp;repo=r"));
    }
  }
} finally {
  if (browseChild) browseChild.kill("SIGTERM");
  child.kill("SIGTERM");
  await close(api);
  fs.rmSync(home, { recursive: true, force: true });
}

console.log(`\nsmoke-github-pr: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
