import { createGitHubSearchProvider } from "./github-search-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.error("  FAIL: " + name); }
}
function eq(name, actual, expected) {
  ok(name + ` (got ${JSON.stringify(actual)})`,
    JSON.stringify(actual) === JSON.stringify(expected));
}

function fakeClient() {
  const calls = [];
  const pr = {
    number: 12,
    title: "Portable discovery",
    url: "https://github.com/acme/docs/pull/12",
    state: "OPEN",
    isDraft: true,
    mergedAt: null,
    createdAt: "2026-08-10T00:00:00Z",
    headRefName: "spec/search",
    baseRefName: "main",
    author: { login: "octo" },
    repository: { name: "docs", owner: { login: "acme" } },
  };
  return {
    calls,
    client: {
      request: async (method, path, options = {}) => {
        calls.push({ kind: "request", method, path, options });
        if (path === "/users/acme") {
          return { login: "acme", type: "Organization" };
        }
        if (path === "/users/octo") {
          return { login: "octo", type: "User" };
        }
        if (path === "/search/code") {
          return {
            items: [
              {
                path: "specs/a.md",
                html_url: "https://github.com/octo/docs/blob/main/specs/a.md",
                repository: {
                  full_name: "octo/docs",
                  name: "docs",
                  default_branch: "trunk",
                  owner: { login: "octo" },
                },
              },
              {
                path: "specs/a.md",
                repository: { full_name: "octo/docs", name: "docs" },
              },
              {
                path: "img/a.png",
                repository: { full_name: "octo/docs", name: "docs" },
              },
            ],
          };
        }
        throw new Error(`Unexpected request ${method} ${path}`);
      },
      graphql: async (_document, variables) => {
        calls.push({ kind: "graphql", variables });
        return {
          search: {
            nodes: [pr],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      },
    },
  };
}

{
  let threw = false;
  try { createGitHubSearchProvider(null, { owner: "acme" }); } catch { threw = true; }
  ok("constructor requires client", threw);
}
{
  let threw = false;
  try { createGitHubSearchProvider({}, {}); } catch { threw = true; }
  ok("constructor requires owner", threw);
}
{
  const f = fakeClient();
  const provider = createGitHubSearchProvider(f.client, { owner: "acme" });
  eq("PR search projects neutral summaries",
    await provider.searchPullRequests({
      status: 1,
      creatorId: "octo",
      targetRefName: "refs/heads/main",
    }, 25),
    [{
      id: 12,
      title: "Portable discovery",
      author: "octo",
      status: 1,
      isDraft: true,
      source: "spec/search",
      target: "main",
      repo: "docs",
      project: "acme",
      created: "2026-08-10T00:00:00Z",
      webUrl: "https://github.com/acme/docs/pull/12",
    }]);
  const query = f.calls.find((call) => call.kind === "graphql").variables.query;
  eq("PR search uses owner, state, creator, and base qualifiers", query,
    "is:pr org:acme is:open author:octo base:main");
}
{
  const f = fakeClient();
  const provider = createGitHubSearchProvider(f.client, { owner: "acme" });
  const results = await provider.searchPullRequests({
    status: 4,
    reviewerId: "octo",
  }, 50);
  eq("review queue unions and dedupes requested/submitted review matches",
    results.length, 1);
  eq("review queue issues both reviewer searches",
    f.calls.filter((call) => call.kind === "graphql")
      .map((call) => call.variables.query),
    [
      "is:pr org:acme review-requested:octo",
      "is:pr org:acme reviewed-by:octo",
    ]);
}
{
  const f = fakeClient();
  const provider = createGitHubSearchProvider(f.client, { owner: "acme" });
  eq("code search returns neutral filtered/deduped hits",
    await provider.searchSpecs("octo", "design notes", 20),
    [{
      path: "/specs/a.md",
      repoId: "octo/docs",
      repoName: "docs",
      project: "octo",
      branch: "trunk",
      url: "https://github.com/octo/docs/blob/main/specs/a.md",
    }]);
  const call = f.calls.find((entry) =>
    entry.kind === "request" && entry.path === "/search/code");
  eq("code search query scopes Markdown to the selected owner",
    call.options.query, {
      q: "design notes extension:md user:octo",
      per_page: 20,
      page: 1,
    });
}
{
  const calls = [];
  const corpus = Array.from({ length: 150 }, (_, index) => ({
    path: index < 3 ? `images/${index}.png` : `specs/${index}.md`,
    repository: {
      full_name: "octo/docs",
      name: "docs",
      default_branch: "main",
      owner: { login: "octo" },
    },
  }));
  const client = {
    request: async (_method, path, options = {}) => {
      if (path === "/users/octo") {
        return { login: "octo", type: "User" };
      }
      if (path === "/search/code") {
        calls.push(options.query);
        const start = (options.query.page - 1) * options.query.per_page;
        return {
          items: corpus.slice(start, start + options.query.per_page),
        };
      }
      throw new Error(`Unexpected path ${path}`);
    },
  };
  const provider = createGitHubSearchProvider(client, { owner: "octo" });
  const results = await provider.searchSpecs("octo", "design", 100);
  eq("code search fills filtered result limit across stable pages",
    results.length, 100);
  eq("code search keeps page size stable",
    calls.map((call) => [call.page, call.per_page]),
    [[1, 100], [2, 100]]);
}

console.log(`\ngithub-search-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
