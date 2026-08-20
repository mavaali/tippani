// Offline correctness + detection for the live provider gates against an
// in-memory fake of the GitHub REST API (Contents API blob-sha CAS, branch
// refs, commit history). Proves the GitHub transport + the shared gates without
// a live repo; a live run confirms it.

import assert from "node:assert/strict";
import { GitHubRepoStore } from "../src/adapters/github-repo-store.mjs";
import { ONEDRIVE_GATE_IMPLEMENTATIONS } from "../src/onedrive-gates.mjs";

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

function fakeGitHubRepo() {
  const files = new Map();        // path -> { blobSha, content }
  const history = new Map();      // path -> [ { commitSha, content } ]
  let seq = 0;
  let tip = "base";               // current branch tip commit sha
  const okJson = (obj, status = 200) => ({ ok: true, status, json: async () => obj, text: async () => JSON.stringify(obj) });
  return {
    async fetch(url, opts) {
      const u = new URL(url);
      const p = u.pathname;
      const method = opts.method;

      if (/\/repos\/[^/]+\/[^/]+$/.test(p) && method === "GET") return okJson({ default_branch: "main" });
      if (p.endsWith("/git/ref/heads/main") && method === "GET") return okJson({ object: { sha: "base" } });
      if (/\/git\/ref\/heads\//.test(p) && method === "GET") return okJson({ object: { sha: tip } });
      if (p.endsWith("/git/refs") && method === "POST") return okJson({ ref: "created" }, 201);
      if (/\/git\/refs\/heads\//.test(p) && method === "DELETE") return { ok: true, status: 204, json: async () => ({}) };

      // contents
      const contents = p.match(/\/contents\/(.*)$/);
      if (contents) {
        const rel = decodeURIComponent(contents[1]);
        if (method === "GET" && rel === "") { // list
          const value = [...files.keys()].map((k) => ({ name: k, path: k, type: "file" }));
          return okJson(value);
        }
        if (method === "GET") {
          const ref = u.searchParams.get("ref");
          if (ref && ref !== tip && ref !== "base") { // read at an older commit
            const entry = (history.get(rel) || []).find((h) => h.commitSha === ref);
            return entry ? okJson({ content: b64(entry.content), sha: ref }) : { ok: false, status: 404 };
          }
          const file = files.get(rel);
          return file ? okJson({ content: b64(file.content), sha: file.blobSha }) : { ok: false, status: 404 };
        }
        if (method === "PUT") {
          const body = JSON.parse(opts.body);
          const content = Buffer.from(body.content, "base64").toString("utf8");
          const existing = files.get(rel);
          if (body.sha === undefined && existing) return { ok: false, status: 422, json: async () => ({}) };
          if (body.sha !== undefined && existing && body.sha !== existing.blobSha) return { ok: false, status: 409, json: async () => ({}) };
          const blobSha = `b${++seq}`;
          const commitSha = `c${seq}`;
          files.set(rel, { blobSha, content });
          if (!history.has(rel)) history.set(rel, []);
          history.get(rel).push({ commitSha, content });
          tip = commitSha;
          return okJson({ content: { sha: blobSha }, commit: { sha: commitSha } }, existing ? 200 : 201);
        }
        if (method === "DELETE") { files.delete(rel); tip = `c${++seq}`; return okJson({ commit: { sha: tip } }); }
      }
      // commits
      if (p.endsWith("/commits") && method === "GET") {
        const item = decodeURIComponent(u.searchParams.get("path"));
        const value = [...(history.get(item) || [])].reverse().map((h) => ({ sha: h.commitSha }));
        return okJson(value);
      }
      return { ok: false, status: 400, json: async () => ({}), text: async () => "" };
    },
  };
}

function liveContext(scenarioId) {
  const repo = fakeGitHubRepo();
  const runId = `s0-gh-gate-${scenarioId.toLowerCase()}`;
  return {
    config: { runId, backingPath: "github", dryRun: false },
    scenario: { id: scenarioId },
    createStore: () => new GitHubRepoStore({
      dryRun: false, owner: "O", repo: "R", runId,
      githubToken: "syn-token", fetchImpl: (u, o) => repo.fetch(u, o),
    }),
  };
}

for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
  await check(`gate ${id} passes against the fake GitHub repo`, async () => {
    const result = await impl(liveContext(id));
    assert.ok(result && result.evidence, `${id} must return evidence, got ${JSON.stringify(result)}`);
    assert.ok(!result.blocked, `${id} must not be blocked in a live GitHub context`);
  });
}

await check("gates report Blocked outside a live provider context", async () => {
  for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
    const result = await impl({ config: { backingPath: "local", dryRun: false }, scenario: { id } });
    assert.ok(result.blocked, `${id} must be Blocked on a local backing path`);
  }
});

console.log(`s0-github-gates: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
