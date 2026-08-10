import { GitHubApiError } from "./github-client.js";
import {
  createGitHubRepoContentProvider,
  repoCoordinate,
} from "./github-repo-content-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
async function rejects(name, fn, pattern) {
  let error = null; try { await fn(); } catch (e) { error = e; }
  ok(name, !!error && (!pattern || pattern.test(error.message)));
  return error;
}

function fakeClient({ request, paginate } = {}) {
  const calls = [];
  return {
    calls,
    request: async (...args) => {
      calls.push({ name: "request", args });
      return request ? request(...args) : {};
    },
    paginate: async (...args) => {
      calls.push({ name: "paginate", args });
      return paginate ? paginate(...args) : [];
    },
  };
}
const calls = (client, name) =>
  client.calls.filter((call) => call.name === name);

eq("repo coordinate full name", repoCoordinate("o/r"), { owner: "o", repo: "r" });
eq("repo coordinate project owner", repoCoordinate("r", "o"), { owner: "o", repo: "r" });

{
  const client = fakeClient({
    request: async (_method, path) => path === "/user"
      ? { login: "me" }
      : {},
    paginate: async (path) => path === "/user/orgs"
      ? [{ login: "org" }, { login: "me" }]
      : [],
  });
  const provider = createGitHubRepoContentProvider(client);
  eq("listProjects maps user+orgs, deduped", await provider.listProjects(), [
    { id: "me", name: "me" },
    { id: "org", name: "org" },
  ]);
}

{
  const repo = {
    full_name: "o/r",
    name: "r",
    default_branch: "trunk",
    html_url: "https://github.com/o/r",
    owner: { login: "o" },
    permissions: { push: true },
  };
  const client = fakeClient({
    request: async () => repo,
    paginate: async () => [repo, {
      ...repo, full_name: "x/other", name: "other",
      owner: { login: "x" },
    }],
  });
  const provider = createGitHubRepoContentProvider(client);
  eq("resolveRepository neutral shape", await provider.resolveRepository(
    "r", "o",
  ), {
    id: "o/r",
    name: "r",
    project: { id: "o", name: "o" },
    defaultBranch: "refs/heads/trunk",
    webUrl: "https://github.com/o/r",
    permissions: { push: true },
  });
  eq("listRepositories owner filter", (await provider.listRepositories(
    "o",
  )).map((item) => item.id), ["o/r"]);
}

{
  const client = fakeClient({
    paginate: async () => [
      { name: "main", commit: { sha: "m" }, protected: true },
      { name: "dev/a", commit: { sha: "a" }, protected: false },
    ],
    request: async () => ({ object: { sha: "tip" } }),
  });
  const provider = createGitHubRepoContentProvider(client);
  eq("listBranches filter + ADO-compatible refs",
    await provider.listBranches("o/r", null, { filter: "heads/dev" }),
    [{
      name: "refs/heads/dev/a",
      objectId: "a",
      isLocked: false,
      isProtected: false,
    }]);
  eq("getBranchTip", await provider.getBranchTip(
    "o/r", null, "refs/heads/dev/a",
  ), "tip");
  ok("tip path preserves nested branch",
    calls(client, "request").at(-1).args[1] ===
      "/repos/o/r/git/ref/heads/dev/a");
}

{
  const client = fakeClient({
    request: async (_method, _path, options) => ({
      ref: options.body.ref,
      object: { sha: options.body.sha },
    }),
  });
  eq("createBranch result", await createGitHubRepoContentProvider(
    client,
  ).createBranch("o/r", null, {
    branch: "spec/x", baseTip: "base",
  }), {
    branchRef: "refs/heads/spec/x",
    objectId: "base",
    update: {
      ref: "refs/heads/spec/x",
      object: { sha: "base" },
    },
  });
}

{
  const client = fakeClient({
    request: async (_method, path) =>
      path.includes("/contents/")
        ? path.endsWith("/docs") ? [
            { path: "docs/a.md", type: "file", sha: "a" },
            { path: "docs/sub", type: "dir", sha: "s" },
          ] : "# text"
        : {},
  });
  const provider = createGitHubRepoContentProvider(client);
  eq("getText", await provider.getText(
    "o/r", "/docs/a.md", "refs/heads/main",
  ), "# text");
  eq("listItems neutral shape", await provider.listItems(
    "o/r", null, { scopePath: "/docs", branch: "main" },
  ), [
    { path: "/docs/a.md", isFolder: false, objectId: "a", url: null },
    { path: "/docs/sub", isFolder: true, objectId: "s", url: null },
  ]);
}

