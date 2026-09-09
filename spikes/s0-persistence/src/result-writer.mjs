import fs from "node:fs";
import path from "node:path";
import { writeFileAtomicSync } from "./adapters/fs-atomic.mjs";
import { CleanupManifest } from "./cleanup-manifest.mjs";
import { effectiveResult, gateSummary } from "./eligibility.mjs";

function fixed(value, digits = 3) {
  return typeof value === "number" ? value.toFixed(digits) : "";
}

function reportRecommendation(run) {
  const gates = gateSummary(run);
  if (gates.failed.length) return "Do not proceed";
  if (gates.unresolved.length || gates.missing.length) return "Incomplete";
  return "Proceed to architecture-mapping evaluation";
}

function outcomeFor(run, scenario) {
  const applicable = new Set(run.applicableScenarioIds || []);
  if (!applicable.has(scenario.id)) {
    return {
      status: "Not applicable",
      reason: "Assigned to another engine/backing-path configuration by the applicability matrix.",
    };
  }
  const result = run.results.find((item) => item.scenarioId === scenario.id);
  return result ? effectiveResult(result) : {
    status: "Not executed",
    reason: "Applicable scenario has no result.",
  };
}

function display(value) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function coverageSection(run) {
  const outcomes = run.catalog.map((scenario) => outcomeFor(run, scenario));
  const counts = new Map();
  for (const outcome of outcomes) {
    counts.set(outcome.status, (counts.get(outcome.status) || 0) + 1);
  }
  const applicable = new Set(run.applicableScenarioIds || []);
  const applicableAbsolute = run.catalog.filter((scenario) =>
    scenario.criterionType === "absolute" && applicable.has(scenario.id));
  const missingApplicable = applicableAbsolute.filter((scenario) =>
    outcomeFor(run, scenario).status === "Not executed");
  const lines = [
    "## Coverage",
    "",
    `Executed ${run.results.length} of ${run.catalog.length} catalog scenarios. ` +
    `${applicable.size} apply to this configuration; ${missingApplicable.length} applicable absolute gates were not executed.`,
    "",
    "| Outcome class | Count | Meaning |",
    "|---|---:|---|",
    `| Pass | ${counts.get("Pass") || 0} | Executed and satisfied |`,
    `| Fail | ${counts.get("Fail") || 0} | Executed and violated |`,
    `| Blocked | ${counts.get("Blocked") || 0} | Applicable, but a prerequisite is unavailable |`,
    `| Incomplete | ${counts.get("Incomplete") || 0} | Applicable implementation or evidence is incomplete |`,
    `| N/A | ${counts.get("N/A") || 0} | Scenario-specific contract rationale plus approver identity, approval date, and reference |`,
    `| Not applicable | ${counts.get("Not applicable") || 0} | Assigned to another configuration by design |`,
    `| Not executed | ${counts.get("Not executed") || 0} | Applicable, but no result exists |`,
    "",
  ];
  if (missingApplicable.length) {
    lines.push(
      "Applicable absolute gates not executed:",
      "",
      ...missingApplicable.map((scenario) => `- \`${scenario.id}\` — ${scenario.title}`),
      "",
      "An unexecuted absolute gate is missing evidence, not a pass.",
      "",
    );
  }
  return lines;
}

function criterionSummary(run, prefixes) {
  const applicable = new Set(run.applicableScenarioIds || []);
  const scenarios = run.catalog.filter((scenario) =>
    applicable.has(scenario.id) && prefixes.some((prefix) => scenario.id.startsWith(prefix)));
  if (!scenarios.length) return "Not applicable";
  const statuses = scenarios.map((scenario) => outcomeFor(run, scenario).status);
  if (statuses.includes("Fail")) return "Fail";
  if (statuses.includes("Blocked")) return "Blocked";
  if (statuses.includes("Incomplete") || statuses.includes("Not executed")) return "Incomplete";
  return "Pass";
}

function ownerFor(scenarioId) {
  if (scenarioId === "S0-BCK-006") return "Windows sync-client test owner";
  if (/^S0-(COL|BCK|MIG|BKP|REC|PER)-/.test(scenarioId)) return "S0 provider test owner";
  return "S0 implementation owner";
}

