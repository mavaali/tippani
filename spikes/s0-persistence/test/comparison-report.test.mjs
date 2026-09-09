import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIGURATION_MATRIX,
  applicableScenarioIds,
  applicabilityProfile,
} from "../src/applicability.mjs";
import {
  buildComparison,
  deriveDecision,
  validateExistingRun,
  verifySeparateSync,
} from "../src/compare.mjs";
import { buildEvidenceIdentity, decisionConfigRevision, sha256 } from "../src/evidence-identity.mjs";
import { combineResults, campaignVariability } from "../src/aggregate-campaigns.mjs";
import {
  EVIDENCE_KIND,
  evidenceSigningPayload,
  publicKeyFingerprint,
} from "../src/sync-evidence.mjs";
import { SCENARIOS } from "../src/scenario-catalog.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const comparisonPath = path.join(root, "results", "comparison", "comparison.md");
const comparisonJsonPath = path.join(root, "results", "comparison", "comparison.json");
const comparison = fs.readFileSync(comparisonPath, "utf8");
const comparisonJson = JSON.parse(fs.readFileSync(comparisonJsonPath, "utf8"));
const configPaths = [
  "local-sqlite.json",
  "local-cas.json",
  "provider-onedrive-live.json",
  "provider-ado-live.json",
  "provider-github-live.json",
].map((name) => path.join(root, "config", name));

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

await check("generated comparison rejects the checked-in stale campaigns", () => {
  assert(comparison.includes("## Rejected existing evidence"));
  assert(comparison.includes("**Final ADR readiness:** Incomplete"));
  assert(comparison.includes("**ADR approval:** Pending"));
  assert(!comparison.includes("**Final ADR status:** Accepted"));
  assert.equal(comparisonJson.decision.status, "Incomplete");
  assert.equal(comparisonJson.decision.mapping, null);
  assert.equal(comparisonJson.validationFailures.length, 5);
});

await check("comparison contains all configurations and both mappings without a fabricated selection", () => {
  for (const configuration of CONFIGURATION_MATRIX) {
    assert(comparison.includes(configuration.label), `Missing ${configuration.label}`);
  }
  assert(comparison.includes("Hybrid SQLite + provider-native CAS"));
  assert(comparison.includes("Generation-CAS envelope on every backing path"));
  assert(comparison.includes("Deferred until a selected mapping passes every applicable absolute gate"));
  assert(!comparison.includes("Approved by Kay Unkroth"));
});

await check("comparison links still resolve to retained historical artifacts", () => {
  const links = [...comparison.matchAll(/\]\((\.\.\/[^)]+)\)/g)].map((match) => match[1]);
  assert(links.length > 0);
  for (const link of new Set(links)) {
    assert(fs.existsSync(path.resolve(path.dirname(comparisonPath), link)), `Broken evidence link: ${link}`);
  }
});

await check("existing-run validation binds source, catalog, applicability, config, and complete results", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "config", "local-cas.json"), "utf8"));
  const valid = {
    schemaVersion: 2,
    evidenceIdentity: buildEvidenceIdentity(config),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicableScenarioIds(config),
    results: applicableScenarioIds(config).map((scenarioId) => ({
      scenarioId,
      status: "Pass",
    })),
  };
  assert.deepEqual(validateExistingRun(valid, config), []);

  const stale = structuredClone(valid);
  stale.evidenceIdentity.sourceRevision = "sha256:stale";
  assert(validateExistingRun(stale, config).some((error) => /sourceRevision/.test(error)));

  const missing = structuredClone(valid);
  missing.results.pop();
  assert(validateExistingRun(missing, config).some((error) => /missing expected results/.test(error)));

  const wrongConfig = structuredClone(valid);
  wrongConfig.configuration.adapter = "local-sqlite";
  assert(validateExistingRun(wrongConfig, config).some((error) => /identity does not match/.test(error)));
});

