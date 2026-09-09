import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { applicableScenarioIds, applicabilityProfile } from "./applicability.mjs";
import { createStore as createAdapterStore, isDurable } from "./adapters/registry.mjs";
import { buildEvidenceIdentity } from "./evidence-identity.mjs";
import { OperationBudget } from "./operation-budget.mjs";
import {
  assertPreflight,
  resolveEffectiveProviderConfig,
  withResolvedProviderIdentity,
} from "./preflight.mjs";
import { createCleanupAuthorization } from "./cleanup-manifest.mjs";
import { ProviderTelemetry } from "./adapters/provider-telemetry.mjs";
import { resolveProviderIdentityForConfig } from "./provider-identity.mjs";
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

const LIVE_PROVIDER_ENV = Object.freeze({
  onedrive: ["S0_ONEDRIVE_TOKEN", "S0_ONEDRIVE_DRIVE_ID", "S0_ONEDRIVE_FOLDER"],
  ado: ["S0_ADO_TOKEN", "S0_ADO_ORG", "S0_ADO_PROJECT", "S0_ADO_REPO"],
  github: ["S0_GITHUB_TOKEN", "S0_GITHUB_OWNER", "S0_GITHUB_REPO"],
});
const LIVE_APPROVAL_ENV = Object.freeze([
  "S0_PREFLIGHT_APPROVER",
  "S0_PREFLIGHT_APPROVED_AT",
  "S0_PREFLIGHT_APPROVAL_REFERENCE",
  "S0_PREFLIGHT_TARGET_HASH",
]);

function missingProviderEnvironment(config) {
  if (config.dryRun !== false) return [];
  return [...(LIVE_PROVIDER_ENV[config.backingPath] || []), ...LIVE_APPROVAL_ENV]
    .filter((name) => !process.env[name]);
}

function requiresLiveProvider(scenarioId) {
  return !scenarioId.startsWith("S0-SEC-") &&
    !["S0-PER-005", "S0-BCK-006"].includes(scenarioId);
}

function environmentDetails(config, runRoot) {
  const cpu = os.cpus()[0];
  const providerApiVersion = {
    onedrive: "Microsoft Graph v1.0",
    ado: "Azure DevOps Git REST 7.1",
    github: "GitHub REST 2022-11-28",
    local: "N/A",
  }[config.backingPath] || "Not recorded";
  return {
    os: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    cpuModel: cpu?.model || "unknown",
    logicalCpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    nodeVersion: process.versions.node,
    providerApiVersion,
    configuredPlatform: process.env.S0_PLATFORM_DESCRIPTION || config.platform,
    filesystem: process.env.S0_FILESYSTEM_DESCRIPTION || "Not recorded",
    temporaryStoreRoot: path.basename(runRoot),
    networkCharacteristics: process.env.S0_NETWORK_DESCRIPTION || "Not recorded",
    providerRegion: process.env.S0_PROVIDER_REGION || "Not recorded",
    storageCharacteristics: process.env.S0_STORAGE_DESCRIPTION || "Not recorded",
    syncClientState: process.env.S0_SYNC_CLIENT_STATE || "Not applicable",
    repositoryProtections: process.env.S0_REPOSITORY_PROTECTIONS || "Not recorded",
    dependencyVersions: `node=${process.versions.node}; sqlite=${process.versions.sqlite || "built-in"}`,
    workloadMix: "scenario-defined deterministic small/medium/stress fixtures",
    knownLimitations: process.env.S0_ENVIRONMENT_LIMITATIONS || "None recorded",
    processTopology: config.backingPath === "local"
      ? "Independent OS child processes for concurrency and kill tests"
      : config.dryRun === false
        ? "Scenario-dependent: distinct child PIDs are required and recorded for collaboration gates"
        : "In-process provider transport emulation; cannot satisfy distinct-process gates",
  };
}

/**
 * Each scenario gets isolated store roots. Repeat calls to createStore() reopen
 * the SAME root - that is what makes restart evidence meaningful for a durable
 * adapter - while createStore({ fresh: true }) allocates a separate root for
 * source/target comparisons.
 */
