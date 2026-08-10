import { createGitHubBlobProvider } from "./github-blob-provider.js";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error("  FAIL: " + name); } }
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b)); }

{
  let threw = false; try { createGitHubBlobProvider(null); } catch { threw = true; }
  ok("constructor requires client", threw);
}
{
  const calls = [];
  let dynamicOwner = "o", dynamicRepo = "r";
  const client = {
    request: async (...args) => {
      calls.push(args);
      return Buffer.from([1, 2, 3]);
    },
  };
  const provider = createGitHubBlobProvider(client, {
    getOwner: () => dynamicOwner,
    getRepo: () => dynamicRepo,
  });
  eq("bound blob bytes", [...await provider.getBlob(
    "/images/a.png", "refs/heads/spec/x",
  )], [1, 2, 3]);
  eq("bound raw request", calls[0], [
    "GET",
    "/repos/o/r/contents/images/a.png",
    {
      query: { ref: "spec/x" },
      accept: "application/vnd.github.raw+json",
      responseType: "buffer",
    },
  ]);
  await provider.getBlob("/b.png", "main", { repo: "x/other" });
  ok("explicit full repo override", calls[1][1] ===
    "/repos/x/other/contents/b.png");
  dynamicOwner = "contributor";
  await provider.getBlob("/c.png", "main");
  ok("dynamic bound repo follows fork head", calls[2][1] ===
    "/repos/contributor/r/contents/c.png");
}

console.log(`\ngithub-blob-provider.test: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
