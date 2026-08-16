#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertPreflight } from "./preflight.mjs";
import { runHarness } from "./runner.mjs";
import { SCENARIOS } from "./scenario-catalog.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

function valueOf(name, fallback = null) {
  const exact = args.indexOf(name);
  if (exact >= 0 && args[exact + 1] !== undefined) return args[exact + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

if (args.includes("--list")) {
  for (const scenario of SCENARIOS) {
    console.log(`${scenario.id}\t${scenario.criterionType}\t${scenario.title}`);
  }
  process.exit(0);
}

const configPath = path.resolve(
  valueOf("--config", path.join(root, "config", "reference-memory.json")),
);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const selected = args
  .filter((arg) => arg.startsWith("--scenario="))
  .map((arg) => arg.slice("--scenario=".length));
const scenarioIds = args.includes("--all")
  ? SCENARIOS.map((scenario) => scenario.id)
  : selected.length ? selected : config.scenarioIds;

if (args.includes("--dry-run")) {
  const preflight = assertPreflight(config);
  console.log(JSON.stringify({
    ok: true,
    preflight,
    scenarios: scenarioIds,
  }, null, 2));
  process.exit(0);
}

const outputDir = path.resolve(
  valueOf("--output", path.join(root, "results", config.configurationId)),
);
const { run, artifacts } = await runHarness({ config, outputDir, scenarioIds });
for (const result of run.results) {
  console.log(`${result.status.padEnd(10)} ${result.scenarioId} ${result.title}`);
}
console.log(`\nRaw results: ${artifacts.rawPath}`);
console.log(`Outcome report: ${artifacts.reportPath}`);
if (run.results.some((result) => result.status === "Fail")) process.exit(1);