function measurementUnit(name) {
  if (/bytes/i.test(name)) return "bytes";
  if (/ratio/i.test(name)) return "ratio";
  if (/count|samples|repetitions/i.test(name)) return "count";
  return "ms";
}

export function renderOutcomeReport(run) {
  const gates = gateSummary(run);
  const lines = [
    `# S0 Outcome: ${run.configuration.configurationId}`,
    "",
    `**Report date:** ${run.completedAt.slice(0, 10)}`,
    `**Harness revision:** ${run.harnessRevision}`,
    `**Source revision:** ${display(run.evidenceIdentity?.sourceRevision)}`,
    `**Catalog revision:** ${display(run.evidenceIdentity?.catalogRevision)}`,
    `**Applicability revision:** ${display(run.evidenceIdentity?.applicabilityRevision)}`,
    `**Configuration revision:** ${display(run.evidenceIdentity?.configRevision)}`,
    `**Configuration ID:** ${run.configuration.configurationId}`,
    `**Adapter:** ${run.configuration.adapter}`,
    `**Authoritative backing path:** ${run.configuration.backingPath}`,
    `**Dataset scale:** ${run.configuration.scale}`,
    `**Recommendation:** ${reportRecommendation(run)}`,
    `**Applicable absolute gates:** ${gates.applicable.length}`,
    `**Eligibility:** ${gates.eligible}`,
    "",
    ...coverageSection(run),
    "## Configuration and environment",
    "",
    "| Dimension | Value |",
    "|---|---|",
    `| OS | ${display(run.environment?.os)} |`,
    `| Architecture | ${display(run.environment?.architecture)} |`,
    `| CPU | ${display(run.environment?.cpuModel)} |`,
    `| Logical CPUs | ${display(run.environment?.logicalCpuCount)} |`,
    `| Total memory | ${display(run.environment?.totalMemoryBytes)} bytes |`,
    `| Runtime | Node ${display(run.environment?.nodeVersion)} |`,
    `| Provider/API version | ${display(run.environment?.providerApiVersion)} |`,
    `| Configured platform/filesystem | ${display(run.environment?.configuredPlatform)} |`,
    `| Detected filesystem | ${display(run.environment?.filesystem)} |`,
    `| Temporary store root | ${display(run.environment?.temporaryStoreRoot)} |`,
    `| Network characteristics | ${display(run.environment?.networkCharacteristics)} |`,
    `| Provider region | ${display(run.environment?.providerRegion)} |`,
    `| Storage characteristics | ${display(run.environment?.storageCharacteristics)} |`,
    `| Sync-client state | ${display(run.environment?.syncClientState)} |`,
    `| Repository protections | ${display(run.environment?.repositoryProtections)} |`,
    `| Dependency versions | ${display(run.environment?.dependencyVersions)} |`,
    `| Workload mix | ${display(run.environment?.workloadMix)} |`,
    `| Known limitations | ${display(run.environment?.knownLimitations)} |`,
    `| Process topology | ${display(run.environment?.processTopology)} |`,
    `| Dataset scale | ${display(run.configuration.scale)} |`,
    `| Applicability profile | ${display(run.configuration.applicabilityProfile)} |`,
    `| Store namespace | ${display(run.preflight.sandbox.namespace)} |`,
    `| Authentication setup | ${display(run.preflight.sandbox.identityLabel)} |`,
    `| Cleanup manifest | ${display(run.preflight.sandbox.cleanup?.manifestId)} |`,
    `| Cleanup manifest artifact | ${display(run.cleanup?.manifest?.artifact)} |`,
    `| Cleanup manifest digest | ${display(run.cleanup?.manifest?.digest)} |`,
    `| Cleanup expiry | ${display(run.preflight.sandbox.cleanup?.expiresAt)} |`,
    `| Effective target hash | ${display(run.preflight.sandbox.effectiveTargetHash)} |`,
    "",
    "## Method and preflight",
    "",
    "| Check | Result |",
    "|---|---|",
    "| Synthetic data only | Pass |",
    "| Corporate-account fallback disabled | Pass |",
    `| Ownership marker | \`${run.preflight.sandbox.ownershipMarker}\` |`,
    `| Operation budget | ${run.preflight.budgets.maxOperations} |`,
    `| Duration budget | ${run.preflight.budgets.maxDurationMs} ms |`,
    `| Object budget | ${run.preflight.budgets.maxObjects} |`,
    `| Storage/transfer budget | ${run.preflight.budgets.maxBytes} bytes |`,
    `| Final metered operations | ${display(run.budgetTelemetry?.final?.operations)} |`,
    `| Final metered objects | ${display(run.budgetTelemetry?.final?.objects)} |`,
    `| Final metered bytes | ${display(run.budgetTelemetry?.final?.bytes)} |`,
    `| Cleanup requests/retries/bytes | ${display({
      requests: run.budgetTelemetry?.cleanup?.requests,
      retries: run.budgetTelemetry?.cleanup?.retries,
      transferredBytes: run.budgetTelemetry?.cleanup?.transferredBytes,
    })} |`,
    `| Declared provider operations | ${display(run.preflight.sandbox.dryRunOperations)} |`,
    "| Timer | `performance.now()` monotonic elapsed time |",
    "| Performance statistics | Minimum, p50, p95, maximum, mean, sample variability |",
    "| Raw evidence | [raw-results.json](raw-results.json) |",
    "| Redacted preflight | [preflight.json](preflight.json) |",
    "",
    "## Scenario results",
    "",
    "| Scenario ID | Type | Applicability/result | Duration (ms) | Evidence / reason | Raw |",
    "|---|---|---|---:|---|---|",
  ];

  for (const scenario of run.catalog) {
    const result = outcomeFor(run, scenario);
    const evidence = Object.entries(result.evidence || {})
      .filter(([key]) => key !== "rawSamples")
      .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
      .join("; ");
    const approval = result.approval
      ? `approval=${JSON.stringify(result.approval)}`
      : "";
    const rationale = result.contractRationale
      ? `contractRationale=${JSON.stringify(result.contractRationale)}`
      : "";
    lines.push(
      `| \`${scenario.id}\` | ${scenario.criterionType} | ${result.status} | ` +
      `${fixed(result.durationMs)} | ${display([evidence, rationale, approval].filter(Boolean).join("; ") || result.reason)} | [JSON](raw-results.json) |`,
    );
  }

  lines.push(
    "",
    "## Correctness summary",
    "",
    "| Criterion | Outcome |",
    "|---|---|",
    `| Atomicity and concurrency | ${criterionSummary(run, ["S0-ATM-", "S0-CON-", "S0-JRN-"])} |`,
    `| Collaboration | ${criterionSummary(run, ["S0-COL-"])} |`,
    `| Crash and operational recovery | ${criterionSummary(run, ["S0-CRS-", "S0-REC-"])} |`,
    `| Corruption and rehydration | ${criterionSummary(run, ["S0-COR-", "S0-HYD-"])} |`,
    `| Migration and import | ${criterionSummary(run, ["S0-MIG-", "S0-IMP-"])} |`,
    `| Backup and restore | ${criterionSummary(run, ["S0-BKP-"])} |`,
    `| Safety and security | ${criterionSummary(run, ["S0-SEC-"])} |`,
    "",
    "## Measurements",
    "",
    "| Scenario ID | Metric | Value | Unit |",
    "|---|---|---:|---|",
  );
  let measurementCount = 0;
  for (const result of run.results) {
    for (const [metric, value] of Object.entries(result.measurements || {})) {
      measurementCount++;
      lines.push(`| \`${result.scenarioId}\` | ${metric} | ${fixed(value)} | ${measurementUnit(metric)} |`);
    }
  }
  if (measurementCount === 0) lines.push("| - | No measurements emitted | - | - |");

  if (run.campaigns?.length) {
    lines.push(
      "",
      "## Repeated live campaigns",
      "",
      "| Campaign | Report | Raw evidence |",
      "|---|---|---|",
      ...run.campaigns.map((campaign) =>
        `| ${campaign.name} | [report](${campaign.report}) | [JSON](${campaign.raw}) |`),
      "",
      "### Between-campaign variability",
      "",
      "| Metric | Samples | Minimum | p50 | p95 | Maximum | Mean | Std. dev. |",
      "|---|---:|---:|---:|---:|---:|---:|---:|",
    );
    for (const [metric, summary] of Object.entries(run.campaignVariability || {})) {
      lines.push(
        `| ${metric} | ${summary.count} | ${fixed(summary.min)} | ${fixed(summary.p50)} | ` +
        `${fixed(summary.p95)} | ${fixed(summary.max)} | ${fixed(summary.mean)} | ${fixed(summary.stddev)} |`,
      );
    }
  }

  const failures = run.results.filter((result) => result.status === "Fail");
  lines.push(
    "",
    "## Failures and recovery",
    "",
  );
  if (failures.length === 0) {
    lines.push("No scenario failures.");
  } else {
    for (const result of failures) {
      lines.push(`- **${result.scenarioId}:** ${result.error?.message || "Failed"}`);
    }
  }

  lines.push(
    "",
    "## Risks and required follow-up",
    "",
    "| Gate | State | Owner | Evidence required |",
    "|---|---|---|---|",
  );
  const followUp = [
    ...gates.failed,
    ...gates.unresolved,
    ...gates.missing.map((scenario) => ({ ...scenario, scenarioId: scenario.id, status: "Not executed" })),
  ];
  if (!followUp.length) {
    lines.push("| — | None | — | — |");
  } else {
    for (const item of followUp) {
      const scenario = run.catalog.find((entry) => entry.id === item.scenarioId);
      lines.push(
        `| \`${item.scenarioId}\` | ${item.status} | ${ownerFor(item.scenarioId)} | ` +
        `${display(item.reason || item.error?.message || scenario?.title)} |`,
      );
    }
  }
  lines.push(
    "",
    "## Configuration recommendation",
    "",
    gates.eligible === "Yes"
      ? "This component may proceed into an architecture mapping. Relative evidence remains non-decisional until an entire mapping is eligible."
      : "Do not treat this component as selected. Close every applicable failed, blocked, incomplete, or unexecuted absolute gate first.",
    "",
    "## Evidence",
    "",
    "- [Raw machine-readable results](raw-results.json)",
    "- [Redacted preflight](preflight.json)",
    ...(run.cleanup?.manifest?.artifact
      ? [`- [Cleanup manifest](${run.cleanup.manifest.artifact}) — \`${run.cleanup.manifest.digest}\``]
      : []),
    "",
    "## Sign-off",
    "",
    "| Role | Person | Date | Decision / comments |",
    "|---|---|---|---|",
    "| Implementer | | | |",
    "| Independent reviewer | | | |",
    "",
  );
  return lines.join("\n");
}