function createScenarioContext({
  config,
  scenarioId,
  adapterFactory,
  runRoot,
  signal,
  deadlineAt,
  safetyBudget,
  providerMarkerContext,
}) {
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
    signal,
    deadlineAt,
    safetyBudget,
    providerMarkerContext,
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
  identityResolver = null,
  identityFetchImpl = null,
  writeArtifacts = true,
  harnessRevision = "s0-harness-v4",
} = {}) {
  config = resolveEffectiveProviderConfig(config);
  validateScenarioCatalog();
  const preflightTime = new Date();
  const applicableIds = applicableScenarioIds(config);
  const missingProviderEnv = adapterFactory ? [] : missingProviderEnvironment(config);
  const abortController = new AbortController();
  const deadlineAt = performance.now() + config.budgets.maxDurationMs;
  const safetyBudget = new OperationBudget({
    limits: config.budgets,
    signal: abortController.signal,
    deadlineAt,
  });
  const deadlineTimer = setTimeout(
    () => abortController.abort(),
    Math.max(0, deadlineAt - performance.now()),
  );
  deadlineTimer.unref?.();
  const liveProviderRun = config.dryRun === false &&
    ["onedrive", "ado", "github"].includes(config.backingPath);
  let preflight;
  let identityTelemetrySnapshot = null;
  try {
    if (liveProviderRun && missingProviderEnv.length === 0) {
      const identityTelemetry = new ProviderTelemetry({ safetyBudget });
      const identity = await resolveProviderIdentityForConfig(config, {
        identityResolver,
        fetchImpl: identityFetchImpl || config.fetchImpl || globalThis.fetch,
        signal: abortController.signal,
        beforeAttempt: () => identityTelemetry.recordRequest(),
        wrapResponse: (response) => identityTelemetry.wrapResponse(response),
      });
      identityTelemetrySnapshot = identityTelemetry.snapshot();
      config = withResolvedProviderIdentity(config, identity);
      preflight = assertPreflight(config, preflightTime);
    } else {
      preflight = assertPreflight(config, preflightTime, { requireApproval: false });
    }
  } catch (error) {
    clearTimeout(deadlineTimer);
    throw error;
  }
  const evidenceIdentity = buildEvidenceIdentity(config);
  const factory = adapterFactory ||
    ((options) => createAdapterStore(config.adapter, {
      ...options,
      safetyBudget,
      signal: abortController.signal,
      enforcePreflight: config.dryRun === false,
    }));
  const selected = scenarioIds || config.scenarioIds || applicableIds;
  const unknown = selected.filter((id) => !scenarioById(id));
  if (unknown.length) {
    clearTimeout(deadlineTimer);
    throw new Error(`Unknown scenario IDs: ${unknown.join(", ")}`);
  }
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), `tippani-s0-${config.runId}-`));
  let cleanupAuthorization = null;
  try {
    if (liveProviderRun && !adapterFactory) {
      const descriptor = createAdapterStore(config.adapter, {
        ...config,
        enforcePreflight: true,
      });
      const manifestPath = path.join(outputDir || runRoot, "cleanup-manifest.json");
      cleanupAuthorization = createCleanupAuthorization(config, descriptor, {
        filePath: manifestPath,
      });
    }
  } catch (error) {
    clearTimeout(deadlineTimer);
    if (!config.keepStoreArtifacts) {
      try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    throw error;
  }
  const startedAt = preflightTime.toISOString();
  const results = [];
  let cleanupEvidence = { required: liveProviderRun, status: liveProviderRun ? "pending" : "not-applicable" };

  try {
    for (const scenarioId of selected) {
      const scenario = scenarioById(scenarioId);
      const implementation = SCENARIO_IMPLEMENTATIONS[scenarioId];
      const base = {
        scenarioId,
        title: scenario.title,
        criterionType: scenario.criterionType,
      };

      if (abortController.signal.aborted || performance.now() > deadlineAt) {
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
      if (missingProviderEnv.length && requiresLiveProvider(scenarioId)) {
        results.push({
          ...base,
          status: "Blocked",
          durationMs: 0,
          reason: `Live provider runtime variables not supplied: ${missingProviderEnv.join(", ")}`,
        });
        continue;
      }

      const context = createScenarioContext({
        config,
        scenarioId,
        adapterFactory: factory,
        runRoot,
        signal: abortController.signal,
        deadlineAt,
        safetyBudget,
        providerMarkerContext: cleanupAuthorization ? {
          manifestNonce: cleanupAuthorization.manifest.manifestNonce,
          manifestId: cleanupAuthorization.manifest.manifestId,
          effectiveTargetHash: cleanupAuthorization.manifest.effectiveTargetHash,
          ownershipMarker: cleanupAuthorization.manifest.ownershipMarker,
          namespace: config.sandbox?.namespace,
        } : null,
      });
      const scenarioStarted = performance.now();
      try {
        const detail = await implementation(context);
        await safetyBudget.assertActive();
        if (detail?.blocked) {
          results.push({
            ...base,
            status: "Blocked",
            durationMs: performance.now() - scenarioStarted,
            reason: detail.blocked,
          });
        } else if (detail?.na) {
          const approval = detail.naApproval;
          const contractRationale = detail.contractRationale;
          const completeApproval = approval &&
            typeof approval.approver === "string" && approval.approver.trim() &&
            typeof approval.approvedAt === "string" && Number.isFinite(Date.parse(approval.approvedAt)) &&
            Date.parse(approval.approvedAt) <= preflightTime.getTime() &&
            typeof approval.reference === "string" && approval.reference.trim();
          const completeRationale = contractRationale &&
            contractRationale.scenarioId === scenarioId &&
            typeof contractRationale.rationale === "string" &&
            contractRationale.rationale.trim();
          results.push(completeApproval && completeRationale ? {
            ...base,
            status: "N/A",
            durationMs: performance.now() - scenarioStarted,
            reason: detail.na,
            approval: { ...approval },
            contractRationale: { ...contractRationale },
          } : {
            ...base,
            status: "Incomplete",
            durationMs: performance.now() - scenarioStarted,
            reason: `N/A claim lacks structured approval or scenario-specific rationale: ${detail.na}`,
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
    // Tear down a live provider run's per-run namespace under the same approved
    // operation budget and deadline as identity resolution and scenario work.
    if (liveProviderRun && !adapterFactory) {
      const budgetBefore = safetyBudget.snapshot();
      let teardown = null;
      try {
        teardown = createAdapterStore(config.adapter, {
          ...config,
          safetyBudget,
          signal: abortController.signal,
          enforcePreflight: true,
        });
        if (typeof teardown.cleanup === "function") {
          if (typeof teardown.prepareCleanup === "function" &&
              !cleanupAuthorization.resource.condition) {
            await teardown.prepareCleanup(cleanupAuthorization);
          }
          const outcome = await teardown.cleanup(cleanupAuthorization);
          cleanupEvidence = { required: true, status: "complete", outcome };
        } else {
          cleanupEvidence = {
            required: true,
            status: "failed",
            error: {
              name: "WorkspaceStoreError",
              code: "cleanup_unavailable",
              message: "Provider adapter has no cleanup operation",
            },
          };
        }
      } catch (error) {
        cleanupEvidence = { required: true, status: "failed", error: errorSummary(error) };
        const cleanupGate = results.find((result) => result.scenarioId === "S0-SEC-005");
        if (cleanupGate) {
          cleanupGate.status = "Fail";
          cleanupGate.error = errorSummary(error);
          delete cleanupGate.reason;
          delete cleanupGate.evidence;
        }
      } finally {
        cleanupEvidence = {
          ...cleanupEvidence,
          budgeted: teardown?.safetyBudget === safetyBudget,
          budgetSource: "preflight.budgets",
          sharedDeadline: teardown?.signal === abortController.signal,
          budgetBefore,
          budgetAfter: safetyBudget.snapshot(),
          providerTelemetry: teardown?.providerTelemetry?.() || null,
          manifest: cleanupAuthorization?.manifest?.evidence?.() || null,
          manifestDocument: cleanupAuthorization?.manifest?.toJSON?.() || null,
        };
      }
    }
    const budgetGate = results.find((result) => result.scenarioId === "S0-SEC-006");
    if (liveProviderRun && !adapterFactory && budgetGate?.status === "Pass" &&
        (cleanupEvidence.budgeted !== true || cleanupEvidence.sharedDeadline !== true)) {
      budgetGate.status = "Fail";
      budgetGate.error = {
        name: "WorkspaceStoreError",
        code: "cleanup_budget_unverified",
        message: "Cleanup did not use the approved shared budget and deadline",
      };
      delete budgetGate.evidence;
    } else if (liveProviderRun && !adapterFactory && budgetGate?.status === "Pass") {
      budgetGate.evidence = {
        ...(budgetGate.evidence || {}),
        cleanupBudgeted: true,
        cleanupSharedDeadline: true,
      };
    }
    clearTimeout(deadlineTimer);
    if (!config.keepStoreArtifacts) {
      try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  const run = {
    schemaVersion: 2,
    syntheticData: true,
    harnessRevision,
    evidenceIdentity,
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
      applicabilityProfile: applicabilityProfile(config),
    },
    preflight,
    environment: environmentDetails(config, runRoot),
    applicableScenarioIds: applicableIds,
    catalogSize: SCENARIOS.length,
    catalog: SCENARIOS.map((scenario) => ({
      id: scenario.id,
      criterionType: scenario.criterionType,
      title: scenario.title,
      section: scenario.section,
    })),
    results,
    safetyBudget: safetyBudget.snapshot(),
    budgetTelemetry: {
      identity: identityTelemetrySnapshot,
      cleanup: cleanupEvidence.providerTelemetry || null,
      final: safetyBudget.snapshot(),
    },
    cleanup: cleanupEvidence,
  };
  const artifacts = writeArtifacts ? writeRunArtifacts(run, outputDir) : null;
  return { run, artifacts };
}
