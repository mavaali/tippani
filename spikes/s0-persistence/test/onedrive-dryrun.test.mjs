// OneDrive transport tests. The dry-run cases make zero network calls; the
// live-path cases use an in-memory fake of the Graph drive so the ETag
// compare-and-swap logic is proven offline, without a sandbox.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OneDriveGraphStore } from "../src/adapters/onedrive-store.mjs";
import { GitHubRepoStore } from "../src/adapters/github-repo-store.mjs";
import {
  CleanupManifest,
  createCleanupAuthorization,
} from "../src/cleanup-manifest.mjs";
import { buildPreflightSheet } from "../src/provider-preflight-sheet.mjs";
import { findEmbeddedSecrets } from "../src/preflight.mjs";
import { createSyntheticWorkspace } from "../src/synthetic-fixtures.mjs";
import { OperationBudget } from "../src/operation-budget.mjs";
import { raceWorkers } from "../src/process-runner.mjs";

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
  const authorization = createCleanupAuthorization({
    runId: "s0-od-test",
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: "tippani-s0:s0-od-test",
      coordinates: { driveId: null, folder: null },
      cleanup: { manifestId: "syn-cleanup-s0-od-test" },
    },
  }, store);
  await store.prepareCleanup(authorization);
  await store.cleanup(authorization);
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