await check("comparison recomputes complete aggregate claims from linked campaign raws", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(root, "config", "provider-github-live.json"),
    "utf8",
  ));
  const applicable = applicableScenarioIds(config);
  const directory = path.join(root, ".test-state", "comparison-artifacts", config.configurationId);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  const resultFor = (scenarioId, statusFor, index) => {
    if (scenarioId === "S0-PER-004") {
      return {
        scenarioId,
        status: statusFor(scenarioId),
        durationMs: 1,
        evidence: { rawSamples: { small: { remoteCasMs: [10, 20] } } },
        measurements: { remoteCasP50Ms_small: 20 + index },
      };
    }
    if (scenarioId === "S0-PER-005") {
      return {
        scenarioId,
        status: statusFor(scenarioId),
        durationMs: 1,
        evidence: { total: 40 },
        measurements: {},
      };
    }
    return { scenarioId, status: statusFor(scenarioId), durationMs: 1, evidence: {}, measurements: {} };
  };
  const linkedRun = (index, {
    statusFor = () => "Pass",
    evidenceIdentity = buildEvidenceIdentity(config),
  } = {}) => ({
    schemaVersion: 2,
    evidenceIdentity,
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      runId: `s0-run-${index}`,
    },
    preflight: {
      sandbox: {
        effectiveTargetHash: `sha256:target-${index}`,
        approval: {
          approver: "Synthetic Reviewer",
          approvedAt: "2026-09-03T20:00:00.000Z",
          reference: `syn-${index}`,
          targetHash: `sha256:target-${index}`,
        },
      },
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicable,
    results: applicable.map((scenarioId) => resultFor(scenarioId, statusFor, index)),
  });
  const writeCampaign = (index, run) => {
    const name = `campaign-${index}`;
    fs.mkdirSync(path.join(directory, name), { recursive: true });
    const raw = `${name}/raw-results.json`;
    const report = `${name}/outcome.md`;
    const rawBytes = Buffer.from(JSON.stringify(run));
    const reportBytes = Buffer.from(`# ${name}\n`);
    fs.writeFileSync(path.join(directory, raw), rawBytes);
    fs.writeFileSync(path.join(directory, report), reportBytes);
    return {
      name,
      runId: `s0-run-${index}`,
      raw,
      rawSha256: `sha256:${sha256(rawBytes)}`,
      report,
      reportSha256: `sha256:${sha256(reportBytes)}`,
    };
  };
  const linkedCampaigns = [];
  const campaigns = [];
  const approvals = [];
  for (let index = 1; index <= 3; index++) {
    const linked = linkedRun(index);
    linkedCampaigns.push({ name: `campaign-${index}`, run: linked });
    campaigns.push(writeCampaign(index, linked));
    approvals.push({
      name: `campaign-${index}`,
      effectiveTargetHash: `sha256:target-${index}`,
      approval: {
        approver: "Synthetic Reviewer",
        approvedAt: "2026-09-03T20:00:00.000Z",
        reference: `syn-${index}`,
        targetHash: `sha256:target-${index}`,
      },
    });
  }
  const aggregateResults = combineResults(linkedCampaigns, applicable);
  const run = {
    schemaVersion: 2,
    evidenceIdentity: buildEvidenceIdentity(config),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      campaignCount: 3,
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicable,
    results: aggregateResults,
    campaigns,
    campaignApprovals: approvals,
    campaignVariability: campaignVariability(linkedCampaigns),
  };
  const aggregatePath = path.join(directory, "raw-results.json");
  assert.deepEqual(validateExistingRun(run, config, { artifactPath: aggregatePath }), []);

  // A 0ms aggregate measurement against the linked raw distribution must fail.
  const zeroed = structuredClone(run);
  zeroed.results.find((result) => result.scenarioId === "S0-PER-004").measurements.remoteCasP50Ms_small = 0;
  assert(
    validateExistingRun(zeroed, config, { artifactPath: aggregatePath })
      .some((error) => /S0-PER-004 aggregate result does not match the recomputed linked-campaign result/.test(error)),
    "a fabricated 0ms measurement must be rejected",
  );

  // Fabricated raw samples must fail.
  const rawTampered = structuredClone(run);
  rawTampered.results.find((result) => result.scenarioId === "S0-PER-004").evidence.rawSamples.small.remoteCasMs = [1];
  assert(
    validateExistingRun(rawTampered, config, { artifactPath: aggregatePath })
      .some((error) => /S0-PER-004 aggregate result does not match the recomputed/.test(error)),
    "fabricated raw samples must be rejected",
  );

  // A fabricated complexity total must fail.
  const complexityTampered = structuredClone(run);
  complexityTampered.results.find((result) => result.scenarioId === "S0-PER-005").evidence.total = 1;
  assert(
    validateExistingRun(complexityTampered, config, { artifactPath: aggregatePath })
      .some((error) => /S0-PER-005 aggregate result does not match the recomputed/.test(error)),
    "a fabricated complexity total must be rejected",
  );

  // Bogus campaign position keys must be rejected.
  const bogusKeys = structuredClone(run);
  bogusKeys.results.find((result) => result.scenarioId === "S0-PER-004").evidence.campaigns =
    { "campaign-forged": { status: "Pass", evidence: {}, measurements: {} } };
  assert(
    validateExistingRun(bogusKeys, config, { artifactPath: aggregatePath })
      .some((error) => /does not match the recomputed linked-campaign result/.test(error)),
    "bogus campaign keys must be rejected",
  );

  // A status not supported by the linked raws must be rejected.
  const wrongStatus = structuredClone(run);
  wrongStatus.results.find((result) => result.scenarioId === "S0-PER-005").status = "Fail";
  assert(
    validateExistingRun(wrongStatus, config, { artifactPath: aggregatePath })
      .some((error) => /does not match the recomputed/.test(error)),
    "an unsupported aggregate status must be rejected",
  );

  // A mutated campaignVariability must be rejected.
  const variabilityTampered = structuredClone(run);
  variabilityTampered.campaignVariability = { remoteCasP50Ms_small: { count: 3, min: 0, p50: 0, p95: 0, max: 0, mean: 0, stddev: 0 } };
  assert(
    validateExistingRun(variabilityTampered, config, { artifactPath: aggregatePath })
      .some((error) => /campaignVariability does not match/.test(error)),
    "a mutated campaignVariability must be rejected",
  );

  // A missing campaignVariability field must be rejected.
  const variabilityMissing = structuredClone(run);
  delete variabilityMissing.campaignVariability;
  assert(
    validateExistingRun(variabilityMissing, config, { artifactPath: aggregatePath })
      .some((error) => /aggregate is missing campaignVariability/.test(error)),
    "a missing campaignVariability field must be rejected",
  );

  // An approval that does not match the linked preflight must be rejected.
  const approvalMismatch = structuredClone(run);
  approvalMismatch.campaignApprovals[0].approval.reference = "syn-forged";
  assert(
    validateExistingRun(approvalMismatch, config, { artifactPath: aggregatePath })
      .some((error) => /approval record does not match the linked preflight/.test(error)),
    "a campaign approval mismatch must be rejected",
  );

  // A modified linked artifact breaks the byte digest.
  fs.appendFileSync(path.join(directory, campaigns[0].raw), "\n");
  assert(
    validateExistingRun(run, config, { artifactPath: aggregatePath })
      .some((error) => /digest mismatch/.test(error)),
    "a changed linked artifact must be rejected",
  );

  // A valid-schema but unrelated/stale linked raw (matching byte digest) must
  // still fail identity binding.
  const staleRun = linkedRun(1, {
    evidenceIdentity: { ...buildEvidenceIdentity(config), sourceRevision: "sha256:stale-unrelated" },
  });
  campaigns[0] = { ...campaigns[0], ...writeCampaign(1, staleRun) };
  run.campaigns = campaigns;
  assert(
    validateExistingRun(run, config, { artifactPath: aggregatePath })
      .some((error) => /identity does not match/.test(error)),
    "a stale/unrelated linked raw must be rejected on identity",
  );

  fs.rmSync(path.join(root, ".test-state"), { recursive: true, force: true });
});

