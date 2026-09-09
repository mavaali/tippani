#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCHITECTURE_MAPPINGS,
  applicableScenarioIds,
  applicabilityProfile,
  configurationDefinition,
  validateApplicability,
} from "./applicability.mjs";
import {
  buildEvidenceIdentity,
  decisionConfigRevision,
  sha256,
  stableJson,
} from "./evidence-identity.mjs";
import {
  effectiveResult,
  gateSummary,
  naApprovalErrors,
} from "./eligibility.mjs";
import { runHarness } from "./runner.mjs";
import { combineResults, campaignVariability } from "./aggregate-campaigns.mjs";
import { verifyRetainedSyncProof } from "./sync-evidence.mjs";
import { SCENARIOS } from "./scenario-catalog.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RESULT_STATUSES = new Set(["Pass", "Fail", "Blocked", "Incomplete", "N/A"]);

function currentCatalog() {
  return SCENARIOS.map((scenario) => ({
    id: scenario.id,
    criterionType: scenario.criterionType,
    title: scenario.title,
    section: scenario.section,
  }));
}

function verifyLinkedArtifact(baseDirectory, relativePath, expectedDigest, confineRoot = baseDirectory) {
  if (typeof relativePath !== "string" || !relativePath ||
      typeof expectedDigest !== "string" || !expectedDigest.startsWith("sha256:")) {
    return "artifact path/digest is missing";
  }
  const resolved = path.resolve(baseDirectory, relativePath);
  const relative = path.relative(confineRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return confineRoot === baseDirectory
      ? "artifact path escapes the configuration result directory"
      : "artifact path escapes the results directory";
  }
  if (!fs.existsSync(resolved)) return `artifact is missing: ${relativePath}`;
  const actual = `sha256:${sha256(fs.readFileSync(resolved))}`;
  return actual === expectedDigest ? null : `artifact digest mismatch: ${relativePath}`;
}

function readLinkedRun(baseDirectory, relativePath, confineRoot) {
  if (typeof relativePath !== "string" || !relativePath) return { error: "linked raw path is missing" };
  const resolved = path.resolve(baseDirectory, relativePath);
  const relative = path.relative(confineRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { error: "linked raw path escapes the results directory" };
  }
  if (!fs.existsSync(resolved)) return { error: `linked raw is missing: ${relativePath}` };
  try {
    return { run: JSON.parse(fs.readFileSync(resolved, "utf8")) };
  } catch (error) {
    return { error: `linked raw is unreadable: ${error.message}` };
  }
}

function validateLinkedRunIdentity(linked, config, label) {
  const errors = [];
  if (linked?.schemaVersion !== 2) {
    errors.push(`${label} linked raw has an unsupported or missing result schemaVersion`);
  }
  if (stableJson(linked?.evidenceIdentity) !== stableJson(buildEvidenceIdentity(config))) {
    errors.push(`${label} linked raw source/catalog/applicability/config identity does not match the current configuration`);
  }
  if (linked?.configuration?.configurationId !== config.configurationId) {
    errors.push(`${label} linked raw belongs to a different configuration`);
  }
  const linkedResults = Array.isArray(linked?.results) ? linked.results : [];
  const ids = linkedResults.map((result) => result.scenarioId);
  if (new Set(ids).size !== ids.length) errors.push(`${label} linked raw has duplicate scenario results`);
  for (const result of linkedResults) {
    if (!RESULT_STATUSES.has(result.status)) {
      errors.push(`${label} linked raw has an invalid status for ${result.scenarioId}`);
    }
  }
  return { errors, linkedResults };
}

// A byte-hash proves the linked file is unmodified; it does not prove the file
// belongs to this aggregate. This parses every linked campaign raw, validates
// its evidence identity and result schema, and recomputes the aggregate status
// and per-campaign positions so a Pass cannot be claimed against an unrelated or
// stale run.
const NONDETERMINISTIC_RESULT_KEYS = new Set(["durationMs"]);
const SYNC_AGGREGATE_ANNOTATIONS = new Set(["separateCompatibilityReport", "providerCampaigns"]);

