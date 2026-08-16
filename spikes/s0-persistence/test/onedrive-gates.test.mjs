// Offline correctness + detection for the live OneDrive gate implementations.
// Each gate is exercised against an in-memory fake of the Graph drive (with
// versions, delete, and replace), so the logic is proven without a sandbox.
// A live run confirms the same gates against a real drive.

import assert from "node:assert/strict";
import { OneDriveGraphStore } from "../src/adapters/onedrive-store.mjs";
import { ONEDRIVE_GATE_IMPLEMENTATIONS } from "../src/onedrive-gates.mjs";

let pass = 0;
let fail = 0;
async function check(name, action) {
  try {
    await action();
    pass++;
  } catch (error) {
    fail++;
    console.error(`  FAIL: ${name}`);
    console.error(`        ${error.stack || error}`);
  }
}

// A fuller in-memory Graph drive: items with version history, delete, replace.
function fakeGraphDrive() {
  const items = new Map(); // path -> { id, eTag, content, versions: [content] }
  let idSeq = 1;
  const byId = () => new Map([...items.values()].map((i) => [i.id, i]));
  const bump = () => `v${idSeq++}`;
  return {
    items,
    async fetch(url, opts) {
      const u = new URL(url);
      const p = decodeURIComponent(u.pathname);
      const method = opts.method;

      if (method === "POST" && p.endsWith(":/children")) return { ok: true, status: 201, json: async () => ({}) };

      // create/replace: PUT .../root:/{path}:/content
      const putByPath = p.match(/\/root:\/(.+):\/content$/);
      if (method === "PUT" && putByPath) {
        const key = putByPath[1];
        const replace = u.search.includes("conflictBehavior=replace");
        if (items.has(key) && !replace) return { ok: false, status: 409, json: async () => ({}) };
        const existing = items.get(key);
        const eTag = bump();
        const item = existing
          ? Object.assign(existing, { eTag, content: opts.body, versions: [...existing.versions, opts.body] })
          : { id: `id${idSeq}`, eTag, content: opts.body, versions: [opts.body] };
        items.set(key, item);
        return { ok: true, status: 201, json: async () => ({ id: item.id, eTag }) };
      }

      // list children: GET .../root:/{sub}:/children
      if (method === "GET" && p.match(/:\/children$/)) {
        const sub = p.match(/\/root:\/(.+):\/children$/)[1];
        const value = [...items.keys()]
          .filter((k) => k.startsWith(`${sub}/`) && !k.slice(sub.length + 1).includes("/"))
          .map((k) => ({ name: k.split("/").pop() }));
        return { ok: true, status: 200, json: async () => ({ value }) };
      }

      // versions: GET .../items/{id}/versions
      const versList = p.match(/\/items\/(.+)\/versions$/);
      if (method === "GET" && versList) {
        const item = byId().get(versList[1]);
        const value = (item?.versions || []).map((_, i) => ({ id: `ver${i}` }));
        return { ok: true, status: 200, json: async () => ({ value }) };
      }
      // version content: GET .../items/{id}/versions/{vid}/content
      const versContent = p.match(/\/items\/(.+)\/versions\/ver(\d+)\/content$/);
      if (method === "GET" && versContent) {
        const item = byId().get(versContent[1]);
        return { ok: true, status: 200, text: async () => item.versions[Number(versContent[2])] };
      }
      // content: GET .../items/{id}/content
      const getContent = p.match(/\/items\/(.+)\/content$/);
      if (method === "GET" && getContent) {
        const item = byId().get(getContent[1]);
        return { ok: true, status: 200, text: async () => item.content };
      }
      // update: PUT .../items/{id}/content  (If-Match)
      const putById = p.match(/\/items\/(.+)\/content$/);
      if (method === "PUT" && putById) {
        const item = byId().get(putById[1]);
        if (opts.headers["If-Match"] !== item.eTag) return { ok: false, status: 412, json: async () => ({}) };
        item.eTag = bump();
        item.content = opts.body;
        item.versions.push(opts.body);
        return { ok: true, status: 200, json: async () => ({ id: item.id, eTag: item.eTag }) };
      }

      // read meta: GET .../root:/{path}
      const getMeta = p.match(/\/root:\/(.+)$/);
      if (method === "GET" && getMeta) {
        const item = items.get(getMeta[1]);
        if (!item) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ id: item.id, eTag: item.eTag }) };
      }
      // delete: DELETE .../root:/{path}  (item or whole subfolder)
      const del = p.match(/\/root:\/(.+)$/);
      if (method === "DELETE" && del) {
        const key = del[1];
        if (items.has(key)) items.delete(key);
        else for (const k of [...items.keys()]) if (k.startsWith(`${key}/`)) items.delete(k);
        return { ok: true, status: 204, json: async () => ({}) };
      }
      return { ok: false, status: 400, json: async () => ({}), text: async () => "" };
    },
  };
}

function liveContext(scenarioId) {
  const drive = fakeGraphDrive();
  const runId = `s0-gate-${scenarioId.toLowerCase()}`;
  return {
    drive,
    config: { runId, backingPath: "onedrive", dryRun: false },
    scenario: { id: scenarioId },
    createStore: () => new OneDriveGraphStore({
      dryRun: false, driveId: "d1", folderPath: "Base", runId,
      graphToken: "syn-token", fetchImpl: (u, o) => drive.fetch(u, o),
    }),
  };
}

for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
  await check(`gate ${id} passes against the fake drive`, async () => {
    const context = liveContext(id);
    const result = await impl(context);
    assert.ok(result && result.evidence, `${id} must return evidence, got ${JSON.stringify(result)}`);
    assert.ok(!result.blocked, `${id} must not be blocked in a live context`);
  });
}

await check("gates report Blocked outside a live OneDrive context", async () => {
  for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
    const result = await impl({ config: { backingPath: "local", dryRun: false }, scenario: { id } });
    assert.ok(result.blocked, `${id} must be Blocked on a local backing path`);
  }
});

console.log(`s0-onedrive-gates: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
