import {
  createGitHubAuthoringProvider,
} from "./github-authoring-provider.js";

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
function fakeClient({ request, graphql } = {}) {
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
  };
}

{
  let threw = false;
  try { createGitHubAuthoringProvider(null); } catch { threw = true; }
  ok("constructor requires client", threw);
}

{
  const client = fakeClient({
    request: async () => ({
      number: 42,
      node_id: "PR_node",
      html_url: "https://github.com/o/r/pull/42",
      draft: true,
    }),
  });
  const result = await createGitHubAuthoringProvider(
    client,
  ).createPullRequest("o/r", null, {
    title: " Add spec ",
    description: "Body",
    sourceRefName: "refs/heads/spec/x",
    targetRefName: "refs/heads/main",
    isDraft: true,
  });
  eq("create maps pull request", result, {
    pullRequestId: 42,
    url: "https://github.com/o/r/pull/42",
    isDraft: true,
  });
  eq("create uses GitHub pulls endpoint", client.calls[0].args.slice(0, 2), [
    "POST", "/repos/o/r/pulls",
  ]);
  eq("create maps neutral request body", client.calls[0].args[2].body, {
    title: "Add spec",
    body: "Body",
    head: "spec/x",
    base: "main",
    draft: true,
  });
}

{
  const client = fakeClient({
    request: async () => ({
      number: 42,
      node_id: "PR_node",
      html_url: "https://github.com/o/r/pull/42",
      draft: true,
    }),
    graphql: async () => ({
      markPullRequestReadyForReview: {
        pullRequest: {
          id: "PR_node",
          number: 42,
          isDraft: false,
          url: "https://github.com/o/r/pull/42",
        },
      },
    }),
  });
  const result = await createGitHubAuthoringProvider(
    client,
  ).publishPullRequest("r", "o", 42);
  eq("publish maps ready pull request", result, {
    pullRequestId: 42,
    url: "https://github.com/o/r/pull/42",
    isDraft: false,
  });
  eq("publish reads pull request node id", client.calls[0].args, [
    "GET", "/repos/o/r/pulls/42",
  ]);
  eq("publish sends GraphQL node id", client.calls[1].args[1], {
    pullRequestId: "PR_node",
  });
}

{
  const client = fakeClient({
    request: async () => ({
      number: 9,
      node_id: "PR_9",
      html_url: "https://github.com/o/r/pull/9",
      draft: false,
    }),
  });
  const result = await createGitHubAuthoringProvider(
    client,
  ).publishPullRequest("o/r", null, 9);
  ok("publishing an already-ready PR is idempotent",
    result.isDraft === false &&
    !client.calls.some((call) => call.name === "graphql"));
}

{
  const provider = createGitHubAuthoringProvider(fakeClient());
  await rejects("create requires title",
    () => provider.createPullRequest("o/r", null, {
      sourceBranch: "a", targetBranch: "b",
    }), /title/);
  await rejects("create requires distinct branches",
    () => provider.createPullRequest("o/r", null, {
      title: "t", sourceBranch: "same", targetBranch: "same",
    }), /different/);
}

console.log(
  `\ngithub-authoring-provider.test: ${pass} passed, ${fail} failed`,
);
process.exit(fail === 0 ? 0 : 1);