// Strips only explicitly nondeterministic metadata so the complete recomputed
// result (status, measurements, raw samples, throttle/retry totals, complexity,
// N/A approvals, positions, and all evidence) is compared canonically.
function canonicalResult(result) {
  if (!result || typeof result !== "object") return result;
  return Object.fromEntries(
    Object.entries(result).filter(([key]) => !NONDETERMINISTIC_RESULT_KEYS.has(key)),
  );
}

function canonicalSyncResult(result) {
  const base = canonicalResult(effectiveResult(result));
  if (base && base.evidence && typeof base.evidence === "object") {
    base.evidence = Object.fromEntries(
      Object.entries(base.evidence).filter(([key]) => !SYNC_AGGREGATE_ANNOTATIONS.has(key)),
    );
  }
  return base;
}

export function verifyLinkedCampaigns(run, config, { artifactPath = null } = {}) {
  const errors = [];
  if (!artifactPath) return errors;
  const baseDirectory = path.dirname(artifactPath);
  const resultsRoot = path.dirname(baseDirectory);
  const campaigns = Array.isArray(run?.campaigns) ? run.campaigns : [];
  const approvalByName = new Map(
    (Array.isArray(run?.campaignApprovals) ? run.campaignApprovals : []).map((item) => [item.name, item]),
  );
  const linkedCampaigns = [];
  let recomputable = campaigns.length > 0;
  for (const campaign of campaigns) {
    const label = campaign?.name || "campaign";
    const { run: linked, error } = readLinkedRun(baseDirectory, campaign?.raw, resultsRoot);
    if (error) { errors.push(`${label} ${error}`); recomputable = false; continue; }
    const { errors: identityErrors } = validateLinkedRunIdentity(linked, config, label);
    if (identityErrors.length) { errors.push(...identityErrors); recomputable = false; }
    if (linked?.configuration?.runId !== campaign?.runId) {
      errors.push(`${label} linked raw runId does not match the aggregate campaign entry`);
      recomputable = false;
    }
    const linkedSandbox = linked?.preflight?.sandbox || {};
    const claimedApproval = approvalByName.get(campaign?.name);
    if (!claimedApproval || claimedApproval.effectiveTargetHash !== linkedSandbox.effectiveTargetHash) {
      errors.push(`${label} approval target hash does not match the linked preflight`);
    }
    if (stableJson(claimedApproval?.approval) !== stableJson(linkedSandbox.approval)) {
      errors.push(`${label} approval record does not match the linked preflight`);
    }
    linkedCampaigns.push({ name: campaign?.name, run: linked });
  }
  const claimedResults = Array.isArray(run?.results) ? run.results : [];
  const campaignVariabilityValue = run?.campaignVariability;
  const campaignVariabilityIsObject = campaignVariabilityValue !== null &&
    typeof campaignVariabilityValue === "object" &&
    !Array.isArray(campaignVariabilityValue);
  if (!run || !("campaignVariability" in run)) {
    errors.push("aggregate is missing campaignVariability");
  } else if (!campaignVariabilityIsObject) {
    errors.push("aggregate campaignVariability must be a non-null plain object");
  }
  if (!recomputable || linkedCampaigns.length !== campaigns.length) {
    for (const result of claimedResults) {
      if (result.scenarioId === "S0-BCK-006") continue;
      errors.push(`${result.scenarioId} is not backed by every linked campaign raw`);
    }
    return errors;
  }
  const expectedIds = (Array.isArray(run?.applicableScenarioIds) ? run.applicableScenarioIds : [])
    .filter((id) => id !== "S0-BCK-006");
  let recomputed;
  try {
    recomputed = combineResults(linkedCampaigns, expectedIds);
  } catch (error) {
    errors.push(`linked campaigns could not be recomputed: ${error.message}`);
    return errors;
  }
  const recById = new Map(recomputed.map((result) => [result.scenarioId, result]));
  for (const result of claimedResults) {
    if (result.scenarioId === "S0-BCK-006") continue;
    const rec = recById.get(result.scenarioId);
    if (!rec) { errors.push(`${result.scenarioId} is not backed by every linked campaign raw`); continue; }
    if (stableJson(canonicalResult(rec)) !== stableJson(canonicalResult(result))) {
      errors.push(`${result.scenarioId} aggregate result does not match the recomputed linked-campaign result`);
    }
  }
  // campaignVariability is always required as a non-null plain object and is
  // compared directly (never coerced) with the recomputed object, which is an
  // explicit empty object when no per-campaign variability exists.
  const recomputedVariability = campaignVariability(linkedCampaigns) || {};
  if (campaignVariabilityIsObject &&
      stableJson(campaignVariabilityValue) !== stableJson(recomputedVariability)) {
    errors.push("aggregate campaignVariability does not match the recomputed linked-campaign variability");
  }
  return errors;
}

