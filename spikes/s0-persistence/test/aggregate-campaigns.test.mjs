import assert from "node:assert/strict";
import {
  APPLICABILITY_PROFILES,
} from "../src/applicability.mjs";
import {
  combineResults,
  buildSeparateSync,
  validateCampaigns,
} from "../src/aggregate-campaigns.mjs";
import { buildEvidenceIdentity } from "../src/evidence-identity.mjs";
import { SCENARIOS } from "../src/scenario-catalog.mjs";

const config = {
  configurationId: "CFG-ONEDRIVE-LIVE",
  adapter: "onedrive",
  backingPath: "onedrive",
  applicabilityProfile: "onedrive",
  platform: "synthetic",
  scale: "small",
  runId: "s0-aggregate-test",
  syntheticDataOnly: true,
  dryRun: false,
  budgets: { maxOperations: 100, maxDurationMs: 1000, maxObjects: 100, maxBytes: 1000 },
  sandbox: {
    kind: "provider-live",
    approved: true,
    allowListed: true,
    identityVerified: true,
    corporateFallbackDisabled: true,
    defaultBranchExcluded: true,
    dryRunOperations: ["put-content"],
  },
};
const catalog = SCENARIOS.map((scenario) => ({ ...scenario }));
const expectedIds = [...APPLICABILITY_PROFILES.onedrive];

function campaign(name, samples) {
  const targetHash = `sha256:${name}`;
  const ordinal = Number(name.at(-1));
  return {
    name,
    rawPath: `/synthetic/${name}/raw-results.json`,
    reportPath: `/synthetic/${name}/outcome.md`,
    rawSha256: `sha256:raw-${name}`,
    reportSha256: `sha256:report-${name}`,
    run: {
      schemaVersion: 2,
      evidenceIdentity: buildEvidenceIdentity(config),
      configuration: {
        configurationId: config.configurationId,
        adapter: config.adapter,
        backingPath: config.backingPath,
        applicabilityProfile: config.applicabilityProfile,
        runId: `${config.runId}-${name}`,
      },
      preflight: {
        sandbox: {
          effectiveTargetHash: targetHash,
          approval: {
            approver: "Synthetic Reviewer",
            approvedAt: "2026-09-03T20:00:00.000Z",
            reference: `syn-${name}`,
            targetHash,
          },
        },
      },
      catalog,
      applicableScenarioIds: expectedIds,
      results: expectedIds.map((scenarioId) => ({
        scenarioId,
        status: "Pass",
        durationMs: 1,
        evidence: scenarioId === "S0-PER-004"
          ? {
            rawSamples: {
              small: {
                remoteCasMs: samples,
                retryAfterSeconds: [ordinal],
                backoffMsPerMutation: [ordinal * 10],
                throttleResponsesPerMutation: [1],
                retriesPerMutation: [ordinal],
              },
            },
            throttleResponses: 1,
            throttleRetries: ordinal,
            throttleBackoffMs: ordinal * 10,
            throttleRetryAfterSeconds: [ordinal],
          }
          : {},
        measurements: scenarioId === "S0-PER-004"
          ? {
            remoteCasMinMs_small: Math.min(...samples),
            remoteCasP50Ms_small: samples.at(-1),
            remoteCasP95Ms_small: samples.at(-1),
            remoteCasMaxMs_small: Math.max(...samples),
            remoteCasMeanMs_small: samples.reduce((sum, value) => sum + value, 0) / samples.length,
            remoteCasStdDevMs_small: 999,
          }
          : {},
      })),
    },
  };
}

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

const campaigns = [
  campaign("campaign-1", [1, 100]),
  campaign("campaign-2", [2, 3]),
  campaign("campaign-3", [4, 5]),
];

await check("rejects a campaign that omits an expected scenario", () => {
  const broken = structuredClone(campaigns);
  broken[1].run.results = broken[1].run.results.filter((result) => result.scenarioId !== "S0-REC-003");
  assert.throws(() => validateCampaigns(broken, { config }), /missing=S0-REC-003/);
});

await check("rejects duplicate run and artifact identities", () => {
  const broken = structuredClone(campaigns);
  broken[2].run.configuration.runId = broken[1].run.configuration.runId;
  broken[2].rawPath = broken[1].rawPath;
  broken[2].rawSha256 = broken[1].rawSha256;
  assert.throws(() => validateCampaigns(broken, { config }), /distinct names, run IDs, artifact paths, and digests/);
});

await check("rejects N/A without a scenario-specific contract rationale", () => {
  const broken = structuredClone(campaigns);
  const result = broken[0].run.results.find((item) => item.scenarioId === "S0-BCK-005");
  result.status = "N/A";
  result.approval = {
    approver: "Synthetic Reviewer",
    approvedAt: "2026-09-03T20:00:00.000Z",
    reference: "syn-na",
  };
  assert.throws(() => validateCampaigns(broken, { config }), /scenario-specific contract rationale/);
});

await check("retains the correct named campaign position for every result", () => {
  validateCampaigns(campaigns, { config });
  const combined = combineResults(campaigns, expectedIds);
  const result = combined.find((item) => item.scenarioId === "S0-BCK-005");
  assert.deepEqual(Object.keys(result.evidence.campaigns), [
    "campaign-1",
    "campaign-2",
    "campaign-3",
  ]);
  assert.equal(result.evidence.campaigns["campaign-2"].status, "Pass");
});

await check("recomputes pooled percentiles and variability from raw samples", () => {
  validateCampaigns(campaigns, { config });
  const combined = combineResults(campaigns, expectedIds);
  const result = combined.find((item) => item.scenarioId === "S0-PER-004");
  assert.deepEqual(result.evidence.rawSamples.small.remoteCasMs, [1, 100, 2, 3, 4, 5]);
  assert.equal(result.measurements.remoteCasP50Ms_small, 3);
  assert.equal(result.measurements.remoteCasP95Ms_small, 100);
  assert.notEqual(result.measurements.remoteCasStdDevMs_small, 999);
  assert.deepEqual(result.evidence.retryAfterSeconds_small, [1, 2, 3]);
  assert.equal(result.evidence.backoffMs_small, 60);
  assert.equal(result.evidence.throttleResponses_small, 3);
  assert.equal(result.evidence.retries_small, 6);
  assert.deepEqual(result.evidence.throttleRetryAfterSeconds, [1, 2, 3]);
  assert.equal(result.evidence.throttleBackoffMs, 60);
});

await check("rejects stale separate synced-folder (S0-BCK-006) evidence during aggregation", () => {
  assert.throws(() => buildSeparateSync("CFG-ONEDRIVE-LIVE"), /synced-folder evidence is stale/);
});

console.log(`s0-aggregate-campaigns: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
