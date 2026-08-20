// OneDrive transport tests. The dry-run cases make zero network calls; the
// live-path cases use an in-memory fake of the Graph drive so the ETag
// compare-and-swap logic is proven offline, without a sandbox.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OneDriveGraphStore } from "../src/adapters/onedrive-store.mjs";
import { buildPreflightSheet } from "../src/provider-preflight-sheet.mjs";
import { findEmbeddedSecrets } from "../src/preflight.mjs";
import { createSyntheticWorkspace } from "../src/synthetic-fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const spikeRoot = path.dirname(here);
const onedriveConfig = JSON.parse(fs.readFileSync(
  path.join(spikeRoot, "config", "provider-onedrive-dryrun.json"),
  "utf8",
));

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

// --- Dry-run --------------------------------------------------------------

await check("dry-run records Graph operations and makes zero network calls", async () => {
  const store = new OneDriveGraphStore({ dryRun: true, runId: "s0-od-test" });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "od-dry" });
  await store.createWorkspace(workspace);
  await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "Synthetic Actor", action: "x" } },
  });
  await store.readWorkspace(workspace.workspaceId);
  await store.listWorkspaces();
  await store.cleanup();
  assert.equal(store.liveProviderCallCount(), 0);
  const ops = store.providerOperationManifest().map((o) => o.op);
  for (const expected of ["ensure-folder", "put-content", "get-content", "list-children", "delete-folder"]) {
    assert.ok(ops.includes(expected), `manifest missing ${expected}`);
  }
  const put = store.providerOperationManifest().find((o) => o.op === "put-content" && o.precondition === "conflictBehavior=fail");
  assert.ok(put, "create must record a conflictBehavior=fail precondition");
  assert.ok(store.providerOperationManifest().some((o) => String(o.precondition).includes("If-Match")),
    "a mutation must record an If-Match precondition");
});

await check("dry-run enforces generation CAS coherently", async () => {
  const store = new OneDriveGraphStore({ dryRun: true, runId: "s0-od-cas" });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "od-cas" });
  await store.createWorkspace(workspace);
  await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "A", action: "1" } },
  });
  await assert.rejects(
    store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "B", action: "2" } },
    }),
    (e) => e.code === "generation_conflict",
  );
  assert.equal(store.liveProviderCallCount(), 0);
});

await check("preflight sheet for OneDrive is non-secret and OneDrive-accurate", async () => {
  const sheet = await buildPreflightSheet(onedriveConfig);
  assert.equal(sheet.liveProviderCalls, 0);
  assert.deepEqual(findEmbeddedSecrets(sheet), []);
  const ops = sheet.dryRunOperations.map((o) => o.op);
  assert.ok(ops.includes("put-content") && ops.includes("ensure-folder") && ops.includes("delete-folder"));
  assert.ok(sheet.dryRunOperations.every((o) => o.namespace === "tippani-s0/s0-provider-onedrive-dryrun"));
});

// --- Live path (fails closed / fake Graph) --------------------------------

await check("live fails closed without a token", async () => {
  const store = new OneDriveGraphStore({ dryRun: false, driveId: "d1", folderPath: "Base" });
  await assert.rejects(store.initialize(), (e) => e.code === "no_token");
});

