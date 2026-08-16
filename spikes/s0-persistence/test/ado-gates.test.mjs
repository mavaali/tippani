// Offline correctness + detection for the live provider gates against an
// in-memory fake of the Azure DevOps Git REST API (branch tip as CAS token,
// oldObjectId ref precondition, commit history, ref delete). Proves the ADO
// transport + the shared gates without a live org; a live run confirms it.

import assert from "node:assert/strict";
import { AdoGitStore } from "../src/adapters/ado-git-store.mjs";
import { ONEDRIVE_GATE_IMPLEMENTATIONS } from "../src/onedrive-gates.mjs";

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

const ZERO = "0000000000000000000000000000000000000000";

function fakeAdoRepo() {
  let tip = null;                 // branch tip commit id (CAS token)
  let seq = 0;
  const files = new Map();        // path -> content (current branch state)
  const history = [];             // { commitId, snapshot: Map }
  const okJson = (obj) => ({ ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) });
  return {
    async fetch(url, opts) {
      const u = new URL(url);
      const p = u.pathname;
      const method = opts.method;

      if (p.endsWith("/refs") && method === "GET") {
        return okJson({ value: tip ? [{ name: `refs/heads/${u.searchParams.get("filter").replace("heads/", "")}`, objectId: tip }] : [] });
      }
      if (p.endsWith("/refs") && method === "POST") { // delete branch
        tip = null; files.clear();
        return okJson({ value: [{ success: true }] });
      }
      if (p.endsWith("/items") && method === "GET") {
        const single = u.searchParams.get("path");
        if (single) {
          const key = single.replace(/^\//, "");
          const vt = u.searchParams.get("versionDescriptor.versionType");
          if (vt === "commit") {
            const entry = history.find((h) => h.commitId === u.searchParams.get("versionDescriptor.version"));
            const content = entry?.snapshot.get(key);
            return content === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, text: async () => content };
          }
          const content = files.get(key);
          return content === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, text: async () => content };
        }
        // list
        return okJson({ value: [...files.keys()].map((k) => ({ path: `/${k}`, isFolder: false })) });
      }
      if (p.endsWith("/commits") && method === "GET") {
        const item = u.searchParams.get("searchCriteria.itemPath").replace(/^\//, "");
        const value = [...history].reverse().filter((h) => h.snapshot.has(item)).map((h) => ({ commitId: h.commitId }));
        return okJson({ value });
      }
      if (p.endsWith("/pushes") && method === "POST") {
        const push = JSON.parse(opts.body);
        const old = push.refUpdates[0].oldObjectId;
        const expected = tip ?? ZERO;
        if (old !== expected) {
          return { ok: false, status: 409, text: async () => "TF401028: updated by another client", json: async () => ({}) };
        }
        for (const change of push.commits[0].changes) {
          const key = change.item.path.replace(/^\//, "");
          if (change.changeType === "delete") files.delete(key);
          else files.set(key, change.newContent.content);
        }
        tip = `c${++seq}`;
        history.push({ commitId: tip, snapshot: new Map(files) });
        return { ok: true, status: 201, json: async () => ({ refUpdates: [{ newObjectId: tip }], commits: [{ commitId: tip }] }) };
      }
      return { ok: false, status: 400, text: async () => "", json: async () => ({}) };
    },
  };
}

function liveContext(scenarioId) {
  const repo = fakeAdoRepo();
  const runId = `s0-ado-gate-${scenarioId.toLowerCase()}`;
  return {
    config: { runId, backingPath: "ado", dryRun: false },
    scenario: { id: scenarioId },
    createStore: () => new AdoGitStore({
      dryRun: false, org: "O", project: "P", repo: "R", runId,
      adoToken: "syn-token", fetchImpl: (u, o) => repo.fetch(u, o),
    }),
  };
}

for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
  await check(`gate ${id} passes against the fake ADO repo`, async () => {
    const result = await impl(liveContext(id));
    assert.ok(result && result.evidence, `${id} must return evidence, got ${JSON.stringify(result)}`);
    assert.ok(!result.blocked, `${id} must not be blocked in a live ADO context`);
  });
}

await check("gates report Blocked outside a live provider context", async () => {
  for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
    const result = await impl({ config: { backingPath: "local", dryRun: false }, scenario: { id } });
    assert.ok(result.blocked, `${id} must be Blocked on a local backing path`);
  }
});

console.log(`s0-ado-gates: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
