// Offline correctness + detection for the live OneDrive gate implementations.
// Provider request logic is exercised against an in-memory fake. Gates that
// require independent processes or atomic full-store restore must remain
// incomplete because this execution is in-process transport emulation.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { OneDriveGraphStore } from "../src/adapters/onedrive-store.mjs";
import { ONEDRIVE_GATE_IMPLEMENTATIONS } from "../src/onedrive-gates.mjs";
import { createSyntheticWorkspace } from "../src/synthetic-fixtures.mjs";

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
  const storeRoot = path.resolve("spikes/s0-persistence/.test-state", runId);
  fs.rmSync(storeRoot, { recursive: true, force: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  return {
    drive,
    config: { runId, adapter: "onedrive", backingPath: "onedrive", dryRun: false },
    scenario: { id: scenarioId },
    inProcessProviderClients: true,
    primaryRoot: storeRoot,
    createStore: () => new OneDriveGraphStore({
      dryRun: false, driveId: "d1", folderPath: "Base", runId,
      graphToken: "syn-token", fetchImpl: (u, o) => drive.fetch(u, o), storeRoot,
    }),
    cleanupLocal: () => fs.rmSync(storeRoot, { recursive: true, force: true }),
  };
}

for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
  await check(`gate ${id} reports evidence no stronger than the fake drive execution`, async () => {
    const context = liveContext(id);
    try {
      const result = await impl(context);
      if (["S0-COL-002", "S0-COL-003", "S0-COL-006", "S0-BKP-004"].includes(id)) {
        assert.match(result.skip, /in-process|atomic authoritative head/i);
        assert.equal(result.evidence, undefined);
        return;
      }
      assert.ok(result && result.evidence, `${id} must return evidence, got ${JSON.stringify(result)}`);
      assert.ok(!result.blocked, `${id} must not be blocked in a live context`);
      if (id === "S0-BCK-005") {
        assert.deepEqual(result.evidence.faultsExercised,
          ["auth-expiry", "outage", "quota", "permission-loss", "throttle"]);
        assert.equal(result.evidence.throttleResponses, 1);
        assert.equal(result.evidence.throttleRecoveredByBoundedRetry, true);
        assert.equal(result.evidence.retries, 1);
        assert.deepEqual(result.evidence.retryAfterSeconds, [1]);
        assert.ok(result.evidence.backoffMs >= 1000);
        assert.ok(result.evidence.transferredBytes > 0);
      }
      if (id === "S0-REC-003") {
        assert.deepEqual(result.evidence.faultsExercised,
          ["outage", "throttle", "auth-expiry", "quota", "permission-loss", "lost-response"]);
        assert.deepEqual(result.evidence.throttleRecovery, {
          boundedRetries: 1,
          retryAfterSeconds: 1,
          minimumBackoffMs: 1000,
        });
      }
      if (["S0-COL-005", "S0-REC-004"].includes(id)) {
        assert.equal(result.evidence.processRestartRecoveredQueue, true);
        assert.notEqual(result.evidence.queueRestartInspectorProcessId, process.pid);
        const writers = result.evidence.queueWriterProcessIds ||
          [result.evidence.queueWriterProcessId];
        assert(writers.every((pid) => Number.isInteger(pid) && pid !== process.pid));
      }
    } finally {
      context.cleanupLocal();
    }
  });
}

await check("OneDrive resolveAlias fails closed on duplicate persisted aliases", async () => {
  const drive = fakeGraphDrive();
  const runId = "s0-onedrive-duplicate-alias";
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    graphToken: "syn-token",
    fetchImpl: (url, request) => drive.fetch(url, request),
  });
  await store.initialize();
  const left = createSyntheticWorkspace({ seed: "onedrive-duplicate-left" });
  const right = createSyntheticWorkspace({ seed: "onedrive-duplicate-right" });
  right.aliases = [left.aliases[0]];
  for (const workspace of [left, right]) {
    drive.items.set(`${store.subfolder}/${workspace.workspaceId}.json`, {
      id: `id-${workspace.workspaceId}`,
      eTag: `etag-${workspace.workspaceId}`,
      content: JSON.stringify(workspace),
      versions: [JSON.stringify(workspace)],
    });
  }
  await assert.rejects(
    store.resolveAlias(left.aliases[0]),
    (error) => error.code === "alias_conflict",
  );
});

await check("OneDrive restore validates then fails before any item mutation", async () => {
  const drive = fakeGraphDrive();
  const runId = "s0-onedrive-restore-unsupported";
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    graphToken: "syn-token",
    fetchImpl: (url, request) => drive.fetch(url, request),
  });
  await store.initialize();
  const before = new Map(drive.items);
  await assert.rejects(
    store.restore({
      schemaVersion: 1,
      syntheticData: true,
      workspaces: [createSyntheticWorkspace({ seed: "onedrive-restore" })],
    }),
    (error) => error.code === "restore_atomicity_unsupported",
  );
  assert.deepEqual(drive.items, before);
});

await check("gates report Blocked outside a live OneDrive context", async () => {
  for (const [id, impl] of Object.entries(ONEDRIVE_GATE_IMPLEMENTATIONS)) {
    const result = await impl({ config: { backingPath: "local", dryRun: false }, scenario: { id } });
    assert.ok(result.blocked, `${id} must be Blocked on a local backing path`);
  }
});

console.log(`s0-onedrive-gates: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