// A minimal in-memory Graph drive: enough to exercise create/read/CAS + 412.
function fakeGraphDrive() {
  const items = new Map(); // path -> { id, eTag, content }
  let idSeq = 1;
  let onBeforePut = null;
  const byId = () => new Map([...items.values()].map((i) => [i.id, i]));
  return {
    setOnBeforePut(fn) { onBeforePut = fn; },
    async fetch(url, opts) {
      const u = new URL(url);
      const p = decodeURIComponent(u.pathname);
      const method = opts.method;
      // ensure-folder: POST .../root:/{parent}:/children
      if (method === "POST" && p.includes(":/children")) return { ok: true, status: 201, json: async () => ({}) };
      // create: PUT .../root:/{path}:/content?conflictBehavior=fail
      const putContentByPath = p.match(/\/root:\/(.+):\/content$/);
      if (method === "PUT" && putContentByPath) {
        const key = putContentByPath[1];
        if (items.has(key) && u.search.includes("conflictBehavior=fail")) return { ok: false, status: 409, json: async () => ({}) };
        const eTag = `v${idSeq}`;
        items.set(key, { id: `id${idSeq}`, eTag, content: opts.body });
        idSeq++;
        return { ok: true, status: 201, json: async () => ({ id: items.get(key).id, eTag }) };
      }
      // read meta: GET .../root:/{path}?$select=id,eTag
      const getMeta = p.match(/\/root:\/(.+)$/);
      // list children: GET .../root:/{sub}:/children  (checked before meta)
      if (method === "GET" && p.match(/:\/children$/)) {
        const names = [...items.keys()].map((k) => ({ name: k.split("/").pop() }));
        return { ok: true, status: 200, json: async () => ({ value: names }) };
      }
      if (method === "GET" && getMeta && u.search.includes("select")) {
        const key = getMeta[1];
        const item = items.get(key);
        if (!item) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ id: item.id, eTag: item.eTag }) };
      }
      // read content: GET .../items/{id}/content
      const getContent = p.match(/\/items\/(.+)\/content$/);
      if (method === "GET" && getContent) {
        const item = byId().get(getContent[1]);
        return { ok: true, status: 200, text: async () => item.content };
      }
      // update: PUT .../items/{id}/content  (If-Match)
      const putById = p.match(/\/items\/(.+)\/content$/);
      if (method === "PUT" && putById) {
        const item = byId().get(putById[1]);
        if (onBeforePut) onBeforePut(item); // simulate a competing writer
        const ifMatch = opts.headers["If-Match"];
        if (ifMatch !== item.eTag) return { ok: false, status: 412, json: async () => ({}) };
        item.eTag = `v${idSeq++}`;
        item.content = opts.body;
        return { ok: true, status: 200, json: async () => ({ id: item.id, eTag: item.eTag }) };
      }
      return { ok: false, status: 400, json: async () => ({}), text: async () => "" };
    },
  };
}

await check("live create + read round-trips through the fake drive", async () => {
  const drive = fakeGraphDrive();
  const store = new OneDriveGraphStore({
    dryRun: false, driveId: "d1", folderPath: "Base", runId: "r1",
    graphToken: "syn-token", fetchImpl: (u, o) => drive.fetch(u, o),
  });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "od-live" });
  await store.createWorkspace(workspace);
  const read = await store.readWorkspace(workspace.workspaceId);
  assert.deepEqual(read, workspace);
  assert.ok(store.liveProviderCallCount() > 0);
});

await check("live compareAndSwap advances via If-Match ETag CAS", async () => {
  const drive = fakeGraphDrive();
  const store = new OneDriveGraphStore({
    dryRun: false, driveId: "d1", folderPath: "Base", runId: "r2",
    graphToken: "syn-token", fetchImpl: (u, o) => drive.fetch(u, o),
  });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "od-live-cas" });
  await store.createWorkspace(workspace);
  const next = await store.compareAndSwap({
    workspaceId: workspace.workspaceId,
    expectedGeneration: 0,
    operation: { auditEvent: { actor: "A", action: "1" } },
  });
  assert.equal(next.generation, 1);
});

await check("live compareAndSwap surfaces a 412 as a typed stale-writer conflict", async () => {
  const drive = fakeGraphDrive();
  const store = new OneDriveGraphStore({
    dryRun: false, driveId: "d1", folderPath: "Base", runId: "r3",
    graphToken: "syn-token", fetchImpl: (u, o) => drive.fetch(u, o),
  });
  await store.initialize();
  const workspace = createSyntheticWorkspace({ seed: "od-412" });
  await store.createWorkspace(workspace);
  // A competing writer advances the item between our read and our write.
  drive.setOnBeforePut((item) => {
    const ws = JSON.parse(item.content);
    ws.generation = 1;
    item.content = JSON.stringify(ws);
    item.eTag = "v-competitor";
    drive.setOnBeforePut(null);
  });
  await assert.rejects(
    store.compareAndSwap({
      workspaceId: workspace.workspaceId,
      expectedGeneration: 0,
      operation: { auditEvent: { actor: "A", action: "1" } },
    }),
    (e) => e.code === "generation_conflict",
  );
});

console.log(`s0-onedrive: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