{
  const client = fakeClient({
    paginate: async () => [{
      sha: "c1",
      html_url: "web",
      url: "api",
      commit: {
        message: "msg",
        author: { name: "A", date: "d1" },
        committer: { name: "C", date: "d2" },
      },
    }],
  });
  const provider = createGitHubRepoContentProvider(client);
  const commits = await provider.getFileCommits(
    "o/r", "/a.md", "main", 1,
  );
  eq("commit neutral shape", commits, [{
    commitId: "c1",
    author: { name: "A", date: "d1" },
    committer: { name: "C", date: "d2" },
    comment: "msg",
    changeCounts: null,
    remoteUrl: "web",
    url: "api",
  }]);
  eq("last author", await provider.getLastCommitAuthor(
    "o/r", "/a.md",
  ), "A");
}

{
  const client = fakeClient({
    request: async () => ({
      files: [
        { filename: "new.md", status: "added" },
        { filename: "gone.md", status: "removed" },
      ],
    }),
  });
  eq("diffBranches ADO-compatible changes",
    await createGitHubRepoContentProvider(client).diffBranches(
      "o/r", null, { base: "main", target: "spec/x" },
    ),
    {
      changes: [
        { item: { path: "/new.md", isFolder: false }, changeType: 1 },
        { item: { path: "/gone.md", isFolder: false }, changeType: 16 },
      ],
    });
}

{
  const sequence = [];
  const client = fakeClient({
    request: async (method, path, options) => {
      sequence.push([method, path, options?.body]);
      if (method === "GET") return { tree: { sha: "base-tree" } };
      if (path.endsWith("/blobs")) {
        return { sha: `blob-${sequence.length}` };
      }
      if (path.endsWith("/trees")) return { sha: "new-tree" };
      if (path.endsWith("/commits")) return { sha: "new-commit" };
      if (method === "PATCH") return { object: { sha: "new-commit" } };
      return {};
    },
  });
  const result = await createGitHubRepoContentProvider(client).pushFiles(
    "o/r", null, {
      branchRef: "refs/heads/spec/x",
      oldObjectId: "base",
      adds: [{ path: "/new.md", content: "new" }],
      edits: [{ path: "/old.md", content: "old" }],
      message: "publish",
    },
  );
  eq("atomic push commit id", result.commitId, "new-commit");
  const treeCall = sequence.find((row) => row[1].endsWith("/trees"));
  eq("tree includes both files on base tree", treeCall[2], {
    base_tree: "base-tree",
    tree: [
      { path: "new.md", mode: "100644", type: "blob", sha: "blob-2" },
      { path: "old.md", mode: "100644", type: "blob", sha: "blob-3" },
    ],
  });
  const refCall = sequence.find((row) => row[0] === "PATCH");
  eq("ref update is non-force", refCall[2], {
    sha: "new-commit", force: false,
  });
}

{
  const client = fakeClient({
    request: async (method, path) => {
      if (method === "GET") return { tree: { sha: "tree" } };
      if (path.endsWith("/blobs")) return { sha: "blob" };
      if (path.endsWith("/trees")) return { sha: "tree2" };
      if (path.endsWith("/commits")) return { sha: "commit" };
      if (method === "PATCH") {
        throw new GitHubApiError("reference update failed", {
          status: 422, body: { message: "not fast forward" },
        });
      }
      return {};
    },
  });
  const error = await rejects(
    "non-fast-forward ref update becomes 409 conflict",
    () => createGitHubRepoContentProvider(client).pushFiles(
      "o/r", null, {
        branchRef: "main",
        oldObjectId: "base",
        edits: [{ path: "/a.md", content: "x" }],
      },
    ),
    /already been updated/,
  );
  ok("converted conflict status", error.status === 409);
}
{
  const client = fakeClient({
    request: async (method, path) => {
      if (method === "GET") return { tree: { sha: "tree" } };
      if (path.endsWith("/blobs")) return { sha: "blob" };
      if (path.endsWith("/trees")) return { sha: "tree2" };
      if (path.endsWith("/commits")) return { sha: "commit" };
      if (method === "PATCH") {
        throw new GitHubApiError("protected branch", {
          status: 422,
          body: { message: "Protected branch update failed" },
        });
      }
      return {};
    },
  });
  const error = await rejects(
    "non-conflict 422 is not mislabeled as stale branch",
    () => createGitHubRepoContentProvider(client).pushFiles(
      "o/r", null, {
        branchRef: "main",
        oldObjectId: "base",
        edits: [{ path: "/a.md", content: "x" }],
      },
    ),
    /protected branch/,
  );
  ok("protected-branch status remains 422", error.status === 422);
}

console.log(`\ngithub-repo-content-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
