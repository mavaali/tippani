import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createStore as createAdapterStore, isDurable } from "./adapters/registry.mjs";
import { assertPreflight } from "./preflight.mjs";
import { SCENARIO_IMPLEMENTATIONS, PENDING_REASONS } from "./scenario-implementations.mjs";
import { BLOCKED_REASONS } from "./provider-gates.mjs";
import {
  SCENARIOS,
  scenarioById,
  validateScenarioCatalog,
} from "./scenario-catalog.mjs";
import { assertWorkspaceStore } from "./workspace-contract.mjs";
import { writeRunArtifacts } from "./result-writer.mjs";

function errorSummary(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || "scenario_failed",
    message: String(error?.message || error),
  };
}

/**
 * Each scenario gets isolated store roots. Repeat calls to createStore() reopen
 * the SAME root - that is what makes restart evidence meaningful for a durable
 * adapter - while createStore({ fresh: true }) allocates a separate root for
 * source/target comparisons.
 */
function createScenarioContext({ config, scenarioId, adapterFactory, runRoot }) {
  const roots = [];
  const openStores = [];
  let index = 0;

  const allocateRoot = () => {
    const root = path.join(runRoot, `${scenarioId}-${index++}`);
    fs.mkdirSync(root, { recursive: true });
    roots.push(root);
    return root;
  };

  const primaryRoot = allocateRoot();
  const createStore = ({ fresh = false } = {}) => {
    const storeRoot = fresh ? allocateRoot() : primaryRoot;
    const store = assertWorkspaceStore(adapterFactory({ ...config, storeRoot }));
    openStores.push(store);
    return store;
  };

  return {
    config,
    scenario: scenarioById(scenarioId),
    durable: isDurable(config.adapter),
    adapter: config.adapter,
    primaryRoot,
    createStore,
    // Kept so negative-control tests can inject their own factory.
    adapterFactory: () => createStore(),
    async cleanup() {
      for (const store of openStores) {
        try { await store.close(); } catch { /* best effort */ }
      }
      if (config.keepStoreArtifacts) return;
      for (const root of roots) {
        try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
      }
    },
  };
}

export async function runHarness({
  config,
  outputDir,
  scenarioIds = config.scenarioIds,
  adapterFactory = null,
  writeArtifacts = true,
  harnessRevision = "s0-harness-v2",
} = {}) {
  validateScenarioCatalog();
  const preflight = assertPreflight(config);
  const factory = adapterFactory ||
    ((options) => createAdapterStore(config.adapter, options));

  const selected = scenarioIds || Object.keys(SCENARIO_IMPLEMENTATIONS);
  const unknown = selected.filter((id) => !scenarioById(id));
  if (unknown.length) throw new Error(`Unknown scenario IDs: ${unknown.join(", ")}`);
  if (selected.length > config.budgets.maxOperations) {
    throw new Error("Selected scenarios exceed the operation budget");
  }

  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `tippani-s0-${config.runId}-`));
  const startedAt = new Date().toISOString();
  const deadline = performance.now() + config.budgets.maxDurationMs;
  const results = [];

  try {
    for (const scenarioId of selected) {
      const scenario = scenarioById(scenarioId);
      const implementation = SCENARIO_IMPLEMENTATIONS[scenarioId];
      const base = {
        scenarioId,
        title: scenario.title,
        criterionType: scenario.criterionType,
      };

      if (performance.now() > deadline) {
        results.push({
          ...base,
          status: "Blocked",
          durationMs: 0,
          reason: "Run duration budget exhausted",
        });
        continue;
      }
      if (!implementation) {
        const blockedReason = BLOCKED_REASONS[scenarioId];
        results.push({
          ...base,
          status: blockedReason ? "Blocked" : "Incomplete",
          durationMs: 0,
          reason: blockedReason ||
            PENDING_REASONS[scenarioId] ||
            "Scenario implementation is not available for this harness stage",
        });
        continue;
      }

      const context = createScenarioContext({
        config,
        scenarioId,
        adapterFactory: factory,
        runRoot,
      });
      const scenarioStarted = performance.now();
      try {
        const detail = await implementation(context);
        if (detail?.blocked) {
          results.push({
            ...base,
            status: "Blocked",
            durationMs: performance.now() - scenarioStarted,
            reason: detail.blocked,
          });
        } else if (detail?.skip) {
          results.push({
            ...base,
            status: "Incomplete",
            durationMs: performance.now() - scenarioStarted,
            reason: detail.skip,
          });
        } else {
          results.push({
            ...base,
            status: "Pass",
            durationMs: performance.now() - scenarioStarted,
            evidence: detail?.evidence || {},
            measurements: detail?.measurements || {},
          });
        }
      } catch (error) {
        results.push({
          ...base,
          status: "Fail",
          durationMs: performance.now() - scenarioStarted,
          evidence: {},
          measurements: {},
          error: errorSummary(error),
        });
      } finally {
        await context.cleanup();
      }
    }
  } finally {
    // Tear down a live provider run's per-run namespace (best effort).
    if (config.dryRun === false && ["onedrive", "ado", "github"].includes(config.backingPath)) {
      try {
        const teardown = createAdapterStore(config.adapter, { ...config });
        if (typeof teardown.cleanup === "function") await teardown.cleanup();
      } catch { /* best effort */ }
    }
    if (!config.keepStoreArtifacts) {
      try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  const run = {
    schemaVersion: 1,
    syntheticData: true,
    harnessRevision,
    startedAt,
    completedAt: new Date().toISOString(),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      platform: config.platform,
      scale: config.scale,
      runId: config.runId,
      durable: isDurable(config.adapter),
      host: `${process.platform} ${process.arch} node ${process.versions.node}`,
    },
    preflight,
    catalogSize: SCENARIOS.length,
    catalog: SCENARIOS.map((scenario) => ({
      id: scenario.id,
      criterionType: scenario.criterionType,
      title: scenario.title,
    })),
    results,
  };
  const artifacts = writeArtifacts ? writeRunArtifacts(run, outputDir) : null;
  return { run, artifacts };
}
