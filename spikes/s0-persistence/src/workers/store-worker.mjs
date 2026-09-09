// Child process used for genuine cross-process evidence. In-process promises
// share one event loop and one store instance, which cannot demonstrate that a
// durable store is safe when independent OS processes (portal, MCP/Copilot,
// automation) write concurrently.
//
// Modes:
//   write         - wait for the release signal, then attempt one compare-and-swap
//   write-now     - attempt one compare-and-swap immediately
//   stale-reconcile - reject a stale write, reload, then commit on the new generation
//   observe       - poll until a target generation is visible
//   crash         - hard-exit at a named commit boundary during a mutation
//   migration-crash - hard-exit at a named boundary during a migration
//   checksum-backfill-crash - hard-exit while upgrading checksum metadata
//   lock-reclaim-crash - hard-exit while reclaiming a stale filesystem lock
//   read          - reopen the store and report durable state

import { createStore } from "../adapters/registry.mjs";
import { acquireLock } from "../adapters/fs-atomic.mjs";
import { IpcOperationBudget, OperationBudget } from "../operation-budget.mjs";

function argOf(name, fallback = null) {
  const prefixed = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return prefixed ? prefixed.slice(name.length + 3) : fallback;
}

const mode = argOf("mode", "write");
const adapter = argOf("adapter");
const storeRoot = argOf("root");
const workspaceId = argOf("workspace");
const runId = argOf("run-id");
const providerLive = argOf("provider-live", "false") === "true";
const actor = argOf("actor", `Synthetic Worker ${process.pid}`);
const expectedGeneration = Number(argOf("expected", "0"));
const targetGeneration = Number(argOf("target", "1"));
const pollIntervalMs = Number(argOf("poll-ms", "100"));
const observationTimeoutMs = Number(argOf("observe-timeout-ms", "30000"));
const crashAt = argOf("crash-at", "before-commit");
const op = argOf("op", "audit");
const alias = argOf("alias", `syn-alias-crash-${process.pid}`);
const deadlineMs = Number(argOf("deadline-ms", "30000"));
const deferInitialize = argOf("defer-initialize", "false") === "true";
const cleanupManifestNonce = argOf("cleanup-manifest-nonce");
const cleanupManifestId = argOf("cleanup-manifest-id");
const effectiveTargetHash = argOf("effective-target-hash");
const ownershipMarker = argOf("ownership-marker", `tippani-s0:${runId}`);
const namespace = argOf("namespace", `tippani-s0/${runId}`);
const abortController = new AbortController();
const deadlineTimer = providerLive
  ? setTimeout(() => abortController.abort(), deadlineMs)
  : null;
deadlineTimer?.unref?.();
const safetyBudget = providerLive
  ? (process.send ? new IpcOperationBudget({
    signal: abortController.signal,
  }) : new OperationBudget({
    limits: {
      maxOperations: Number(argOf("max-operations", "100")),
      maxObjects: Number(argOf("max-objects", "10000")),
      maxBytes: Number(argOf("max-bytes", "104857600")),
      maxDurationMs: deadlineMs,
    },
    signal: abortController.signal,
  }))
  : null;

function report(payload) {
  process.stdout.write(`${JSON.stringify({ pid: process.pid, ...payload })}\n`);
}

function crashInjector() {
  // Exit without unwinding: no finally blocks, no lock release, no flush.
  return {
    hit(point) {
      if (point === crashAt) {
        report({ status: "crashing", at: point });
        process.exit(9);
      }
    },
  };
}

function crashOperation() {
  if (op === "add-alias") return { addAliases: [alias] };
  return { auditEvent: { actor, action: "crash-write" } };
}

async function waitForInitializationSignal() {
  if (!deferInitialize || !process.send) return;
  await new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message !== "init") return;
      process.off("disconnect", onDisconnect);
      process.off("message", onMessage);
      resolve();
    };
    const onDisconnect = () => {
      process.off("message", onMessage);
      reject(new Error("Parent disconnected before initializing the worker"));
    };
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
    process.send({ booted: true });
  });
}