await check("decision selection is derived from eligibility and explicit mapping choice", () => {
  const mappings = [
    { id: "MAP-HYBRID-SQLITE", status: "Eligible" },
    { id: "MAP-ENVELOPE", status: "Eligible" },
  ];
  assert.deepEqual(deriveDecision(mappings), {
    status: "Selection required",
    mapping: null,
    eligibleMappings: ["MAP-HYBRID-SQLITE", "MAP-ENVELOPE"],
    approval: "Pending",
  });
  assert.equal(deriveDecision(mappings, "MAP-ENVELOPE").mapping, "MAP-ENVELOPE");
  assert.equal(deriveDecision(mappings.map((mapping) => ({ ...mapping, status: "Incomplete" }))).status, "Incomplete");
});

await check("--use-existing produces incomplete comparison data without rerunning providers", async () => {
  const built = await buildComparison({ selectedConfigs: configPaths, useExisting: true });
  assert.equal(built.decision.status, "Incomplete");
  assert.equal(built.decision.mapping, null);
  assert.equal(built.validationFailures.length, 5);
  assert(built.runs.every(({ gates }) => gates.eligible === "Incomplete"));
});

await check("invalid performance evidence is excluded from architecture rationale", () => {
  assert(comparison.includes("No current decision-grade performance measurement is eligible"));
  assert(!comparison.includes("lower measured mutation/open/backup/restore latency"));
});