export function writeRunArtifacts(run, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const rawPath = path.join(outputDir, "raw-results.json");
  const reportPath = path.join(outputDir, "outcome.md");
  const preflightPath = path.join(outputDir, "preflight.json");
  let cleanupManifestPath = null;
  if (run.cleanup?.manifestDocument) {
    cleanupManifestPath = path.join(
      outputDir,
      run.cleanup.manifest?.artifact || "cleanup-manifest.json",
    );
    if (!fs.existsSync(cleanupManifestPath)) {
      writeFileAtomicSync(
        cleanupManifestPath,
        JSON.stringify(run.cleanup.manifestDocument, null, 2) + "\n",
      );
    }
    const persisted = CleanupManifest.load(cleanupManifestPath);
    if (persisted.evidence().digest !== run.cleanup.manifest?.digest) {
      throw new Error("Retained cleanup manifest digest does not match run evidence");
    }
  }
  fs.writeFileSync(rawPath, JSON.stringify(run, null, 2) + "\n", "utf8");
  fs.writeFileSync(reportPath, renderOutcomeReport(run), "utf8");
  fs.writeFileSync(preflightPath, JSON.stringify(run.preflight, null, 2) + "\n", "utf8");
  return { rawPath, reportPath, preflightPath, cleanupManifestPath };
}