async function waitForRelease() {
  if (!process.send) return;
  await new Promise((resolve, reject) => {
    const onMessage = (message) => {
      if (message !== "go") return;
      process.off("disconnect", onDisconnect);
      process.off("message", onMessage);
      resolve();
    };
    const onDisconnect = () => {
      process.off("message", onMessage);
      reject(new Error("Parent disconnected before releasing the worker barrier"));
    };
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
    process.send({ ready: true });
  });
}

try {
  await waitForInitializationSignal();
} catch (error) {
  report({
    status: "error",
    phase: "initialize",
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  process.exit(1);
}

if (mode === "budget-probe") {
  try {
    await waitForRelease();
    await safetyBudget.recordRequest("syn-budget-probe");
    report({ status: "budget-consumed" });
    process.exit(0);
  } catch (error) {
    report({ status: "error", phase: "operation", code: error?.code, message: error?.message });
    process.exit(1);
  }
}

if (mode === "lock-reclaim-crash") {
  const lockPath = argOf("lock-path");
  try {
    const lock = await acquireLock(lockPath, {
      timeoutMs: Number(argOf("lock-timeout-ms", "1000")),
      pollMs: 1,
      onBeforeReapDelete() {
        report({ status: "crashing", phase: "lock-reclamation" });
        process.exit(9);
      },
    });
    lock.release();
    report({ status: "reclaimed-unexpectedly" });
    process.exit(0);
  } catch (error) {
    report({
      status: "error",
      phase: "lock-reclamation",
      name: error?.name,
      code: error?.code,
      message: error?.message,
    });
    process.exit(1);
  }
}

let providerProbe = null;
let store;
const providerOptions = providerLive ? {
  dryRun: false,
  enforcePreflight: true,
  safetyBudget,
  signal: abortController.signal,
  sandbox: {
    namespace,
    ownershipMarker,
    coordinates: {},
    cleanup: {
      manifestId: cleanupManifestId,
      manifestNonce: cleanupManifestNonce,
    },
    approval: {
      approver: process.env.S0_PREFLIGHT_APPROVER,
      approvedAt: process.env.S0_PREFLIGHT_APPROVED_AT,
      reference: process.env.S0_PREFLIGHT_APPROVAL_REFERENCE,
      targetHash: effectiveTargetHash || process.env.S0_PREFLIGHT_TARGET_HASH,
    },
  },
} : {};

if (mode === "provider-marker-probe") {
  if (adapter !== "onedrive") throw new Error("Provider marker probe requires OneDrive");
  const existingMarker = argOf("probe-existing-marker", "false") === "true";
  const remoteMarkerNonce = argOf("probe-remote-marker-nonce", cleanupManifestNonce);
  let folderCreates = 0;
  let markerCreated = false;
  let markerRequestNonce = null;
  let markerVerified = false;
  let meteredOperation = false;
  const fetchImpl = async (url, options) => {
    if (options.method === "POST") {
      folderCreates++;
      return existingMarker
        ? { ok: false, status: 409, json: async () => ({}) }
        : { ok: true, status: 201, json: async () => ({}) };
    }
    if (options.method === "PUT") {
      markerCreated = true;
      markerRequestNonce = JSON.parse(options.body).manifestNonce;
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (options.method === "GET" && url.includes("/items/probe-marker/content")) {
      markerVerified = true;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ...store.runMarker(),
          manifestNonce: remoteMarkerNonce,
        }),
      };
    }
    if (options.method === "GET" && url.includes(".tippani-s0-run")) {
      markerVerified = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "probe-marker", eTag: "probe-marker-etag" }),
      };
    }
    if (options.method === "GET" && url.includes(":/children")) {
      meteredOperation = true;
      return { ok: true, status: 200, json: async () => ({ value: [] }) };
    }
    throw new Error(`Unexpected provider marker probe request: ${options.method} ${url}`);
  };
  providerProbe = {
    state: () => ({
      folderCreates,
      markerCreated,
      markerRequestNonce,
      markerVerified,
      meteredOperation,
    }),
  };
  store = createStore(adapter, {
    storeRoot,
    runId,
    ...providerOptions,
    driveId: argOf("probe-drive-id", "probe-drive"),
    folderPath: argOf("probe-folder", "Probe"),
    getToken: async () => "probe-token",
    identityResolver: async () => ({
      subject: argOf("probe-identity", "onedrive:probe-identity"),
    }),
    fetchImpl,
  });
} else {
  store = createStore(adapter, {
    storeRoot,
    runId,
    ...providerOptions,
  });
}