await check("comparison and ADR identify SQLite serialization as structural", () => {
  const adr = fs.readFileSync(
    path.join(root, "ADR-s0-persistence-architecture.md"),
    "utf8",
  );
  assert(comparison.includes("Known structural finding"));
  assert(comparison.includes("A rerun alone cannot close"));
  assert(adr.includes("structural failure"));
  assert(adr.includes("rerun alone cannot close"));
});

await check("comparison resolves and verifies the separate synced-folder (S0-BCK-006) evidence", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(root, "config", "provider-onedrive-live.json"),
    "utf8",
  ));
  const stateRoot = path.join(root, ".test-state", "sync-verify");
  const resultsRoot = path.join(stateRoot, "results");
  const aggregateDir = path.join(resultsRoot, "CFG-ONEDRIVE-LIVE");
  const syncDir = path.join(resultsRoot, "CFG-ONEDRIVE-SYNC");
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.mkdirSync(aggregateDir, { recursive: true });
  fs.mkdirSync(syncDir, { recursive: true });
  const syncRun = {
    schemaVersion: 2,
    evidenceIdentity: buildEvidenceIdentity(config),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      runId: "s0-onedrive-sync",
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicableScenarioIds(config),
    results: [{ scenarioId: "S0-BCK-006", status: "Incomplete" }],
  };
  const syncRawBytes = Buffer.from(JSON.stringify(syncRun));
  const syncReportBytes = Buffer.from("# CFG-ONEDRIVE-SYNC\n");
  const writeSyncArtifacts = () => {
    fs.writeFileSync(path.join(syncDir, "raw-results.json"), syncRawBytes);
    fs.writeFileSync(path.join(syncDir, "outcome.md"), syncReportBytes);
  };
  writeSyncArtifacts();
  const aggregatePath = path.join(aggregateDir, "raw-results.json");
  const run = {
    results: [{ scenarioId: "S0-BCK-006", status: "Incomplete" }],
    separateSync: {
      configurationId: "CFG-ONEDRIVE-SYNC",
      scenarioId: "S0-BCK-006",
      raw: "../CFG-ONEDRIVE-SYNC/raw-results.json",
      rawSha256: `sha256:${sha256(syncRawBytes)}`,
      report: "../CFG-ONEDRIVE-SYNC/outcome.md",
      reportSha256: `sha256:${sha256(syncReportBytes)}`,
      evidenceIdentity: buildEvidenceIdentity(config),
    },
  };
  assert.deepEqual(verifySeparateSync(run, config, { artifactPath: aggregatePath }), []);

  fs.appendFileSync(path.join(syncDir, "raw-results.json"), "\n");
  assert(
    verifySeparateSync(run, config, { artifactPath: aggregatePath })
      .some((error) => /digest mismatch/.test(error)),
    "a changed synced-folder artifact must be rejected",
  );
  writeSyncArtifacts();

  fs.rmSync(path.join(syncDir, "outcome.md"));
  assert(
    verifySeparateSync(run, config, { artifactPath: aggregatePath })
      .some((error) => /artifact is missing/.test(error)),
    "a deleted synced-folder artifact must be rejected",
  );
  writeSyncArtifacts();

  const mismatched = structuredClone(run);
  mismatched.separateSync.evidenceIdentity.configRevision = "sha256:mismatch";
  assert(
    verifySeparateSync(mismatched, config, { artifactPath: aggregatePath })
      .some((error) => /mismatched configuration/.test(error)),
    "a mismatched sync configuration must be rejected",
  );

  assert(
    verifySeparateSync({ results: run.results }, config, { artifactPath: aggregatePath })
      .some((error) => /missing separate OneDrive/.test(error)),
    "a missing separate-sync record must be rejected",
  );

  // A retained S0-BCK-006 Pass with empty/absent signed proof must be rejected
  // when the full proof is re-verified during comparison.
  const passSyncRun = {
    ...syncRun,
    results: [{ scenarioId: "S0-BCK-006", status: "Pass", evidence: {} }],
  };
  const passRawBytes = Buffer.from(JSON.stringify(passSyncRun));
  fs.writeFileSync(path.join(syncDir, "raw-results.json"), passRawBytes);
  const passRun = {
    results: [{ scenarioId: "S0-BCK-006", status: "Pass" }],
    separateSync: {
      configurationId: "CFG-ONEDRIVE-SYNC",
      scenarioId: "S0-BCK-006",
      raw: "../CFG-ONEDRIVE-SYNC/raw-results.json",
      rawSha256: `sha256:${sha256(passRawBytes)}`,
      report: "../CFG-ONEDRIVE-SYNC/outcome.md",
      reportSha256: `sha256:${sha256(syncReportBytes)}`,
      evidenceIdentity: buildEvidenceIdentity(config),
    },
  };
  assert(
    verifySeparateSync(passRun, config, { artifactPath: aggregatePath })
      .some((error) => /proof .*(proof is missing|authorization context is missing)/.test(error)),
    "a claimed sync Pass with empty signed proof/authorization must be rejected",
  );

  fs.rmSync(path.join(root, ".test-state"), { recursive: true, force: true });
});