export function verifySeparateSync(run, config, { artifactPath = null } = {}) {
  const errors = [];
  const sync = run?.separateSync;
  if (!sync || typeof sync !== "object") {
    errors.push("missing separate OneDrive synced-folder (S0-BCK-006) evidence record");
    return errors;
  }
  if (stableJson(sync.evidenceIdentity) !== stableJson(buildEvidenceIdentity(config))) {
    errors.push("separate synced-folder evidence is stale or bound to a mismatched configuration");
  }
  const aggregateResult = run.results?.find((result) => result.scenarioId === "S0-BCK-006");
  if (!aggregateResult) {
    errors.push("aggregate is missing the resolved S0-BCK-006 synced-folder result");
  }
  if (artifactPath) {
    const baseDirectory = path.dirname(artifactPath);
    const resultsRoot = path.dirname(baseDirectory);
    for (const issue of [
      verifyLinkedArtifact(baseDirectory, sync.raw, sync.rawSha256, resultsRoot),
      verifyLinkedArtifact(baseDirectory, sync.report, sync.reportSha256, resultsRoot),
    ].filter(Boolean)) {
      errors.push(`separate synced-folder ${issue}`);
    }
    const { run: linked, error } = readLinkedRun(baseDirectory, sync.raw, resultsRoot);
    if (error) {
      errors.push(`separate synced-folder ${error}`);
    } else {
      const { errors: identityErrors, linkedResults } =
        validateLinkedRunIdentity(linked, config, "separate synced-folder");
      errors.push(...identityErrors);
      const linkedBck = linkedResults.find((result) => result.scenarioId === "S0-BCK-006");
      if (!linkedBck) {
        errors.push("separate synced-folder linked raw has no S0-BCK-006 result");
      } else {
        const linkedStatus = effectiveResult(linkedBck).status;
        // Compare the COMPLETE linked result against the aggregate claim, not
        // status only (aggregate-only annotations are excluded).
        if (aggregateResult &&
            stableJson(canonicalSyncResult(linkedBck)) !== stableJson(canonicalSyncResult(aggregateResult))) {
          errors.push("aggregate S0-BCK-006 result does not match the linked sync run result");
        }
        // A retained S0-BCK-006 Pass must carry a full signed proof that
        // re-verifies against the independent retained authorization context and
        // the original validation time (never the proof's own fields).
        if (linkedStatus === "Pass") {
          const proofErrors = verifyRetainedSyncProof({
            linkedResult: linkedBck,
            separateRecord: sync,
            linkedCompletedAt: linked?.completedAt || null,
            expectedConfigRevision: decisionConfigRevision(config),
            expectedSignerFingerprint: config?.sandbox?.syncProfile?.trustedSignerFingerprint || null,
            providerApprovalTargetHashes: (run?.campaignApprovals || [])
              .map((campaign) => campaign?.effectiveTargetHash)
              .filter((value) => typeof value === "string" && value),
          });
          for (const issue of proofErrors) {
            errors.push(`separate synced-folder proof ${issue}`);
          }
        }
      }
    }
  }
  return errors;
}