if (mode === "provider-marker-probe") {
  try {
    await store.initialize();
    await store.listWorkspaces();
    report({
      status: "provider-marker-probed",
      enforcePreflight: store.enforcePreflight,
      manifestNonce: store.cleanupManifestNonce,
      marker: providerProbe.state(),
      telemetry: store.providerTelemetry?.(),
      budget: safetyBudget.snapshot?.(),
    });
    await store.close();
    if (deadlineTimer) clearTimeout(deadlineTimer);
    process.exit(0);
  } catch (error) {
    report({
      status: "error",
      code: error?.code,
      message: error?.message,
      manifestNonce: store?.cleanupManifestNonce,
      marker: providerProbe?.state(),
    });
    try { await store?.close(); } catch { /* best effort */ }
    if (deadlineTimer) clearTimeout(deadlineTimer);
    process.exit(1);
  }
}

try {
  if (mode === "checksum-backfill-crash") {
    await store.initialize({ faultInjector: crashInjector() });
    report({ status: "backfilled-unexpectedly" });
    process.exit(0);
  }
  await store.initialize();
} catch (error) {
  report({
    status: "error",
    phase: "initialize",
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  try { await store?.close(); } catch { /* best effort */ }
  if (deadlineTimer) clearTimeout(deadlineTimer);
  process.exit(1);
}

try {
  if (mode === "read") {
    report({ status: "read", workspace: await store.readWorkspace(workspaceId) });
  } else if (mode === "crash") {
    await store.compareAndSwap({
      workspaceId,
      expectedGeneration,
      operation: crashOperation(),
      faultInjector: crashInjector(),
    });
    report({ status: "committed-unexpectedly" });
  } else if (mode === "migration-crash") {
    await store.migrate({ faultInjector: crashInjector() });
    report({ status: "migrated-unexpectedly" });
  } else if (mode === "stale-reconcile") {
    let conflict;
    try {
      await store.compareAndSwap({
        workspaceId,
        expectedGeneration,
        operation: { auditEvent: { actor, action: "stale-write" } },
      });
      throw new Error("Expected the stale provider write to conflict");
    } catch (error) {
      if (error?.code !== "generation_conflict") throw error;
      conflict = { expected: error.expectedGeneration, actual: error.actualGeneration };
    }
    const current = await store.readWorkspace(workspaceId);
    const next = await store.compareAndSwap({
      workspaceId,
      expectedGeneration: current.generation,
      operation: { auditEvent: { actor, action: "reconciled-write" } },
    });
    report({
      status: "reconciled",
      conflict,
      reloadedGeneration: current.generation,
      generation: next.generation,
      actor,
      telemetry: store.providerTelemetry?.(),
    });
  } else if (mode === "observe") {
    const startedAt = Date.now();
    let current;
    while (Date.now() - startedAt <= observationTimeoutMs) {
      current = await store.readWorkspace(workspaceId);
      if (current.generation >= targetGeneration) break;
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    if (!current || current.generation < targetGeneration) {
      throw new Error(`Timed out waiting for generation ${targetGeneration}`);
    }
    report({
      status: "observed",
      generation: current.generation,
      discoveryMs: Date.now() - startedAt,
      actor,
      telemetry: store.providerTelemetry?.(),
    });
  } else {
    if (mode !== "write-now") await waitForRelease();
    const next = await store.compareAndSwap({
      workspaceId,
      expectedGeneration,
      operation: { auditEvent: { actor, action: "concurrent-write" } },
    });
    report({
      status: "committed",
      generation: next.generation,
      actor,
      telemetry: store.providerTelemetry?.(),
    });
  }
  await store.close();
  if (deadlineTimer) clearTimeout(deadlineTimer);
  process.exit(0);
} catch (error) {
  const conflict = error?.code === "generation_conflict";
  report({
    status: conflict ? "conflict" : "error",
    phase: "operation",
    name: error?.name,
    code: error?.code,
    message: error?.message,
  });
  try { await store.close(); } catch { /* best effort */ }
  if (deadlineTimer) clearTimeout(deadlineTimer);
  process.exit(conflict ? 0 : 1);
}
