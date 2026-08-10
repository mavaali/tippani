import { createAdoSearchProvider } from "./ado-search-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

function fakeConnection() {
  const calls = [];
  const rest = {
    get: async (...args) => {
      calls.push({ name: "get", args });
      return { result: { value: [{ pullRequestId: 1 }] } };
    },
    create: async (...args) => {
      calls.push({ name: "create", args });
      return { result: { results: [{ path: "/a.md" }] } };
    },
  };
  return { conn: { rest }, calls };
}
const last = (calls, name) => [...calls].reverse().find((c) => c.name === name);

{
  let threw = false; try { createAdoSearchProvider({}); } catch { threw = true; }
  ok("constructor requires REST connection", threw);
}
{
  const f = fakeConnection();
  const p = createAdoSearchProvider(f.conn, { org: "https://dev.azure.com/acme/" });
  eq("PR search returns value", await p.searchPullRequests({
    status: 3,
    creatorId: "creator",
    reviewerId: "reviewer",
    targetRefName: "refs/heads/main",
  }, 25), [{ pullRequestId: 1 }]);
  const url = new URL(last(f.calls, "get").args[0]);
  eq("PR search host/path", url.origin + url.pathname,
    "https://dev.azure.com/acme/_apis/git/pullrequests");
  eq("PR search params", Object.fromEntries(url.searchParams), {
    "api-version": "7.1",
    "$top": "25",
    "searchCriteria.status": "completed",
    "searchCriteria.creatorId": "creator",
    "searchCriteria.reviewerId": "reviewer",
    "searchCriteria.targetRefName": "refs/heads/main",
  });
}
{
  const f = fakeConnection();
  const p = createAdoSearchProvider(f.conn, { org: "https://dev.azure.com/acme" });
  eq("unknown PR status defaults active",
    await p.searchPullRequests({ status: 99 }), [{ pullRequestId: 1 }]);
  const url = new URL(last(f.calls, "get").args[0]);
  eq("unknown status param", url.searchParams.get("searchCriteria.status"), "active");
}
{
  const f = fakeConnection();
  const p = createAdoSearchProvider(f.conn, { org: "https://dev.azure.com/acme" });
  eq("code search returns result object", await p.searchSpecs(
    "Power BI", "query text", 100,
  ), { results: [{ path: "/a.md" }] });
  const [url, body] = last(f.calls, "create").args;
  eq("code search sibling host URL", url,
    "https://almsearch.dev.azure.com/acme/_apis/search/codesearchresults?api-version=7.1");
  eq("code search body", body, {
    searchText: "query text ext:md",
    "$skip": 0,
    "$top": 100,
    filters: { Project: ["Power BI"] },
  });
}

console.log(`\nado-search-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
