#!/usr/bin/env node
// Runs each candidate configuration through the identical scenario set and
// emits the cross-configuration comparison the ADR requires.
//
// Absolute gates decide eligibility; relative metrics only rank candidates
// that are already eligible.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHarness } from "./runner.mjs";
import { gateSummary } from "./eligibility.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

const configPaths = args.filter((arg) => arg.startsWith("--config="))
  .map((arg) => path.resolve(arg.slice("--config=".length)));
const selected = configPaths.length ? configPaths : [
  path.join(root, "config", "local-cas.json"),
  path.join(root, "config", "local-sqlite.json"),
];
const outputDir = path.resolve(
  (args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length)) ||
  path.join(root, "results", "comparison"),
);

function metric(run, scenarioId, name) {
  const value = run.results.find((result) => result.scenarioId === scenarioId)
    ?.measurements?.[name];
  return typeof value === "number" ? value.toFixed(3) : "—";
}

function evidenceValue(run, scenarioId, name) {
  const value = run.results.find((result) => result.scenarioId === scenarioId)
    ?.evidence?.[name];
  return value === undefined ? "—" : String(value);
}

const PER_SCALES = ["small", "medium", "stress"];

function metricRow(label, scenarioId, name) {
  return `| ${label} | ` + runs.map(({ run }) => metric(run, scenarioId, name)).join(" | ") + " |";
}

function evidenceRow(label, scenarioId, name) {
  return `| ${label} | ` + runs.map(({ run }) => evidenceValue(run, scenarioId, name)).join(" | ") + " |";
}

// One comparable block per dataset scale, so relative metrics can be read across
// small/medium/stress rather than at a single size.
function perMetricRows() {
  const rows = [];
  for (const scale of PER_SCALES) {
    rows.push(`| **${scale} scale** | ${runs.map(() => "").join(" | ")} |`);
    rows.push(metricRow(`Cold initialize (ms)`, "S0-PER-001", `initializedMs_${scale}`));
    rows.push(metricRow(`Create workspace (ms)`, "S0-PER-001", `createMs_${scale}`));
    rows.push(metricRow(`Open by alias p50 (ms)`, "S0-PER-002", `openByAliasP50Ms_${scale}`));
    rows.push(metricRow(`Mutation p50 (ms)`, "S0-PER-002", `mutationP50Ms_${scale}`));
    rows.push(metricRow(`Mutation p95 (ms)`, "S0-PER-002", `mutationP95Ms_${scale}`));
    rows.push(metricRow(`Conflict detect p50 (ms)`, "S0-PER-002", `conflictP50Ms_${scale}`));
    rows.push(metricRow(`Backup (ms)`, "S0-PER-003", `backupMs_${scale}`));
    rows.push(metricRow(`Restore (ms)`, "S0-PER-003", `restoreMs_${scale}`));
    rows.push(evidenceRow(`Store bytes`, "S0-PER-003", `storeBytes_${scale}`));
    rows.push(evidenceRow(`Write amplification`, "S0-PER-003", `writeAmplification_${scale}`));
  }
  return rows;
}

const runs = [];
for (const configPath of selected) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  process.stdout.write(`Running ${config.configurationId} (${config.adapter})...\n`);
  const { run } = await runHarness({
    config,
    outputDir: path.join(root, "results", config.configurationId),
  });
  const gates = gateSummary(run);
  runs.push({ run, gates });
  process.stdout.write(
    `  absolute gates: ${gates.passed.length} passed, ` +
    `${gates.failed.length} failed, ${gates.unresolved.length} unresolved, ` +
    `${gates.notApplicable.length} n/a, ${gates.missing.length} not executed — eligible: ${gates.eligible}\n`,
  );
}

const lines = [
  "# S0 candidate comparison",
  "",
  `**Generated:** ${new Date().toISOString()}`,
  `**Host:** ${runs[0]?.run.configuration.host || "unknown"}`,
  "",
  "Absolute gates decide eligibility. Relative metrics rank only the",
  "configurations that already pass every executed absolute gate, and an",
  "unexecuted gate counts as missing evidence rather than a pass.",
  "",
  "## Absolute gates",
  "",
  "| Configuration | Adapter | Passed | Failed | Unresolved | N/A | Not executed | Eligible |",
  "|---|---|---:|---:|---:|---:|---:|---|",
  ...runs.map(({ run, gates }) =>
    `| ${run.configuration.configurationId} | ${run.configuration.adapter} | ` +
    `${gates.passed.length} | ${gates.failed.length} | ${gates.unresolved.length} | ` +
    `${gates.notApplicable.length} | ${gates.missing.length} | ${gates.eligible} |`),
  "",
  "## Relative metrics",
  "",
  "| Metric | " + runs.map(({ run }) => run.configuration.configurationId).join(" | ") + " |",
  "|---|" + runs.map(() => "---:").join("|") + "|",
  ...perMetricRows(),
  "",
  "## Absolute gates not passed",
  "",
];

for (const { run, gates } of runs) {
  lines.push(`### ${run.configuration.configurationId}`, "");
  if (!gates.unresolved.length && !gates.failed.length && !gates.missing.length && !gates.notApplicable.length) {
    lines.push("Every absolute gate passed.", "");
  }
  for (const result of gates.failed) {
    lines.push(`- **Fail** \`${result.scenarioId}\` — ${result.error?.message || "failed"}`);
  }
  for (const result of gates.unresolved) {
    lines.push(`- **${result.status}** \`${result.scenarioId}\` — ${result.reason || "no reason recorded"}`);
  }
  for (const result of (gates.notApplicable || [])) {
    lines.push(`- **N/A** \`${result.scenarioId}\` — ${result.reason || "not applicable to this configuration"}`);
  }
  for (const scenario of gates.missing) {
    lines.push(`- **Not executed** \`${scenario.id}\` — ${scenario.title}`);
  }
  lines.push("");
}

lines.push(
  "## Scope",
  "",
  "- Platform: Windows/NTFS only. macOS and Linux are `Blocked — no runner`.",
  "- Backing path: local filesystem only. OneDrive, ADO, and GitHub remain unexecuted.",
  "- These results cannot close the cross-platform or collaboration criteria.",
  "",
);

fs.mkdirSync(outputDir, { recursive: true });
const reportPath = path.join(outputDir, "comparison.md");
fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
fs.writeFileSync(
  path.join(outputDir, "comparison.json"),
  JSON.stringify(runs.map(({ run }) => run), null, 2) + "\n",
  "utf8",
);
process.stdout.write(`\nComparison: ${reportPath}\n`);
if (runs.some(({ gates }) => gates.failed.length)) process.exit(1);
