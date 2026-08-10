// Fake-SDK tests for AdoRepoContentProvider. Assertions focus on exact
// azure-devops-node-api argument ordering and the behavior that must remain
// backend-neutral for a future GitHub provider.
import { ZERO_OBJECT_ID } from "./ado-refs.js";
import { createAdoRepoContentProvider } from "./ado-repo-content-provider.js";

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
  let error = null;
  try { await fn(); } catch (e) { error = e; }
  ok(name, !!error && (!pattern || pattern.test(error.message)));
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
    getRepository: record("getRepository", {
      id: "repo-id", name: "Repo", project: { id: "project-id" },
    }),
    getRepositories: record("getRepositories", []),
    getRefs: record(
      "getRefs",
      [{ name: "refs/heads/main", objectId: "tip-main" }],
    ),
    updateRefs: record(
      "updateRefs",
      [{ success: true, name: "refs/heads/spec/x" }],
    ),
    getItemContent: record("getItemContent", chunks("# spec")),
    getItems: record("getItems", []),
    getCommits: record("getCommits", []),
    getCommitDiffs: record("getCommitDiffs", { changes: [] }),
    createPush: record(
      "createPush",
      { commits: [{ commitId: "commit-1" }] },
    ),
    ...overrides.gitApi,
  };
  const conn = {
    getGitApi: async () => {
      calls.push({ name: "getGitApi", args: [] });
      return gitApi;
    },
    getCoreApi: async () => {
      calls.push({ name: "getCoreApi", args: [] });
      return {
        getProjects: async (...args) => {
          calls.push({ name: "getProjects", args });
          return [{ id: "p1", name: "Project One" }];
        },
      };
    },
  };
  return { conn, gitApi, calls };
}
function lastCall(calls, name) {
  return [...calls].reverse().find((c) => c.name === name);
}
function countCalls(calls, name) {
  return calls.filter((c) => c.name === name).length;
}

// --- construction + repository resolution ---------------------------------
{
  let threw = false;
  try { createAdoRepoContentProvider(null); } catch { threw = true; }
  ok("constructor requires a connection", threw);
}
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("listProjects returns Core API projects", await provider.listProjects(), [
    { id: "p1", name: "Project One" },
  ]);
  eq("listProjects exact SDK args", lastCall(
    fake.calls, "getProjects",
  ).args, []);
  await provider.listProjects();
  eq("successful CoreApi acquisition reused", countCalls(
    fake.calls, "getCoreApi",
  ), 1);
}
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  const repo = await provider.resolveRepository("Repo Name", "Project Name");
  eq("resolveRepository returns SDK result", repo, {
    id: "repo-id", name: "Repo", project: { id: "project-id" },
  });
  eq("resolveRepository SDK order", lastCall(fake.calls, "getRepository").args, [
    "Repo Name", "Project Name",
  ]);
}
{
  const fake = fakeConnection({
    gitApi: { getRepositories: async (...args) => {
      fake.calls.push({ name: "getRepositories", args });
      return null;
    } },
  });
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("listRepositories normalizes null -> []", await provider.listRepositories("P"), []);
  eq("listRepositories SDK order", lastCall(fake.calls, "getRepositories").args, ["P"]);
}

// --- branches ---------------------------------------------------------------
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  await provider.listBranches("r", "p", {
    filter: "heads/",
    includeLinks: true,
    includeStatuses: true,
    includeMyBranches: true,
  });
  eq("listBranches SDK order/options", lastCall(fake.calls, "getRefs").args, [
    "r", "p", "heads/", true, true, true,
  ]);
}
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("getBranchTip normalizes bare branch", await provider.getBranchTip("r", "p", "main"), "tip-main");
  eq("getBranchTip exact filter", lastCall(fake.calls, "getRefs").args, [
    "r", "p", "heads/main", false, false, false,
  ]);
}
{
  const fake = fakeConnection({ gitApi: { getRefs: async () => [] } });
  await rejects(
    "getBranchTip missing ref throws",
    () => createAdoRepoContentProvider(fake.conn).getBranchTip("r", "p", "missing"),
    /Branch ref not found/,
  );
}
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  const result = await provider.createBranch("r", "p", {
    branch: "spec/x", baseTip: "abc123",
  });
  eq("createBranch returns normalized ref + base tip", [
    result.branchRef, result.objectId,
  ], ["refs/heads/spec/x", "abc123"]);
  eq("createBranch updateRefs payload/order", lastCall(fake.calls, "updateRefs").args, [
    [{
      name: "refs/heads/spec/x",
      oldObjectId: ZERO_OBJECT_ID,
      newObjectId: "abc123",
    }],
    "r",
    "p",
  ]);
}
{
  const fake = fakeConnection({
    gitApi: {
      updateRefs: async () => [{
        success: false, updateStatus: "writePermissionRequired",
      }],
    },
  });
  await rejects(
    "createBranch rejected update throws actionable status",
    () => createAdoRepoContentProvider(fake.conn).createBranch("r", "p", {
      branch: "x", baseTip: "base",
    }),
    /writePermissionRequired/,
  );
}
{
  const fake = fakeConnection({
    gitApi: {
      updateRefs: async () => ({
        success: true, name: "refs/heads/x",
      }),
    },
  });
  const result = await createAdoRepoContentProvider(fake.conn).createBranch(
    "r", "p", { branch: "x", baseTip: "base" },
  );
  ok("createBranch tolerates non-array SDK response", result.update.success === true);
}

