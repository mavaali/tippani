import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PersistentPendingQueue } from "../src/adapters/persistent-pending-queue.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(path.dirname(here), ".test-state", "pending-queue");
const worker = fileURLToPath(new URL("../src/workers/pending-queue-worker.mjs", import.meta.url));
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

function encoded(request) {
  return Buffer.from(JSON.stringify(request), "utf8").toString("base64url");
}

function spawnAppend(request, { barrier = false } = {}) {
  const child = fork(worker, [
    "--mode=append",
    `--root=${root}`,
    "--provider=github",
    "--run-id=s0-pending-queue-test",
    `--request=${encoded(request)}`,
    `--barrier=${barrier}`,
  ], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(stderr || `worker exited ${code}`));
      resolve(JSON.parse(stdout.trim()));
    });
  });
  const ready = barrier
    ? new Promise((resolve, reject) => {
      child.on("message", (message) => { if (message?.ready) resolve(); });
      done.catch(reject);
    })
    : Promise.resolve();
  return {
    child,
    ready,
    done,
  };
}

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

await check("pending work survives an actual child-process restart", async () => {
  const first = spawnAppend({ workspaceId: "syn-ws-one", expectedGeneration: 1 });
  await first.done;
  const queue = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  const entries = await queue.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].request.workspaceId, "syn-ws-one");
});

await check("cross-process appends reload under a lock without losing entries", async () => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const left = spawnAppend({ workspaceId: "syn-ws-left", expectedGeneration: 1 }, { barrier: true });
  const right = spawnAppend({ workspaceId: "syn-ws-right", expectedGeneration: 1 }, { barrier: true });
  await Promise.all([left.ready, right.ready]);
  left.child.send("go");
  right.child.send("go");
  await Promise.all([left.done, right.done]);
  const queue = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  const entries = await queue.list();
  assert.equal(entries.length, 2);
  assert.deepEqual(
    new Set(entries.map((entry) => entry.request.workspaceId)),
    new Set(["syn-ws-left", "syn-ws-right"]),
  );
});

await check("FIFO processing stops at the first retained entry", async () => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const queue = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  await queue.append({ workspaceId: "syn-ws-first" });
  await queue.append({ workspaceId: "syn-ws-second" });
  const first = await queue.processHead(async () => ({ remove: false, kind: "retained" }));
  assert.equal(first.entry.request.workspaceId, "syn-ws-first");
  assert.deepEqual(
    (await queue.list()).map((entry) => entry.request.workspaceId),
    ["syn-ws-first", "syn-ws-second"],
  );
});

await check("head resolution is durably guarded by ID and queue generation", async () => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const queue = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  await queue.append({ workspaceId: "syn-ws-first", expectedGeneration: 0 });
  const inspected = await queue.inspectHead();
  assert.equal(inspected.head.generation, 0);
  await assert.rejects(
    queue.resolveHead({
      headId: inspected.head.id,
      headGeneration: inspected.head.generation + 1,
      action: "discard",
    }),
    (error) => error.code === "pending_queue_head_changed",
  );
  const replaced = await queue.resolveHead({
    headId: inspected.head.id,
    headGeneration: inspected.head.generation,
    action: "replace",
    replacement: { workspaceId: "syn-ws-first", expectedGeneration: 2 },
  });
  assert.equal(replaced.head.id, inspected.head.id);
  assert.equal(replaced.head.generation, 1);
  assert.equal(replaced.head.request.expectedGeneration, 2);
  const reopened = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  assert.deepEqual((await reopened.inspectHead()).head, replaced.head);
});

await check("discarding a conflicted head unblocks the next FIFO entry", async () => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  const queue = new PersistentPendingQueue({
    storeRoot: root,
    provider: "github",
    runId: "s0-pending-queue-test",
  });
  await queue.append({ workspaceId: "syn-ws-conflict" });
  await queue.append({ workspaceId: "syn-ws-later" });
  const blocked = await queue.processHead(async () => ({ remove: false, kind: "conflict" }));
  assert.equal(blocked.entry.request.workspaceId, "syn-ws-conflict");
  const head = (await queue.inspectHead()).head;
  await queue.resolveHead({
    headId: head.id,
    headGeneration: head.generation,
    action: "discard",
  });
  const replayed = await queue.processHead(async () => ({ remove: true, kind: "applied" }));
  assert.equal(replayed.entry.request.workspaceId, "syn-ws-later");
  assert.equal(await queue.count(), 0);
});

fs.rmSync(root, { recursive: true, force: true });
console.log(`s0-pending-queue: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