export function validateExistingRun(run, config, { artifactPath = null } = {}) {
  const errors = [];
  const completedAt = Date.parse(run?.completedAt);
  const approvalNow = Number.isFinite(completedAt) ? completedAt : Date.now();
  const expectedIdentity = buildEvidenceIdentity(config);
  const expectedApplicable = applicableScenarioIds(config);
  const expectedCatalog = currentCatalog();
  if (run?.schemaVersion !== 2) errors.push("unsupported or missing result schemaVersion");
  for (const [name, expected] of Object.entries(expectedIdentity)) {
    if (run?.evidenceIdentity?.[name] !== expected) errors.push(`${name} is stale or missing`);
  }
  if (run?.configuration?.configurationId !== config.configurationId) {
    errors.push("configurationId does not match the selected config");
  }
  if (run?.configuration?.adapter !== config.adapter ||
      run?.configuration?.backingPath !== config.backingPath ||
      run?.configuration?.applicabilityProfile !== applicabilityProfile(config)) {
    errors.push("adapter/backing-path/applicability identity does not match");
  }
  if (stableJson(run?.catalog) !== stableJson(expectedCatalog)) {
    errors.push("catalog snapshot does not match the current catalog");
  }
  if (stableJson(run?.applicableScenarioIds) !== stableJson(expectedApplicable)) {
    errors.push("applicable scenario set does not match the current profile");
  }
  const results = Array.isArray(run?.results) ? run.results : [];
  const ids = results.map((result) => result.scenarioId);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) errors.push(`duplicate result for ${duplicate}`);
  const missing = expectedApplicable.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !expectedApplicable.includes(id));
  if (missing.length) errors.push(`missing expected results: ${missing.join(", ")}`);
  if (unexpected.length) errors.push(`unexpected results: ${unexpected.join(", ")}`);
  for (const result of results) {
    if (!RESULT_STATUSES.has(result.status)) errors.push(`unknown status for ${result.scenarioId}`);
    const approvalErrors = naApprovalErrors(result, { now: approvalNow });
    if (approvalErrors.length) {
      errors.push(`${result.scenarioId} N/A lacks ${approvalErrors.join(", ")}`);
    }
  }
  if (["onedrive", "ado", "github"].includes(config.backingPath) && config.dryRun === false) {
    if (run?.configuration?.campaignCount !== 3 || run?.campaigns?.length !== 3) {
      errors.push("provider aggregate must contain exactly three retained campaigns");
    }
    const campaigns = run?.campaigns || [];
    const unique = (values) => new Set(values).size === values.length;
    if (!unique(campaigns.map((item) => item.name)) ||
        !unique(campaigns.map((item) => item.runId)) ||
        !unique(campaigns.map((item) => item.raw)) ||
        !unique(campaigns.map((item) => item.rawSha256)) ||
        !unique(campaigns.map((item) => item.report)) ||
        !unique(campaigns.map((item) => item.reportSha256))) {
      errors.push("provider campaigns must have distinct names, run IDs, and artifact paths/digests");
    }
    if (artifactPath) {
      const baseDirectory = path.dirname(artifactPath);
      for (const campaign of campaigns) {
        for (const issue of [
          verifyLinkedArtifact(baseDirectory, campaign.raw, campaign.rawSha256),
          verifyLinkedArtifact(baseDirectory, campaign.report, campaign.reportSha256),
        ].filter(Boolean)) {
          errors.push(`${campaign.name || "campaign"} ${issue}`);
        }
      }
    }
    if (run?.campaignApprovals?.length !== 3 ||
        run.campaignApprovals.some((item) =>
          !item.effectiveTargetHash ||
          item.approval?.targetHash !== item.effectiveTargetHash ||
          typeof item.approval?.approver !== "string" || !item.approval.approver.trim() ||
          typeof item.approval?.approvedAt !== "string" ||
          !Number.isFinite(Date.parse(item.approval.approvedAt)) ||
          Date.parse(item.approval.approvedAt) > approvalNow ||
          typeof item.approval?.reference !== "string" || !item.approval.reference.trim())) {
      errors.push("provider campaigns lack structured approvals for their effective target hashes");
    }
    for (const result of results) {
      if (result.scenarioId === "S0-BCK-006") continue;
      if (Object.keys(result.evidence?.campaigns || {}).length !== 3) {
        errors.push(`${result.scenarioId} does not contain all three campaign positions`);
      }
    }
    errors.push(...verifyLinkedCampaigns(run, config, { artifactPath }));
    if (config.backingPath === "onedrive") {
      errors.push(...verifySeparateSync(run, config, { artifactPath }));
    }
  }
  return errors;
}

function invalidRun(config, errors, generatedAt) {
  const applicable = applicableScenarioIds(config);
  return {
    schemaVersion: 2,
    syntheticData: true,
    harnessRevision: "invalid-existing-evidence",
    evidenceIdentity: buildEvidenceIdentity(config),
    startedAt: generatedAt,
    completedAt: generatedAt,
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      platform: config.platform,
      scale: config.scale,
      runId: config.runId,
      host: "not executed",
      applicabilityProfile: applicabilityProfile(config),
    },
    preflight: {
      sandbox: {},
      budgets: config.budgets || {},
    },
    applicableScenarioIds: applicable,
    catalog: currentCatalog(),
    results: [],
    validationErrors: errors,
  };
}

