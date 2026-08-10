import {
  createGitHubClient,
  GitHubApiError,
  githubPath,
} from "./github-client.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

function response(body, {
  status = 200,
  statusText = "OK",
  headers = {},
} = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, statusText, headers });
}

{
  let threw = false; try { createGitHubClient({}); } catch { threw = true; }
  ok("token required", threw);
}
eq("githubPath encodes each segment", githubPath("repos", "my org", "a/b"), "/repos/my%20org/a/b");

{
  const calls = [];
  const client = createGitHubClient({
    token: "secret",
    apiBase: "https://example.test/",
    fetchImpl: async (...args) => {
      calls.push(args);
      return response({ ok: true });
    },
  });
  eq("request returns JSON", await client.request("POST", "/x", {
    query: { q: "a b", skip: null },
    body: { value: 1 },
  }), { ok: true });
  const [url, init] = calls[0];
  eq("query encoded", url, "https://example.test/x?q=a+b");
  ok("authorization header set", init.headers.Authorization === "Bearer secret");
  ok("stable API version set", init.headers["X-GitHub-Api-Version"] === "2022-11-28");
  eq("JSON body sent", JSON.parse(init.body), { value: 1 });
}

{
  const client = createGitHubClient({
    token: "t",
    fetchImpl: async () => response({ message: "nope" }, {
      status: 403, statusText: "Forbidden",
    }),
  });
  let error = null;
  try { await client.request("GET", "/forbidden"); } catch (e) { error = e; }
  ok("non-2xx throws GitHubApiError", error instanceof GitHubApiError);
  ok("error carries status/body", error.status === 403 && error.body.message === "nope");
}

{
  const client = createGitHubClient({
    token: "t",
    fetchImpl: async () => response({
      data: { viewer: { login: "me" } },
    }),
  });
  eq("graphql returns data", await client.graphql("query { viewer { login } }"), {
    viewer: { login: "me" },
  });
}

{
  const client = createGitHubClient({
    token: "t",
    fetchImpl: async () => response({
      data: null,
      errors: [{ message: "bad query" }],
    }),
  });
  let error = null;
  try { await client.graphql("bad"); } catch (e) { error = e; }
  ok("graphql errors throw", error instanceof GitHubApiError && /bad query/.test(error.message));
}

{
  const calls = [];
  const client = createGitHubClient({
    token: "t",
    fetchImpl: async (url) => {
      calls.push(url);
      const page = Number(new URL(url).searchParams.get("page"));
      return response(page === 1 ? [1, 2] : [3]);
    },
  });
  eq("paginate joins pages until short batch", await client.paginate("/rows", {
    perPage: 2,
  }), [1, 2, 3]);
  ok("paginate fetched two pages", calls.length === 2);
}

{
  const bytes = Uint8Array.from([1, 2, 3]);
  const client = createGitHubClient({
    token: "t",
    fetchImpl: async () => new Response(bytes),
  });
  eq("buffer response", [...await client.request("GET", "/raw", {
    responseType: "buffer",
  })], [1, 2, 3]);
}

console.log(`\ngithub-client.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
