import { createAdoBlobProvider } from "./ado-blob-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }
async function* chunks(...values) { for (const value of values) yield value; }

function fakeConnection() {
  const calls = [];
  const gitApi = {
    getItemContent: async (...args) => {
      calls.push({ name: "getItemContent", args });
      return chunks(Buffer.from([1, 2]), new Uint8Array([3]), "x");
    },
  };
  return {
    conn: {
      getGitApi: async () => {
        calls.push({ name: "getGitApi", args: [] });
        return gitApi;
      },
    },
    calls,
  };
}
const last = (calls, name) => [...calls].reverse().find((c) => c.name === name);

{
  let threw = false; try { createAdoBlobProvider(null); } catch { threw = true; }
  ok("constructor requires connection", threw);
}
{
  let repo = "review-repo", project = "review-project";
  const fake = fakeConnection();
  const provider = createAdoBlobProvider(fake.conn, {
    getRepo: () => repo,
    getProject: () => project,
  });
  const bytes = await provider.getBlob(
    "/images/a.png", { version: "abc", versionType: 2 },
  );
  eq("getBlob concatenates binary/string chunks", [...bytes], [1, 2, 3, 120]);
  eq("getBlob exact SDK argument order/flags", last(
    fake.calls, "getItemContent",
  ).args, [
    "review-repo", "/images/a.png", "review-project",
    undefined, undefined, undefined, undefined,
    true,
    { version: "abc", versionType: 2 },
    undefined,
    true,
  ]);

  repo = "new-repo"; project = "new-project";
  await provider.getBlob("/images/b.png", "refs/heads/spec/x");
  eq("default coordinates/version are dynamic", last(
    fake.calls, "getItemContent",
  ).args.slice(0, 3), ["new-repo", "/images/b.png", "new-project"]);
  eq("bare branch normalized", last(
    fake.calls, "getItemContent",
  ).args[8], { version: "spec/x", versionType: 0 });

  await provider.getBlob("/images/c.png", "main", {
    repo: "explicit-repo",
    project: undefined,
  });
  eq("explicit repo + intentionally undefined project preserved", last(
    fake.calls, "getItemContent",
  ).args.slice(0, 3), [
    "explicit-repo", "/images/c.png", undefined,
  ]);
  eq("successful GitApi acquisition reused", fake.calls.filter(
    (call) => call.name === "getGitApi",
  ).length, 1);
}

{
  let attempts = 0;
  const gitApi = {
    getItemContent: async () => chunks("ok"),
  };
  const conn = {
    getGitApi: async () => {
      attempts++;
      if (attempts === 1) throw new Error("transient");
      return gitApi;
    },
  };
  const provider = createAdoBlobProvider(conn);
  let rejected = false;
  try { await provider.getBlob("/a.png", "main", { repo: "r" }); }
  catch (e) { rejected = /transient/.test(e.message); }
  ok("failed GitApi acquisition propagates", rejected);
  eq("failed acquisition is retryable",
    [...await provider.getBlob("/a.png", "main", { repo: "r" })],
    [...Buffer.from("ok")]);
  eq("retry performs second acquisition", attempts, 2);
}

console.log(`\nado-blob-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