await check("OneDrive initialize rejects a foreign preexisting run folder", async () => {
  let folderCreates = 0;
  let markerCreates = 0;
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId: "s0-onedrive-foreign-folder",
    graphToken: "syn-token",
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") {
        folderCreates++;
        return { ok: false, status: 409, json: async () => ({}) };
      }
      if (options.method === "PUT") {
        markerCreates++;
        return { ok: true, status: 201, json: async () => ({}) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
  await assert.rejects(
    store.initialize(),
    (error) => error.code === "cleanup_ownership_mismatch",
  );
  assert.equal(folderCreates, 2);
  assert.equal(markerCreates, 0, "an existing foreign folder must not be claimed");
});

await check("OneDrive marker creation is covered by the persisted manifest and budget", async () => {
  const runId = "s0-onedrive-marker-budget";
  const root = path.join(spikeRoot, ".test-state", runId);
  const manifestPath = path.join(root, "cleanup-manifest.json");
  const budget = new OperationBudget({
    limits: { maxOperations: 10, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
  });
  let markerCreated = false;
  let store;
  const fetchImpl = async (_url, options) => {
    if (options.method === "POST") {
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (options.method === "PUT") {
      assert.equal(fs.existsSync(manifestPath), true);
      assert.equal(options.body, store.runMarkerContent());
      assert.equal(
        CleanupManifest.load(manifestPath).manifestNonce,
        store.cleanupManifestNonce,
      );
      assert.equal(
        CleanupManifest.load(manifestPath).resources[0].marker.digest,
        store.runMarkerDigest(),
      );
      markerCreated = true;
      return { ok: true, status: 201, json: async () => ({}) };
    }
    throw new Error(`Unexpected marker request: ${options.method}`);
  };
  fs.rmSync(root, { recursive: true, force: true });
  try {
    store = new OneDriveGraphStore({
      dryRun: false,
      driveId: "d1",
      folderPath: "Base",
      runId,
      cleanupManifestId: `syn-cleanup-${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      graphToken: "syn-token",
      safetyBudget: budget,
      fetchImpl,
    });
    createCleanupAuthorization({
      runId,
      backingPath: "onedrive",
      sandbox: {
        ownershipMarker: `tippani-s0:${runId}`,
        effectiveTargetHash: "sha256:syn-target",
        coordinates: { driveId: "d1", folder: "Base" },
        cleanup: { manifestId: `syn-cleanup-${runId}` },
      },
    }, store, { filePath: manifestPath });
    await store.initialize();
    assert.equal(markerCreated, true);
    assert.equal(budget.snapshot().operations, 3);
    assert.equal(budget.snapshot().objects, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await check("cleanup requires manifest authorization before any provider call", async () => {
  let calls = 0;
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId: "s0-cleanup-denied",
    graphToken: "syn-token",
    fetchImpl: async () => {
      calls++;
      return { ok: true, status: 204 };
    },
  });
  await assert.rejects(store.cleanup(), /manifest authorization/);
  assert.equal(calls, 0);
});

await check("cleanup deletes only manifest-enumerated children and refuses recursive folder deletion", async () => {
  let childPresent = true;
  let conditionalChildDelete = false;
  let folderDeletes = 0;
  const runId = "s0-cleanup-conditional";
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    cleanupManifestId: `syn-cleanup-${runId}`,
    effectiveTargetHash: "sha256:syn-target",
    graphToken: "syn-token",
    fetchImpl: async (url, options) => {
      if (options.method === "GET") {
        if (url.includes("/items/marker-1/content")) {
          return { ok: true, status: 200, text: async () => store.runMarkerContent() };
        }
        if (url.includes(":/children")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              value: childPresent
                ? [{ id: "marker-1", name: ".tippani-s0-run", eTag: "marker-etag-1" }]
                : [],
            }),
          };
        }
        if (url.includes(".tippani-s0-run")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "marker-1", eTag: "marker-etag-1" }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ id: "folder-1", eTag: "etag-1" }) };
      }
      if (options.method === "DELETE") {
        if (url.includes("/items/marker-1")) {
          conditionalChildDelete = options.headers["If-Match"] === "marker-etag-1";
          childPresent = false;
        } else {
          folderDeletes++;
        }
        return { ok: true, status: 204 };
      }
      return { ok: true, status: 201, json: async () => ({}) };
    },
  });
  const authorization = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  }, store);
  const wrongManifest = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: "syn-cleanup-wrong" },
    },
  }, store);
  await assert.rejects(store.cleanup(wrongManifest), /manifest authorization/);
  await store.prepareCleanup(authorization);
  assert.equal(
    authorization.resource.condition.expectedMarkerDigest,
    store.runMarkerDigest(),
  );
  await assert.rejects(
    store.cleanup(authorization),
    (error) => error.code === "cleanup_precondition_unavailable",
  );
  assert.equal(conditionalChildDelete, true);
  assert.equal(folderDeletes, 0);
  assert.equal(authorization.manifest.phase(authorization.resource), "mutating");
});

await check("OneDrive cleanup rejects a child ETag change before deletion", async () => {
  const runId = "s0-cleanup-child-change";
  let childETag = "marker-etag-1";
  let deletes = 0;
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    cleanupManifestId: `syn-cleanup-${runId}`,
    effectiveTargetHash: "sha256:syn-target",
    graphToken: "syn-token",
    fetchImpl: async (url, options) => {
      if (options.method === "GET" && url.includes("/items/marker-1/content")) {
        return { ok: true, status: 200, text: async () => store.runMarkerContent() };
      }
      if (options.method === "GET" && url.includes(":/children")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            value: [{
              id: "marker-1",
              name: ".tippani-s0-run",
              eTag: childETag,
            }],
          }),
        };
      }
      if (options.method === "GET" && url.includes(".tippani-s0-run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "marker-1", eTag: childETag }),
        };
      }
      if (options.method === "GET") {
        return { ok: true, status: 200, json: async () => ({ id: "folder-1", eTag: "folder-etag" }) };
      }
      deletes++;
      return { ok: true, status: 204 };
    },
  });
  const authorization = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  }, store);
  await store.prepareCleanup(authorization);
  childETag = "marker-etag-2";
  await assert.rejects(
    store.cleanup(authorization),
    (error) => error.code === "cleanup_conflict" &&
      /children changed/.test(error.message),
  );
  assert.equal(deletes, 0);
  assert.equal(authorization.manifest.phase(authorization.resource), "prepared");
});

await check("OneDrive cleanup rejects ownership marker tampering", async () => {
  const runId = "s0-cleanup-marker-tamper";
  let tampered = false;
  let deletes = 0;
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    cleanupManifestId: `syn-cleanup-${runId}`,
    effectiveTargetHash: "sha256:syn-target",
    graphToken: "syn-token",
    fetchImpl: async (url, options) => {
      if (options.method === "GET" && url.includes("/items/marker-1/content")) {
        return {
          ok: true,
          status: 200,
          text: async () => tampered ? JSON.stringify({ foreign: true }) : store.runMarkerContent(),
        };
      }
      if (options.method === "GET" && url.includes(".tippani-s0-run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "marker-1", eTag: "marker-etag-1" }),
        };
      }
      if (options.method === "GET" && url.includes(":/children")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            value: [{ id: "marker-1", name: ".tippani-s0-run", eTag: "marker-etag-1" }],
          }),
        };
      }
      if (options.method === "GET") {
        return { ok: true, status: 200, json: async () => ({ id: "folder-1", eTag: "etag-1" }) };
      }
      deletes++;
      return { ok: true, status: 204 };
    },
  });
  const authorization = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  }, store);
  await store.prepareCleanup(authorization);
  tampered = true;
  await assert.rejects(
    store.cleanup(authorization),
    (error) => error.code === "cleanup_ownership_mismatch",
  );
  assert.equal(deletes, 0);
  assert.equal(authorization.manifest.phase(authorization.resource), "prepared");
});

await check("cleanup authorization rejects different immutable coordinates", async () => {
  const runId = "s0-cleanup-coordinate-binding";
  const approved = new OneDriveGraphStore({
    dryRun: true,
    driveId: "drive-a",
    folderPath: "Base",
    runId,
    effectiveTargetHash: "sha256:syn-target",
  });
  const authorization = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "drive-a", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  }, approved);
  const different = new OneDriveGraphStore({
    dryRun: true,
    driveId: "drive-b",
    folderPath: "Base",
    runId,
    effectiveTargetHash: "sha256:syn-target",
  });
  await assert.rejects(different.prepareCleanup(authorization), /manifest authorization/);
  const differentTarget = new OneDriveGraphStore({
    dryRun: true,
    driveId: "drive-a",
    folderPath: "Base",
    runId,
    effectiveTargetHash: "sha256:different-target",
  });
  await assert.rejects(differentTarget.prepareCleanup(authorization), /manifest authorization/);
});

await check("OneDrive cleanup rechecks an absent target and rejects concurrent creation", async () => {
  const runId = "s0-cleanup-absent-race";
  let exists = false;
  let deletes = 0;
  const store = new OneDriveGraphStore({
    dryRun: false,
    driveId: "d1",
    folderPath: "Base",
    runId,
    cleanupManifestId: `syn-cleanup-${runId}`,
    effectiveTargetHash: "sha256:syn-target",
    graphToken: "syn-token",
    fetchImpl: async (_url, options) => {
      if (options.method === "GET") {
        return exists
          ? { ok: true, status: 200, json: async () => ({ id: "folder-new", eTag: "etag-new" }) }
          : { ok: false, status: 404, json: async () => ({}) };
      }
      deletes++;
      return { ok: true, status: 204 };
    },
  });
  const authorization = createCleanupAuthorization({
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  }, store);
  await store.prepareCleanup(authorization);
  exists = true;
  await assert.rejects(
    store.cleanup(authorization),
    (error) => error.code === "cleanup_conflict",
  );
  assert.equal(deletes, 0);
  assert.equal(authorization.manifest.phase(authorization.resource), "prepared");
  assert.equal(authorization.manifest.authorize(authorization.resource), true);
});

await check("OneDrive cleanup preserves a child that appears during deletion", async () => {
  const runId = "s0-cleanup-concurrent-child";
  const root = path.join(spikeRoot, ".test-state", runId);
  const manifestPath = path.join(root, "cleanup-manifest.json");
  const config = {
    runId,
    backingPath: "onedrive",
    sandbox: {
      ownershipMarker: `tippani-s0:${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      coordinates: { driveId: "d1", folder: "Base" },
      cleanup: { manifestId: `syn-cleanup-${runId}` },
    },
  };
  let markerPresent = true;
  let concurrentChildPresent = false;
  let folderDeletes = 0;
  let markerContent = null;
  const fetchImpl = async (url, options) => {
    if (options.method === "GET") {
      if (url.includes("/items/marker-1/content")) {
        return { ok: true, status: 200, text: async () => markerContent };
      }
      if (url.includes(":/children")) {
        const value = [];
        if (markerPresent) {
          value.push({ id: "marker-1", name: ".tippani-s0-run", eTag: "marker-etag-1" });
        }
        if (concurrentChildPresent) {
          value.push({ id: "child-2", name: "appeared.json", eTag: "child-etag-2" });
        }
        return { ok: true, status: 200, json: async () => ({ value }) };
      }
      if (url.includes(".tippani-s0-run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "marker-1", eTag: "marker-etag-1" }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ id: "folder-1", eTag: "etag-1" }) };
    }
    if (options.method === "DELETE") {
      if (url.includes("/items/marker-1")) {
        assert.equal(options.headers["If-Match"], "marker-etag-1");
        markerPresent = false;
        concurrentChildPresent = true;
      } else {
        folderDeletes++;
      }
      return { ok: true, status: 204 };
    }
    throw new Error(`Unexpected cleanup method: ${options.method}`);
  };
  fs.rmSync(root, { recursive: true, force: true });
  try {
    const store = new OneDriveGraphStore({
      dryRun: false,
      driveId: "d1",
      folderPath: "Base",
      runId,
      cleanupManifestId: `syn-cleanup-${runId}`,
      effectiveTargetHash: "sha256:syn-target",
      graphToken: "syn-token",
      fetchImpl,
    });
    const authorization = createCleanupAuthorization(config, store, {
      filePath: manifestPath,
    });
    markerContent = store.runMarkerContent();
    await store.prepareCleanup(authorization);
    await assert.rejects(
      store.cleanup(authorization),
      (error) => error.code === "cleanup_conflict" &&
        /appeared/.test(error.message),
    );
    assert.equal(concurrentChildPresent, true);
    assert.equal(folderDeletes, 0);
    assert.equal(CleanupManifest.load(manifestPath).resources[0].phase, "mutating");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await check("provider requests enforce operation, object, byte, and abort budgets", async () => {
    const cases = [
      {
        limits: { maxOperations: 0, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
        setup: () => {},
      },
      {
        limits: { maxOperations: 10, maxObjects: 0, maxBytes: 10000, maxDurationMs: 1000 },
        setup: () => {},
      },
      {
        limits: { maxOperations: 10, maxObjects: 10, maxBytes: 1, maxDurationMs: 1000 },
        setup: () => {},
      },
    ];
    for (const item of cases) {
      let calls = 0;
      const budget = new OperationBudget({ limits: item.limits });
      const store = new OneDriveGraphStore({
        dryRun: false,
        driveId: "d1",
        folderPath: "Base",
        runId: "s0-budget-enforcement",
        graphToken: "syn-token",
        safetyBudget: budget,
        fetchImpl: async () => {
          calls++;
          return { ok: true, status: 201, json: async () => ({}) };
        },
      });
      await assert.rejects(store.initialize(), (error) => error.code === "safety_budget_exceeded");
      assert.equal(calls, 0);
    }

    const abortController = new AbortController();
    abortController.abort();
    let calls = 0;
    const budget = new OperationBudget({
      limits: { maxOperations: 10, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
      signal: abortController.signal,
    });
    const store = new OneDriveGraphStore({
      dryRun: false,
      driveId: "d1",
      folderPath: "Base",
      runId: "s0-budget-abort",
      graphToken: "syn-token",
      safetyBudget: budget,
      signal: abortController.signal,
      fetchImpl: async () => {
        calls++;
        return { ok: true, status: 201, json: async () => ({}) };
      },
    });
    await assert.rejects(store.initialize(), (error) => error.code === "safety_budget_exceeded");
    assert.equal(calls, 0);
  });

await check("an in-flight provider request receives and honors the deadline AbortSignal", async () => {
    const abortController = new AbortController();
    const budget = new OperationBudget({
      limits: { maxOperations: 10, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
      signal: abortController.signal,
    });
    let receivedSignal = false;
    const store = new OneDriveGraphStore({
      dryRun: false,
      driveId: "d1",
      folderPath: "Base",
      runId: "s0-running-abort",
      graphToken: "syn-token",
      safetyBudget: budget,
      signal: abortController.signal,
      fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
        receivedSignal = options.signal === abortController.signal;
        options.signal.addEventListener("abort", () => {
          const error = new Error("request aborted");
          error.code = "request_aborted";
          reject(error);
        }, { once: true });
      }),
    });
    const pending = store.initialize();
    setTimeout(() => abortController.abort(), 5);
    await assert.rejects(
      pending,
      (error) =>
        error.code === "indeterminate_write" &&
        error.requiresReconciliation === true &&
        error.cause?.code === "request_aborted",
    );
    assert.equal(receivedSignal, true);
  });

  await check("maxOperations=1 prevents a retry transport attempt", async () => {
    let calls = 0;
    const budget = new OperationBudget({
      limits: { maxOperations: 1, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
    });
    const store = new GitHubRepoStore({
      dryRun: false,
      owner: "O",
      repo: "R",
      runId: "s0-retry-budget",
      githubToken: "syn-token",
      safetyBudget: budget,
      fetchImpl: async () => {
        calls++;
        throw new TypeError("transient network failure");
      },
    });
    await assert.rejects(
      store.gh("GET", "https://api.github.invalid/retry"),
      (error) => error.code === "safety_budget_exceeded",
    );
    assert.equal(calls, 1);
    assert.equal(budget.snapshot().operations, 1);
  });

  await check("an oversized mutation is rejected before the provider can commit it", async () => {
    let commits = 0;
    const budget = new OperationBudget({
      limits: { maxOperations: 10, maxObjects: 10, maxBytes: 8, maxDurationMs: 1000 },
    });
    const store = new GitHubRepoStore({
      dryRun: false,
      owner: "O",
      repo: "R",
      runId: "s0-byte-budget",
      githubToken: "syn-token",
      safetyBudget: budget,
      fetchImpl: async () => {
        commits++;
        return { ok: true, status: 201, json: async () => ({ content: { sha: "b1" } }) };
      },
    });
    store.initialized = true;
    const workspace = createSyntheticWorkspace({ seed: "oversized-mutation" });
    await assert.rejects(
      store.createWorkspace(workspace),
      (error) => error.code === "safety_budget_exceeded",
    );
    assert.equal(commits, 0);
    assert.equal(store.liveProviderCallCount(), 0);
  });

  await check("Content-Length rejects before body read but classifies a sent mutation as indeterminate", async () => {
    let commits = 0;
    let bodyReads = 0;
    const budget = new OperationBudget({
      limits: { maxOperations: 10, maxObjects: 10, maxBytes: 4, maxDurationMs: 1000 },
    });
    const store = new GitHubRepoStore({
      dryRun: false,
      owner: "O",
      repo: "R",
      runId: "s0-response-length-budget",
      githubToken: "syn-token",
      safetyBudget: budget,
      fetchImpl: async () => {
        commits++;
        return {
          ok: true,
          status: 201,
          headers: new Headers({ "Content-Length": "10" }),
          json: async () => {
            bodyReads++;
            return { ok: true };
          },
        };
      },
    });
    await assert.rejects(
      store.gh("POST", "https://api.github.invalid/mutation", { body: "x" }),
      (error) =>
        error.code === "indeterminate_write" &&
        error.requiresReconciliation === true &&
        error.reason === "response_content_length_overrun",
    );
    assert.equal(commits, 1, "the provider mutation was already sent");
    assert.equal(bodyReads, 0, "Content-Length must be checked before reading the body");
  });

  await check("actual consumed response bytes can make a committed mutation indeterminate", async () => {
    const responseBody = JSON.stringify({ committed: true, padding: "1234567890" });
    let commits = 0;
    const budget = new OperationBudget({
      limits: { maxOperations: 10, maxObjects: 10, maxBytes: 8, maxDurationMs: 1000 },
    });
    const store = new GitHubRepoStore({
      dryRun: false,
      owner: "O",
      repo: "R",
      runId: "s0-response-body-budget",
      githubToken: "syn-token",
      safetyBudget: budget,
      fetchImpl: async () => {
        commits++;
        return new Response(responseBody, { status: 201 });
      },
    });
    const response = await store.gh(
      "POST",
      "https://api.github.invalid/mutation",
      { body: "x" },
    );
    await assert.rejects(
      response.json(),
      (error) =>
        error.code === "indeterminate_write" &&
        error.requiresReconciliation === true &&
        error.reason === "response_body_overrun",
    );
    assert.equal(commits, 1);
    assert.equal(store.providerTelemetry().responseBytes, Buffer.byteLength(responseBody));
    assert.equal(store.providerTelemetry().failures.indeterminate_write, 1);
    assert.equal(budget.snapshot().bytes, 1 + Buffer.byteLength(responseBody));
  });

  await check("provider workers share one run-wide operation allowance", async () => {
    const budget = new OperationBudget({
      limits: { maxOperations: 1, maxObjects: 10, maxBytes: 10000, maxDurationMs: 1000 },
    });
    const args = () => ["--mode=budget-probe", "--provider-live=true", "--deadline-ms=1000"];
    const results = await raceWorkers([args(), args()], { budget, timeoutMs: 5000 });
    assert.equal(results.filter((result) => result.report?.status === "budget-consumed").length, 1);
    assert.equal(results.filter((result) => result.report?.code === "safety_budget_exceeded").length, 1);
    assert.equal(budget.snapshot().operations, 1);
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