await check("separate sync comparison verifies the complete signed proof, approval, and result", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(root, "config", "provider-onedrive-live.json"),
    "utf8",
  ));
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const fingerprint = publicKeyFingerprint(publicKey);
  config.sandbox.syncProfile.trustedSignerFingerprint = fingerprint;
  const configRevision = decisionConfigRevision(config);
  const identity = buildEvidenceIdentity(config);
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const targetHash = "sha256:sync-target-hash-test";
  const base = Date.parse("2026-09-04T00:00:00.000Z");
  const validatedAt = new Date(base).toISOString();
  const proof = {
    schemaVersion: 1,
    kind: EVIDENCE_KIND,
    syncTargetHash: targetHash,
    configRevision,
    signerFingerprint: fingerprint,
    validatedAt,
    clients: [
      { clientId: "device-A", observedAt: new Date(base - 120000).toISOString(), operations: ["create"] },
      { clientId: "device-B", observedAt: new Date(base - 60000).toISOString(), operations: ["edit"] },
    ],
    outcomes: { conflict: true },
    approval: {
      targetHash,
      approver: "Windows sync-client test owner",
      approvedAt: new Date(base - 120000).toISOString(),
      reference: "syn-proof-1",
    },
  };
  proof.signature = crypto.sign(null, evidenceSigningPayload(proof), privateKey).toString("base64");
  // The authorization is derived from the signed proof.
  const authorization = {
    syncTargetHash: proof.syncTargetHash,
    syncApproval: proof.approval,
    configRevision: proof.configRevision,
    signerFingerprint: proof.signerFingerprint,
    signerPublicKey: pem,
    validatedAt: proof.validatedAt,
  };
  const bckEvidence = {
    crossClientEvidence: proof,
    syncAuthorization: authorization,
    signerPublicKey: pem,
    providerApiCasUsed: false,
  };
  const stateRoot = path.join(root, ".test-state", "sync-proof");
  const resultsRoot = path.join(stateRoot, "results");
  const aggregateDir = path.join(resultsRoot, "CFG-ONEDRIVE-LIVE");
  const syncDir = path.join(resultsRoot, "CFG-ONEDRIVE-SYNC");
  fs.rmSync(stateRoot, { recursive: true, force: true });
  fs.mkdirSync(aggregateDir, { recursive: true });
  fs.mkdirSync(syncDir, { recursive: true });
  const linkedBck = { scenarioId: "S0-BCK-006", status: "Pass", durationMs: 1, evidence: bckEvidence, measurements: {} };
  const syncRun = {
    schemaVersion: 2,
    evidenceIdentity: identity,
    completedAt: new Date(base + 1000).toISOString(),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      runId: "s0-onedrive-sync",
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicableScenarioIds(config),
    results: [linkedBck],
  };
  const syncRawBytes = Buffer.from(JSON.stringify(syncRun));
  const syncReportBytes = Buffer.from("# CFG-ONEDRIVE-SYNC\n");
  fs.writeFileSync(path.join(syncDir, "raw-results.json"), syncRawBytes);
  fs.writeFileSync(path.join(syncDir, "outcome.md"), syncReportBytes);
  const aggregatePath = path.join(aggregateDir, "raw-results.json");
  const aggregateBck = {
    ...linkedBck,
    evidence: {
      ...bckEvidence,
      separateCompatibilityReport: "../CFG-ONEDRIVE-SYNC/outcome.md",
      providerCampaigns: "Not part of provider-API CAS campaigns",
    },
  };
  const run = {
    results: [aggregateBck],
    campaignApprovals: [1, 2, 3].map((index) => ({
      name: `campaign-${index}`,
      effectiveTargetHash: `sha256:provider-target-${index}`,
      approval: {
        targetHash: `sha256:provider-target-${index}`,
        approver: "Provider campaign approver",
        approvedAt: new Date(base - 120000).toISOString(),
        reference: `syn-provider-${index}`,
      },
    })),
    separateSync: {
      configurationId: "CFG-ONEDRIVE-SYNC",
      scenarioId: "S0-BCK-006",
      raw: "../CFG-ONEDRIVE-SYNC/raw-results.json",
      rawSha256: `sha256:${sha256(syncRawBytes)}`,
      report: "../CFG-ONEDRIVE-SYNC/outcome.md",
      reportSha256: `sha256:${sha256(syncReportBytes)}`,
      evidenceIdentity: identity,
      syncAuthorization: authorization,
      crossClientEvidence: proof,
    },
  };
  assert.equal(config.sandbox.approval, undefined);
  assert.deepEqual(verifySeparateSync(run, config, { artifactPath: aggregatePath }), []);
  const reusedProviderApproval = structuredClone(run);
  reusedProviderApproval.campaignApprovals[1].effectiveTargetHash = targetHash;
  reusedProviderApproval.campaignApprovals[1].approval.targetHash = targetHash;
  assert(
    verifySeparateSync(reusedProviderApproval, config, { artifactPath: aggregatePath })
      .some((error) => /reuses the provider-API target hash/.test(error)),
    "retained comparison must reject a sync proof authorized by the provider target hash",
  );

  // Mutating the retained sync approval in both copies breaks the signed binding.
  const badApproval = structuredClone(run);
  badApproval.separateSync.syncAuthorization.syncApproval = {
    ...badApproval.separateSync.syncAuthorization.syncApproval, reference: "forged",
  };
  const badLinked = JSON.parse(fs.readFileSync(path.join(syncDir, "raw-results.json"), "utf8"));
  badLinked.results[0].evidence.syncAuthorization.syncApproval.reference = "forged";
  fs.writeFileSync(path.join(syncDir, "raw-results.json"), Buffer.from(JSON.stringify(badLinked)));
  badApproval.separateSync.rawSha256 = `sha256:${sha256(fs.readFileSync(path.join(syncDir, "raw-results.json")))}`;
  assert(
    verifySeparateSync(badApproval, config, { artifactPath: aggregatePath })
      .some((error) => /authorization is not bound to the signed proof/.test(error)),
    "a mutated retained sync approval must be rejected",
  );
  fs.writeFileSync(path.join(syncDir, "raw-results.json"), syncRawBytes);

  // Mutating the complete aggregate result must fail the full-result comparison.
  const badResult = structuredClone(run);
  badResult.results[0].evidence.conflictOutcome = true;
  assert(
    verifySeparateSync(badResult, config, { artifactPath: aggregatePath })
      .some((error) => /result does not match the linked sync run result/.test(error)),
    "a mutated sync result must be rejected",
  );

  fs.rmSync(path.join(root, ".test-state"), { recursive: true, force: true });
});

