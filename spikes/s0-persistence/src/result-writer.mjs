import fs from "node:fs";
import path from "node:path";

function fixed(value, digits = 3) {
  return typeof value === "number" ? value.toFixed(digits) : "";
}

function reportRecommendation(run) {
  const results = run.results;
  const failedAbsolute = results.some((result) =>
    result.criterionType === "absolute" && result.status === "Fail");
  if (failedAbsolute) return "Do not proceed";
  const unresolved = results.some((result) =>
    ["Blocked", "Incomplete"].includes(result.status));
  const executed = new Set(results.map((result) => result.scenarioId));
  const missingAbsolute = run.catalog
    .filter((scenario) => scenario.criterionType === "absolute")
    .some((scenario) => !executed.has(scenario.id));
  if (unresolved || missingAbsolute) return "Incomplete";
  return "Proceed to candidate-specific testing";
}

function coverageSection(run) {
  const executed = new Set(run.results.map((result) => result.scenarioId));
  const notRun = run.catalog.filter((scenario) => !executed.has(scenario.id));
  const absoluteNotRun = notRun.filter((scenario) => scenario.criterionType === "absolute");
  const lines = [
    "## Coverage",
    "",
    `Executed ${run.results.length} of ${run.catalog.length} catalog scenarios ` +
    `(${absoluteNotRun.length} absolute gates not executed).`,
    "",
  ];
  if (notRun.length) {
    lines.push(
      "Not executed in this configuration:",
      "",
      ...notRun.map((scenario) =>
        `- \`${scenario.id}\` (${scenario.criterionType}) — ${scenario.title}`),
      "",
      "An unexecuted absolute gate is missing evidence, not a pass.",
      "",
    );
  }
  return lines;
}

export function renderOutcomeReport(run) {
  const lines = [
    `# S0 Outcome: ${run.configuration.configurationId}`,
    "",
    `**Report date:** ${run.completedAt.slice(0, 10)}`,
    `**Harness revision:** ${run.harnessRevision}`,
    `**Configuration ID:** ${run.configuration.configurationId}`,
    `**Adapter:** ${run.configuration.adapter}`,
    `**Authoritative backing path:** ${run.configuration.backingPath}`,
    `**Dataset scale:** ${run.configuration.scale}`,
    `**Recommendation:** ${reportRecommendation(run)}`,
    "",
    ...coverageSection(run),
    "## Preflight",
    "",
    "| Check | Result |",
    "|---|---|",
    "| Synthetic data only | Pass |",
    "| Corporate-account fallback disabled | Pass |",
    `| Ownership marker | \`${run.preflight.sandbox.ownershipMarker}\` |`,
    `| Operation budget | ${run.preflight.budgets.maxOperations} |`,
    `| Duration budget | ${run.preflight.budgets.maxDurationMs} ms |`,
    "",
    "## Scenario results",
    "",
    "| Scenario ID | Type | Status | Duration (ms) | Evidence |",
    "|---|---|---|---:|---|",
  ];

  for (const result of run.results) {
    const evidence = Object.entries(result.evidence || {})
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
    lines.push(
      `| \`${result.scenarioId}\` | ${result.criterionType} | ${result.status} | ` +
      `${fixed(result.durationMs)} | ${evidence || result.reason || ""} |`,
    );
  }

  lines.push(
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
      lines.push(`| \`${result.scenarioId}\` | ${metric} | ${fixed(value)} | ms |`);
    }
  }
  if (measurementCount === 0) lines.push("| - | No measurements emitted | - | - |");

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
    "- Reference-memory results validate the harness, not a production candidate.",
    "- Candidate adapters must implement every applicable absolute scenario before ADR comparison.",
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
  fs.writeFileSync(rawPath, JSON.stringify(run, null, 2) + "\n", "utf8");
  fs.writeFileSync(reportPath, renderOutcomeReport(run), "utf8");
  fs.writeFileSync(preflightPath, JSON.stringify(run.preflight, null, 2) + "\n", "utf8");
  return { rawPath, reportPath, preflightPath };
}