function resultFor(run, scenarioId) {
  const result = run.results.find((item) => item.scenarioId === scenarioId);
  return result ? effectiveResult(result) : null;
}

function metric(run, scenarioId, name) {
  const result = resultFor(run, scenarioId);
  const value = result?.status === "Pass" ? result.measurements?.[name] : null;
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function evidence(run, scenarioId, name) {
  const result = resultFor(run, scenarioId);
  const value = result?.status === "Pass" ? result.evidence?.[name] : null;
  return value === undefined || value === null ? "—" : String(value);
}

function reportPath(configurationId) {
  return `../${configurationId}/outcome.md`;
}

function rawPath(configurationId) {
  return `../${configurationId}/raw-results.json`;
}

function linked(configurationId, text) {
  return `[${text}](${reportPath(configurationId)}) ([raw](${rawPath(configurationId)}))`;
}

function statusesFor(run, prefixes) {
  const applicable = new Set(run.applicableScenarioIds);
  const scenarios = run.catalog.filter((scenario) =>
    applicable.has(scenario.id) && prefixes.some((prefix) => scenario.id.startsWith(prefix)));
  if (!scenarios.length) return "Not applicable";
  const statuses = scenarios.map((scenario) => resultFor(run, scenario.id)?.status || "Not executed");
  if (statuses.includes("Fail")) return "Fail";
  if (statuses.includes("Blocked")) return "Blocked";
  if (statuses.includes("Incomplete") || statuses.includes("Not executed")) return "Incomplete";
  if (statuses.every((status) => status === "N/A")) return "N/A";
  return "Pass";
}

function ownerFor(scenarioId) {
  if (scenarioId === "S0-BCK-006") return "Windows sync-client test owner";
  if (/^S0-(COL|BCK|MIG|BKP|REC|PER)-/.test(scenarioId)) return "S0 provider test owner";
  return "S0 implementation owner";
}

function mappingStatus(mapping, byConfiguration) {
  const components = mapping.components.map((id) => byConfiguration.get(id));
  if (components.some((item) => !item)) return "Not executed";
  if (components.some((item) => item.gates.eligible === "No")) return "Rejected";
  if (components.some((item) => item.gates.eligible !== "Yes")) return "Incomplete";
  return "Eligible";
}

export function deriveDecision(mappings, selectedMappingId = null) {
  const eligible = mappings.filter((mapping) => mapping.status === "Eligible");
  const selected = selectedMappingId
    ? eligible.find((mapping) => mapping.id === selectedMappingId) || null
    : eligible.length === 1 ? eligible[0] : null;
  return {
    status: selected ? "Eligible" : eligible.length ? "Selection required" : "Incomplete",
    mapping: selected?.id || null,
    eligibleMappings: eligible.map((mapping) => mapping.id),
    approval: "Pending",
  };
}

function openEvidenceItems(item) {
  return [
    ...item.gates.failed,
    ...item.gates.unresolved,
    ...item.gates.missing.map((scenario) => ({
      scenarioId: scenario.id,
      status: "Not executed",
      reason: scenario.title,
    })),
  ].filter((result) => {
    const scenario = item.run.catalog.find((candidate) => candidate.id === result.scenarioId);
    return scenario?.criterionType === "absolute";
  });
}

function renderComparison({ runs, mappings, decision, generatedAt, validationFailures }) {
  const byConfiguration = new Map(runs.map((item) => [item.run.configuration.configurationId, item]));
  const selectedMapping = mappings.find((mapping) => mapping.id === decision.mapping);
  const lines = [
    "# S0 architecture-mapping handoff",
    "",
    `**Generated:** ${generatedAt}`,
    `**Host:** ${runs[0]?.run.configuration.host || "unknown"}`,
    `**Final ADR readiness:** ${decision.status}`,
    "**ADR approval:** Pending; this generated comparison does not record human acceptance.",
    "**Concrete mapping recommendation:** " + (
      selectedMapping
        ? `${selectedMapping.label}, pending independent review and ADR approval.`
        : decision.status === "Selection required"
          ? "No mapping selected; pass `--mapping=<eligible-id>` only after reviewing relative evidence."
          : "Deferred until a selected mapping passes every applicable absolute gate."
    ),
    "",
    "Eligibility is evaluated per engine/backing-path configuration and then rolled up into",
    "candidate mappings. `N/A` requires approver identity, approval date, and a reference.",
    "Stale, identity-mismatched, or incomplete artifacts are rejected as incomplete evidence.",
    "",
    "**Known structural finding:** SQLite fails the current absolute `S0-CON-003` criterion",
    "because `BEGIN IMMEDIATE` serializes writers database-wide. A rerun alone cannot close",
    "that condition; closure requires revising the criterion or an independently approved,",
    "scenario-specific rationale-backed `N/A`.",
    "",
    decision.mapping
      ? "Relative metrics may support the selected eligible mapping; they do not override an absolute gate."
      : "**Relative metrics are provisional diagnostics only. No ranking or architecture decision is produced.**",
    "",
  ];

  if (validationFailures.length) {
    lines.push(
      "## Rejected existing evidence",
      "",
      "| Configuration | Validation errors |",
      "|---|---|",
      ...validationFailures.map(({ configurationId, errors }) =>
        `| ${configurationId} | ${errors.join("; ").replaceAll("|", "\\|")} |`),
      "",
      "These artifacts must be regenerated from the current source. Provider artifacts require new",
      "live campaigns with effective target identity/coordinates bound to an approved target hash.",
      "",
    );
  }

  lines.push(
    "## Applicability-aware configuration matrix",
    "",
    "| Configuration | Engine | Backing path | Applicable absolute | Pass | Fail | Blocked / incomplete | N/A | Not executed | Not applicable (absolute) | Eligibility | Evidence |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|",
  );
  for (const { run, gates, definition } of runs) {
    lines.push(
      `| ${definition.label} | ${definition.engine} | ${definition.backingPath} | ` +
      `${gates.applicable.length} | ${gates.passed.length} | ${gates.failed.length} | ${gates.unresolved.length} | ` +
      `${gates.na.length} | ${gates.missing.length} | ${gates.notApplicable.length} | ` +
      `${gates.eligible} | [report](${reportPath(run.configuration.configurationId)}) · ` +
      `[raw](${rawPath(run.configuration.configurationId)}) |`,
    );
  }

  lines.push(
    "",
    "## Configuration evidence matrix",
    "",
    "| Configuration | Correctness | Collaboration | Recovery | Performance | Complexity | Recommendation | Conditions |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const { run, gates, definition } of runs) {
    const id = run.configuration.configurationId;
    const correctness = statusesFor(run, ["S0-ATM-", "S0-CON-", "S0-JRN-", "S0-BCK-", "S0-COR-", "S0-HYD-", "S0-SEC-"]);
    const collaboration = statusesFor(run, ["S0-COL-"]);
    const recovery = statusesFor(run, ["S0-CRS-", "S0-MIG-", "S0-IMP-", "S0-BKP-", "S0-REC-"]);
    const performance = statusesFor(run, ["S0-PER-"]);
    const complexity = evidence(run, "S0-PER-005", "total");
    const recommendation = gates.eligible === "Yes" ? "Component eligible" : gates.eligible === "No" ? "Reject component" : "Incomplete";
    const conditions = openEvidenceItems({ run, gates }).map((item) => `\`${item.scenarioId}\``).join(", ") || "None";
    lines.push(
      `| [${definition.label}](${reportPath(id)}) | ${linked(id, correctness)} | ` +
      `${linked(id, collaboration)} | ${linked(id, recovery)} | ${linked(id, performance)} | ` +
      `${linked(id, complexity === "—" ? "Not executed" : `${complexity}/40`)} | ` +
      `${linked(id, recommendation)} | ${linked(id, conditions)} |`,
    );
  }

  lines.push(
    "",
    "## Candidate architecture mappings",
    "",
    "| Mapping | Components | Absolute status | Recommendation | Conditions |",
    "|---|---|---|---|---|",
  );
  for (const mapping of mappings) {
    const incomplete = mapping.components.flatMap((id) => {
      const item = byConfiguration.get(id);
      return item?.gates.eligible === "Yes" ? [] : [item?.definition.label || id];
    });
    lines.push(
      `| ${mapping.label} | ${mapping.components.join(" + ")} | ${mapping.status} | ` +
      `${mapping.id === decision.mapping ? "Selected for review" : mapping.status === "Eligible" ? "Eligible, not selected" : "Do not select"} | ` +
      `${incomplete.length ? `Close applicable gates for ${incomplete.join(", ")}` : "None"} |`,
    );
  }

  lines.push(
    "",
    "## Exact open gates and evidence requirements",
    "",
    "| Configuration | Gate | State | Owner | Evidence required | Component report |",
    "|---|---|---|---|---|---|",
  );
  let openCount = 0;
  for (const item of runs) {
    const id = item.run.configuration.configurationId;
    for (const result of openEvidenceItems(item)) {
      openCount++;
      const scenario = item.run.catalog.find((entry) => entry.id === result.scenarioId);
      const blocker = String(result.reason || result.error?.message || result.status).replace(/[.]+$/, "");
      lines.push(
        `| ${item.definition.label} | \`${result.scenarioId}\` | ${result.status} | ` +
        `${ownerFor(result.scenarioId)} | Execute: ${scenario?.title}. Blocker/result: ${blocker}. | ` +
        `[report](${reportPath(id)}) · [raw](${rawPath(id)}) |`,
      );
    }
  }
  if (!openCount) lines.push("| — | — | None | — | — | — |");

  const measurementRows = [
    ["Cold initialize p50, small (ms)", "S0-PER-001", "initializedP50Ms_small", "metric"],
    ["Open by alias p50, small (ms)", "S0-PER-002", "openByAliasP50Ms_small", "metric"],
    ["Mutation p50, small (ms)", "S0-PER-002", "mutationP50Ms_small", "metric"],
    ["Backup p50, small (ms)", "S0-PER-003", "backupP50Ms_small", "metric"],
    ["Fresh-process memory, small (bytes)", "S0-PER-003", "memoryP50Bytes_small", "metric"],
    ["Write amplification p50, small", "S0-PER-003", "writeAmplificationP50Ratio_small", "metric"],
    ["Remote CAS p50, small (ms)", "S0-PER-004", "remoteCasP50Ms_small", "metric"],
    ["Collaborator discovery p50, small (ms)", "S0-PER-004", "collaboratorDiscoveryP50Ms_small", "metric"],
    ["Provider requests per mutation, small", "S0-PER-004", "requestsPerMutation_small", "evidence"],
    ["Common complexity burden (of 40)", "S0-PER-005", "total", "evidence"],
  ].filter(([, scenarioId]) =>
    runs.some(({ run }) => resultFor(run, scenarioId)?.status === "Pass"));

  lines.push(
    "",
    "## Relative measurements",
    "",
    decision.mapping
      ? "Only complete, currently validated measurements are shown."
      : "These values are provisional and are not used for architecture selection.",
    "",
  );
  if (measurementRows.length) {
    lines.push(
      "| Metric | " + runs.map((item) => item.definition.label).join(" | ") + " |",
      "|---|" + runs.map(() => "---:").join("|") + "|",
    );
    for (const [label, scenarioId, name, kind] of measurementRows) {
      const values = runs.map(({ run }) =>
        kind === "metric" ? metric(run, scenarioId, name) : evidence(run, scenarioId, name));
      lines.push(`| ${label} | ${values.join(" | ")} |`);
    }
  } else {
    lines.push("No current decision-grade performance measurement is eligible for comparison.");
  }

  lines.push(
    "",
    "## Decision conditions and evidence",
    "",
    "| Condition | Owner | Evidence required |",
    "|---|---|---|",
    "| Current local evidence | S0 implementation owner | Regenerate local CAS. SQLite `S0-CON-003` is a structural fail; close it only by revising the criterion or approving a scenario-specific rationale-backed `N/A`. |",
    "| Current provider evidence | S0 provider test owner | Three complete live campaigns per provider with approved target hash, persistent offline queue, full fault coverage, authorized conditional cleanup, and enforced budgets. |",
    "| Performance evidence | Performance investigator | Fresh-process populated-store startup/enumeration, memory, and storage-layer write-amplification measurements. |",
    "| Architecture decision | Independent reviewer / ADR approver | Select an eligible mapping, review conditions, and record dated approval separately from generated evidence. |",
    "",
    "## Sign-off",
    "",
    "| Role | Person | Date | Decision / comments |",
    "|---|---|---|---|",
    "| S0 implementation owner | | | |",
    "| Provider test owner | | | |",
    "| Cross-platform test owner | | | |",
    "| Independent reviewer | | | |",
    "| ADR approver | | | Pending |",
    "",
  );
  return lines.join("\n");
}

export async function buildComparison({
  selectedConfigs,
  useExisting = false,
  selectedMappingId = null,
} = {}) {
  validateApplicability(SCENARIOS);
  const generatedAt = new Date().toISOString();
  const runs = [];
  const validationFailures = [];
  for (const configPath of selectedConfigs) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const existingPath = path.join(root, "results", config.configurationId, "raw-results.json");
    let run;
    let validationErrors = [];
    if (useExisting) {
      if (!fs.existsSync(existingPath)) {
        validationErrors = ["raw-results.json is missing"];
      } else {
        try {
          run = JSON.parse(fs.readFileSync(existingPath, "utf8"));
          validationErrors = validateExistingRun(run, config, { artifactPath: existingPath });
        } catch (error) {
          validationErrors = [`raw-results.json is unreadable: ${error.message}`];
        }
      }
      if (validationErrors.length) {
        validationFailures.push({ configurationId: config.configurationId, errors: validationErrors });
        run = invalidRun(config, validationErrors, generatedAt);
      }
    } else {
      ({ run } = await runHarness({
        config,
        outputDir: path.join(root, "results", config.configurationId),
      }));
      validationErrors = validateExistingRun(run, config, { artifactPath: existingPath });
      if (validationErrors.length) {
        validationFailures.push({ configurationId: config.configurationId, errors: validationErrors });
        run = invalidRun(config, validationErrors, generatedAt);
      }
    }
    const gates = gateSummary(run);
    const definition = configurationDefinition(config.configurationId) || {
      configurationId: config.configurationId,
      label: config.configurationId,
      engine: config.adapter,
      backingPath: config.backingPath,
    };
    runs.push({ run, gates, definition });
  }
  const byConfiguration = new Map(runs.map((item) => [item.run.configuration.configurationId, item]));
  const mappings = ARCHITECTURE_MAPPINGS.map((mapping) => ({
    ...mapping,
    status: mappingStatus(mapping, byConfiguration),
  }));
  if (selectedMappingId && !ARCHITECTURE_MAPPINGS.some((mapping) => mapping.id === selectedMappingId)) {
    throw new Error(`Unknown architecture mapping: ${selectedMappingId}`);
  }
  const decision = deriveDecision(mappings, selectedMappingId);
  return {
    runs,
    mappings,
    decision,
    generatedAt,
    validationFailures,
    markdown: renderComparison({ runs, mappings, decision, generatedAt, validationFailures }),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const defaultConfigs = [
    "local-sqlite.json",
    "local-cas.json",
    "provider-onedrive-live.json",
    "provider-ado-live.json",
    "provider-github-live.json",
  ].map((name) => path.join(root, "config", name));
  const configPaths = args.filter((arg) => arg.startsWith("--config="))
    .map((arg) => path.resolve(arg.slice("--config=".length)));
  const selectedConfigs = configPaths.length ? configPaths : defaultConfigs;
  const outputDir = path.resolve(
    args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length) ||
    path.join(root, "results", "comparison"),
  );
  const selectedMappingId = args.find((arg) => arg.startsWith("--mapping="))
    ?.slice("--mapping=".length) || null;
  const comparison = await buildComparison({
    selectedConfigs,
    useExisting: args.includes("--use-existing"),
    selectedMappingId,
  });
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPathOut = path.join(outputDir, "comparison.md");
  fs.writeFileSync(reportPathOut, comparison.markdown, "utf8");
  fs.writeFileSync(path.join(outputDir, "comparison.json"), JSON.stringify({
    schemaVersion: 3,
    generatedAt: comparison.generatedAt,
    decision: comparison.decision,
    mappings: comparison.mappings,
    validationFailures: comparison.validationFailures,
    runs: comparison.runs.map(({ run }) => run),
  }, null, 2) + "\n", "utf8");
  process.stdout.write(`Comparison: ${reportPathOut}\n`);
  if (!comparison.decision.mapping || comparison.validationFailures.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