await check("campaignVariability must be a non-null plain object even when recomputed variability is empty", () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(root, "config", "provider-github-live.json"),
    "utf8",
  ));
  const applicable = applicableScenarioIds(config);
  const directory = path.join(root, ".test-state", "cv-type", config.configurationId);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  const linkedRun = (index) => ({
    schemaVersion: 2,
    evidenceIdentity: buildEvidenceIdentity(config),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      runId: `s0-run-${index}`,
    },
    preflight: {
      sandbox: {
        effectiveTargetHash: `sha256:t-${index}`,
        approval: { approver: "R", approvedAt: "2026-09-03T20:00:00.000Z", reference: `syn-${index}`, targetHash: `sha256:t-${index}` },
      },
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicable,
    results: applicable.map((scenarioId) => ({ scenarioId, status: "Pass", durationMs: 1, evidence: {}, measurements: {} })),
  });
  const writeCampaign = (index, run) => {
    const name = `campaign-${index}`;
    fs.mkdirSync(path.join(directory, name), { recursive: true });
    const raw = `${name}/raw-results.json`;
    const report = `${name}/outcome.md`;
    const rawBytes = Buffer.from(JSON.stringify(run));
    const reportBytes = Buffer.from(`# ${name}\n`);
    fs.writeFileSync(path.join(directory, raw), rawBytes);
    fs.writeFileSync(path.join(directory, report), reportBytes);
    return { name, runId: `s0-run-${index}`, raw, rawSha256: `sha256:${sha256(rawBytes)}`, report, reportSha256: `sha256:${sha256(reportBytes)}` };
  };
  const linkedCampaigns = [];
  const campaigns = [];
  const approvals = [];
  for (let index = 1; index <= 3; index++) {
    const linked = linkedRun(index);
    linkedCampaigns.push({ name: `campaign-${index}`, run: linked });
    campaigns.push(writeCampaign(index, linked));
    approvals.push({ name: `campaign-${index}`, effectiveTargetHash: `sha256:t-${index}`, approval: { approver: "R", approvedAt: "2026-09-03T20:00:00.000Z", reference: `syn-${index}`, targetHash: `sha256:t-${index}` } });
  }
  assert.deepEqual(campaignVariability(linkedCampaigns), {}, "this setup must recompute an empty variability object");
  const baseRun = {
    schemaVersion: 2,
    evidenceIdentity: buildEvidenceIdentity(config),
    configuration: {
      configurationId: config.configurationId,
      adapter: config.adapter,
      backingPath: config.backingPath,
      applicabilityProfile: applicabilityProfile(config),
      campaignCount: 3,
    },
    catalog: SCENARIOS.map((scenario) => ({ ...scenario })),
    applicableScenarioIds: applicable,
    results: combineResults(linkedCampaigns, applicable),
    campaigns,
    campaignApprovals: approvals,
  };
  const aggregatePath = path.join(directory, "raw-results.json");
  assert.deepEqual(
    validateExistingRun({ ...baseRun, campaignVariability: {} }, config, { artifactPath: aggregatePath }),
    [],
    "an explicit empty campaignVariability object must pass",
  );
  for (const bad of [null, false, 0, "variability", []]) {
    assert(
      validateExistingRun({ ...baseRun, campaignVariability: bad }, config, { artifactPath: aggregatePath })
        .some((error) => /campaignVariability must be a non-null plain object/.test(error)),
      `campaignVariability=${JSON.stringify(bad)} must be rejected even with empty recomputed variability`,
    );
  }
  fs.rmSync(path.join(root, ".test-state"), { recursive: true, force: true });
});

console.log(`s0-comparison-report: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
