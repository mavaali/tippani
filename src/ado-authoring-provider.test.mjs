// Fake-SDK tests for AdoAuthoringProvider. Exact argument order matters:
// createPullRequest(request, repo, project), but
// updatePullRequest(update, repo, pullRequestId, project).
import { createAdoAuthoringProvider } from "./ado-authoring-provider.js";

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

function fakeConnection(overrides = {}) {
  const calls = [];
  const record = (name, result) => async (...args) => {
    calls.push({ name, args });
    if (typeof result === "function") return result(...args);
    return result;
  };
  const gitApi = {
    createPullRequest: record(
      "createPullRequest",
      { pullRequestId: 77, url: "https://ado/pr/77", isDraft: true },
    ),
    updatePullRequest: record(
      "updatePullRequest",
      { pullRequestId: 77, isDraft: false },
    ),
    ...overrides.gitApi,
  };
  const conn = {
    getGitApi: async () => {
      calls.push({ name: "getGitApi", args: [] });
      return gitApi;
    },
  };
  return { conn, gitApi, calls };
}
function lastCall(calls, name) {
  return [...calls].reverse().find((call) => call.name === name);
}
function countCalls(calls, name) {
  return calls.filter((call) => call.name === name).length;
}

{
  let threw = false;
  try { createAdoAuthoringProvider(null); } catch { threw = true; }
  ok("constructor requires a connection", threw);
}

{
  const fake = fakeConnection();
  const provider = createAdoAuthoringProvider(fake.conn);
  const request = {
    title: "Add spec",
    sourceRefName: "refs/heads/spec/x",
    targetRefName: "refs/heads/main",
    isDraft: true,
  };
  const result = await provider.createPullRequest("repo-id", "project-id", request);
  eq("createPullRequest returns SDK result", result, {
    pullRequestId: 77, url: "https://ado/pr/77", isDraft: true,
  });
  eq("createPullRequest exact SDK argument order", lastCall(
    fake.calls, "createPullRequest",
  ).args, [request, "repo-id", "project-id"]);
}

{
  const fake = fakeConnection();
  const provider = createAdoAuthoringProvider(fake.conn);
  const result = await provider.publishPullRequest(
    "repo-id", "project-id", 77,
  );
  eq("publishPullRequest returns SDK result", result, {
    pullRequestId: 77, isDraft: false,
  });
  eq("publishPullRequest exact SDK argument order", lastCall(
    fake.calls, "updatePullRequest",
  ).args, [{ isDraft: false }, "repo-id", 77, "project-id"]);
}

// One successful API acquisition is reused across both operations.
{
  const fake = fakeConnection();
  const provider = createAdoAuthoringProvider(fake.conn);
  await provider.createPullRequest("r", "p", { title: "t" });
  await provider.publishPullRequest("r", "p", 1);
  eq("successful GitApi acquisition reused", countCalls(
    fake.calls, "getGitApi",
  ), 1);
}

// Failed acquisition is not cached forever.
{
  let attempts = 0;
  const gitApi = {
    createPullRequest: async () => ({ pullRequestId: 1 }),
  };
  const conn = {
    getGitApi: async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return gitApi;
    },
  };
  const provider = createAdoAuthoringProvider(conn);
  await rejects(
    "failed GitApi acquisition propagates",
    () => provider.createPullRequest("r", "p", {}),
    /transient/,
  );
  eq("failed acquisition is retryable",
    await provider.createPullRequest("r", "p", {}),
    { pullRequestId: 1 },
  );
  eq("retry performs second acquisition", attempts, 2);
}

console.log(`\nado-authoring-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