// --- arbitrary content + item listing --------------------------------------
{
  const fake = fakeConnection({
    gitApi: {
      getItemContent: async (...args) => {
        fake.calls.push({ name: "getItemContent", args });
        return chunks(Buffer.from("# "), "Hello");
      },
    },
  });
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("getText concatenates stream", await provider.getText(
    "r", "/docs/a.md", "spec/x", "p",
  ), "# Hello");
  eq("getText SDK order/version", lastCall(fake.calls, "getItemContent").args, [
    "r", "/docs/a.md", "p",
    undefined, undefined, undefined, undefined, undefined,
    { version: "spec/x", versionType: 0 },
  ]);
}
{
  const fake = fakeConnection({
    gitApi: {
      getItems: async (...args) => {
        fake.calls.push({ name: "getItems", args });
        return null;
      },
    },
  });
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("listItems normalizes null -> []", await provider.listItems(
    "r", "p", { scopePath: "/docs", branch: "b", recursionLevel: 1 },
  ), []);
  eq("listItems SDK order", lastCall(fake.calls, "getItems").args, [
    "r", "p", "/docs", 1,
    false, false, false, false,
    { version: "b", versionType: 0 },
  ]);
}

// --- commit history ---------------------------------------------------------
{
  const commits = [{
    commitId: "c1", author: { name: "Author" },
  }];
  const fake = fakeConnection({
    gitApi: {
      getCommits: async (...args) => {
        fake.calls.push({ name: "getCommits", args });
        return commits;
      },
    },
  });
  const provider = createAdoRepoContentProvider(fake.conn);
  eq("getFileCommits returns SDK records", await provider.getFileCommits(
    "r", "/a.md", "b", 12, "p",
  ), commits);
  eq("getFileCommits SDK order", lastCall(fake.calls, "getCommits").args, [
    "r",
    { itemPath: "/a.md", itemVersion: { version: "b", versionType: 0 } },
    "p", 0, 12,
  ]);
  eq("getLastCommitAuthor prefers author", await provider.getLastCommitAuthor(
    "r", "/a.md", "b", "p",
  ), "Author");
}
{
  const fake = fakeConnection({
    gitApi: {
      getCommits: async () => [{
        committer: { name: "Committer" },
      }],
    },
  });
  eq("getLastCommitAuthor falls back to committer",
    await createAdoRepoContentProvider(fake.conn).getLastCommitAuthor(
      "r", "/a.md",
    ),
    "Committer",
  );
}
{
  const fake = fakeConnection({
    gitApi: { getCommits: async () => { throw new Error("down"); } },
  });
  eq("getLastCommitAuthor best-effort failure -> empty",
    await createAdoRepoContentProvider(fake.conn).getLastCommitAuthor(
      "r", "/a.md",
    ),
    "",
  );
}

// --- branch diff ------------------------------------------------------------
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  await provider.diffBranches("r", "p", {
    base: "main", target: "spec/x", top: 123,
  });
  eq("diffBranches SDK order/common-commit descriptors",
    lastCall(fake.calls, "getCommitDiffs").args,
    [
      "r", "p", true, 123, 0,
      { version: "main", versionType: 0 },
      { version: "spec/x", versionType: 0 },
    ],
  );
}

// --- atomic multi-file push -------------------------------------------------
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  const result = await provider.pushFiles("r", "p", {
    branchRef: "refs/heads/spec/x",
    oldObjectId: "base",
    adds: [{ path: "/new.md", content: "# new" }],
    edits: [{ path: "/old.md", content: "# edit" }],
    message: "Publish specs",
  });
  eq("pushFiles returns commit id", result.commitId, "commit-1");
  const args = lastCall(fake.calls, "createPush").args;
  eq("pushFiles SDK coordinates", args.slice(1), ["r", "p"]);
  eq("pushFiles one ref update", args[0].refUpdates, [{
    name: "refs/heads/spec/x", oldObjectId: "base",
  }]);
  eq("pushFiles carries add+edit in one commit", args[0].commits[0].changes.map(
    (change) => [change.changeType, change.item.path],
  ), [[1, "/new.md"], [2, "/old.md"]]);
}
{
  const fake = fakeConnection({
    gitApi: {
      createPush: async (...args) => {
        fake.calls.push({ name: "createPush", args });
        return { refUpdates: [{ newObjectId: "new-tip" }] };
      },
    },
  });
  const result = await createAdoRepoContentProvider(fake.conn).pushFiles(
    "r", "p", {
      branchRef: "refs/heads/x",
      oldObjectId: "base",
      edits: [{ path: "/a.md", content: "x" }],
      message: "m",
      label: "push staged content",
    },
  );
  eq("pushFiles falls back to refUpdates newObjectId", result.commitId, "new-tip");
}

// A provider instance reuses one successfully-acquired GitApi across methods
// (important for bulk branch/commit listings), while a failed acquisition is
// not cached and can recover on the next call.
{
  const fake = fakeConnection();
  const provider = createAdoRepoContentProvider(fake.conn);
  await provider.listRepositories("p");
  await provider.listBranches("r", "p");
  await provider.getFileCommits("r", "/a.md");
  eq("successful GitApi acquisition is reused across methods",
    countCalls(fake.calls, "getGitApi"), 1);
}
{
  let attempts = 0;
  const gitApi = {
    getRepositories: async () => [],
  };
  const conn = {
    getGitApi: async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return gitApi;
    },
  };
  const provider = createAdoRepoContentProvider(conn);
  await rejects(
    "failed GitApi acquisition propagates",
    () => provider.listRepositories("p"),
    /transient/,
  );
  eq("failed GitApi acquisition is retryable",
    await provider.listRepositories("p"), []);
  eq("retry performed a second acquisition", attempts, 2);
}

console.log(`\nado-repo-content-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
