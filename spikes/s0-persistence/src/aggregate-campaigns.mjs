#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applicabilityRevision,
  buildEvidenceIdentity,
  catalogRevision,
  currentSourceRevision,
  sha256,
  stableJson,
} from "./evidence-identity.mjs";
import { applicableScenarioIds } from "./applicability.mjs";
import { effectiveResult, naApprovalErrors } from "./eligibility.mjs";
import { renderOutcomeReport } from "./result-writer.mjs";
import { SCENARIOS } from "./scenario-catalog.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONFIG_FILE_BY_ID = Object.freeze({
  "CFG-ONEDRIVE-LIVE": "provider-onedrive-live.json",
  "CFG-ADO-LIVE": "provider-ado-live.json",
  "CFG-GITHUB-LIVE": "provider-github-live.json",
});

export function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
    : 0;
  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
  return {
    count: values.length,
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    max: sorted.at(-1),
    mean,
    stddev: Math.sqrt(variance),
  };
}

function assertExactScenarioSet(campaign, expectedIds) {
  const ids = campaign.run.results.map((result) => result.scenarioId);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`${campaign.name} duplicates scenario ${duplicate}`);
  const missing = expectedIds.filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !expectedIds.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `${campaign.name} scenario set mismatch; missing=${missing.join(",") || "none"}; ` +
      `unexpected=${unexpected.join(",") || "none"}`,
    );
  }
}

export function validateCampaigns(campaigns, {
  configurationId = campaigns[0]?.run?.configuration?.configurationId,
  requiredCampaigns = 3,
  config = null,
} = {}) {
  if (campaigns.length !== requiredCampaigns) {
    throw new Error(`${configurationId} requires exactly ${requiredCampaigns} complete campaigns`);
  }
  const unique = (values) => new Set(values).size === values.length;
  if (!unique(campaigns.map((campaign) => campaign.name)) ||
      !unique(campaigns.map((campaign) => campaign.run?.configuration?.runId)) ||
      !unique(campaigns.map((campaign) => campaign.rawPath)) ||
      !unique(campaigns.map((campaign) => campaign.rawSha256)) ||
      !unique(campaigns.map((campaign) => campaign.reportPath)) ||
      !unique(campaigns.map((campaign) => campaign.reportSha256))) {
    throw new Error(`${configurationId} campaigns must have distinct names, run IDs, artifact paths, and digests`);
  }
  if (campaigns.some((campaign) =>
    !campaign.rawPath || !campaign.rawSha256 || !campaign.reportPath || !campaign.reportSha256)) {
    throw new Error(`${configurationId} campaigns must retain raw/report artifact paths and digests`);
  }
  const first = campaigns[0].run;
  const expectedIds = [...(first.applicableScenarioIds || [])];
  if (!expectedIds.length) throw new Error(`${configurationId} has no expected scenario set`);
  const expectedIdentity = first.evidenceIdentity;
  const configFile = CONFIG_FILE_BY_ID[configurationId];
  if (!config && !configFile) throw new Error(`No authoritative config registered for ${configurationId}`);
  const currentConfig = config ||
    JSON.parse(fs.readFileSync(path.join(root, "config", configFile), "utf8"));
  const currentConfigRevision = buildEvidenceIdentity(currentConfig).configRevision;
  const currentIdentity = {
    sourceRevision: currentSourceRevision(),
    catalogRevision: catalogRevision(SCENARIOS),
    applicabilityRevision: applicabilityRevision(),
  };
  const expectedCatalog = SCENARIOS.map((scenario) => ({ ...scenario }));
  const currentApplicable = applicableScenarioIds(first.configuration);
  if (stableJson(first.catalog) !== stableJson(expectedCatalog)) {
    throw new Error(`${configurationId} catalog snapshot is incomplete or stale`);
  }
  if (stableJson(expectedIds) !== stableJson(currentApplicable)) {
    throw new Error(`${configurationId} applicability set is incomplete or stale`);
  }
  for (const campaign of campaigns) {
    const run = campaign.run;
    if (run.schemaVersion !== 2) throw new Error(`${campaign.name} uses an unsupported result schema`);
    if (run.configuration?.configurationId !== configurationId) {
      throw new Error(`${campaign.name} belongs to ${run.configuration?.configurationId}`);
    }
    if (!run.evidenceIdentity ||
        run.evidenceIdentity.sourceRevision !== currentIdentity.sourceRevision ||
        run.evidenceIdentity.catalogRevision !== currentIdentity.catalogRevision ||
        run.evidenceIdentity.applicabilityRevision !== currentIdentity.applicabilityRevision ||
        run.evidenceIdentity.configRevision !== currentConfigRevision) {
      throw new Error(`${campaign.name} is stale for the current source/catalog/applicability revision`);
    }
    const approval = run.preflight?.sandbox?.approval;
    const targetHash = run.preflight?.sandbox?.effectiveTargetHash;
    if (!targetHash ||
        approval?.targetHash !== targetHash ||
        typeof approval?.approver !== "string" || !approval.approver.trim() ||
        typeof approval?.approvedAt !== "string" || !Number.isFinite(Date.parse(approval.approvedAt)) ||
        typeof approval?.reference !== "string" || !approval.reference.trim()) {
      throw new Error(`${campaign.name} lacks an approved effective provider target hash`);
    }
    if (stableJson(run.evidenceIdentity) !== stableJson(expectedIdentity) ||
        stableJson(run.catalog) !== stableJson(first.catalog) ||
        stableJson(run.applicableScenarioIds) !== stableJson(expectedIds)) {
      throw new Error(`${campaign.name} is not identity-compatible with the other campaigns`);
    }
    assertExactScenarioSet(campaign, expectedIds);
    for (const result of run.results) {
      const approvalErrors = naApprovalErrors(result);
      if (approvalErrors.length) {
        throw new Error(
          `${campaign.name} ${result.scenarioId} N/A lacks ${approvalErrors.join(", ")}`,
        );
      }
    }
  }
  return expectedIds;
}

function pooledRawSamples(results) {
  const pooled = {};
  for (const result of results) {
    for (const [scale, samples] of Object.entries(result.evidence?.rawSamples || {})) {
      pooled[scale] ||= {};
      for (const [name, values] of Object.entries(samples || {})) {
        if (!Array.isArray(values) || !values.every(Number.isFinite)) continue;
        pooled[scale][name] ||= [];
        pooled[scale][name].push(...values);
      }
    }
  }
  return pooled;
}

function rawName(base, unit) {
  if (unit === "Ms" || unit === "Bytes") return `${base}${unit}`;
  return base;
}

function pooledMeasurements(results, rawSamples) {
  const measurements = {};
  const names = new Set(results.flatMap((result) => Object.keys(result.measurements || {})));
  for (const name of names) {
    const summary = name.match(/^(.+?)(Min|P50|P95|Max|Mean|StdDev)(Ms|Bytes|Ratio)?_([^_]+)$/);
    if (summary) {
      const [, base, statistic, unit = "", scale] = summary;
      const values = rawSamples[scale]?.[rawName(base, unit)];
      const pooled = Array.isArray(values) ? distribution(values) : null;
      if (!pooled) continue;
      const key = {
        Min: "min",
        P50: "p50",
        P95: "p95",
        Max: "max",
        Mean: "mean",
        StdDev: "stddev",
      }[statistic];
      measurements[name] = pooled[key];
      continue;
    }
    const values = results.map((result) => result.measurements?.[name]);
    if (values.length === results.length && values.every(Number.isFinite)) {
      measurements[name] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
  }
  return measurements;
}

function pooledEvidence(representative, results, rawSamples) {
  const evidence = {
    ...(representative.evidence || {}),
    ...(Object.keys(rawSamples).length ? { rawSamples } : {}),
  };
  for (const [scale, samples] of Object.entries(rawSamples)) {
    const requests = samples.requestsPerMutation || [];
    const transferred = samples.transferredBytesPerMutation || [];
    const requestBytes = samples.requestBytesPerMutation || [];
    const responseBytes = samples.responseBytesPerMutation || [];
    const retries = samples.retriesPerMutation || [];
    const throttleResponses = samples.throttleResponsesPerMutation || [];
    const retryAfterSeconds = samples.retryAfterSeconds || [];
    const backoff = samples.backoffMsPerMutation || [];
    if (requests.length) {
      evidence[`repetitions_${scale}`] = requests.length;
      evidence[`requestsPerMutation_${scale}`] =
        requests.reduce((sum, value) => sum + value, 0) / requests.length;
      evidence[`requestCount_${scale}`] = requests.reduce((sum, value) => sum + value, 0);
    }
    if (transferred.length) {
      evidence[`bytesPerMutation_${scale}`] =
        transferred.reduce((sum, value) => sum + value, 0) / transferred.length;
    }
    if (requestBytes.length) {
      evidence[`requestBytes_${scale}`] = requestBytes.reduce((sum, value) => sum + value, 0);
    }
    if (responseBytes.length) {
      evidence[`responseBytes_${scale}`] = responseBytes.reduce((sum, value) => sum + value, 0);
    }
    if (retries.length) {
      evidence[`retries_${scale}`] = retries.reduce((sum, value) => sum + value, 0);
    }
    if (throttleResponses.length) {
      evidence[`throttleResponses_${scale}`] =
        throttleResponses.reduce((sum, value) => sum + value, 0);
    }
    if (retryAfterSeconds.length) {
      evidence[`retryAfterSeconds_${scale}`] = [...retryAfterSeconds];
    }
    if (backoff.length) {
      evidence[`backoffMs_${scale}`] = backoff.reduce((sum, value) => sum + value, 0);
    }
  }
  if (results.every((result) => Number.isFinite(result.evidence?.throttleResponses))) {
    evidence.throttleResponses = results.reduce(
      (sum, result) => sum + result.evidence.throttleResponses,
      0,
    );
  }
  const retryAfter = results.flatMap(
    (result) => result.evidence?.throttleRetryAfterSeconds || [],
  );
  if (retryAfter.length) evidence.throttleRetryAfterSeconds = retryAfter;
  if (results.every((result) => Number.isFinite(result.evidence?.throttleRetries))) {
    evidence.throttleRetries = results.reduce(
      (sum, result) => sum + result.evidence.throttleRetries,
      0,
    );
  }
  if (results.every((result) => Number.isFinite(result.evidence?.throttleBackoffMs))) {
    evidence.throttleBackoffMs = results.reduce(
      (sum, result) => sum + result.evidence.throttleBackoffMs,
      0,
    );
  }
  return evidence;
}

export function combineStatuses(statuses) {
  return statuses.includes("Fail") ? "Fail"
    : statuses.includes("Blocked") ? "Blocked"
      : statuses.includes("Incomplete") ? "Incomplete"
        : statuses.length && statuses.every((item) => item === "N/A") ? "N/A"
          : statuses.length && statuses.every((item) => item === "Pass") ? "Pass"
            : "Incomplete";
}

export function combineResults(campaigns, expectedIds) {
  return expectedIds.map((scenarioId) => {
    const positioned = campaigns.map((campaign) => ({
      campaign,
      result: effectiveResult(
        campaign.run.results.find((result) => result.scenarioId === scenarioId),
      ),
    }));
    const results = positioned.map(({ result }) => result);
    const statuses = results.map((result) => result.status);
    const status = combineStatuses(statuses);
    const representative = results.find((result) => result.status === status) || results[0];
    const rawSamples = pooledRawSamples(results);
    return {
      ...representative,
      status,
      durationMs: results.reduce((sum, result) => sum + (result.durationMs || 0), 0) / results.length,
      evidence: {
        ...pooledEvidence(representative, results, rawSamples),
        campaigns: Object.fromEntries(positioned.map(({ campaign, result }) => [
          campaign.name,
          {
            status: result.status,
            evidence: result.evidence || {},
            measurements: result.measurements || {},
          },
        ])),
      },
      measurements: pooledMeasurements(results, rawSamples),
    };
  });
}

export function campaignVariability(campaigns) {
  const names = new Set(campaigns.flatMap((campaign) => {
    const performance = campaign.run.results.find((result) => result.scenarioId === "S0-PER-004");
    return Object.keys(performance?.measurements || {});
  }));
  const result = {};
  for (const name of names) {
    const values = campaigns.map((campaign) => {
      const performance = campaign.run.results.find((item) => item.scenarioId === "S0-PER-004");
      return performance?.measurements?.[name];
    }).filter(Number.isFinite);
    if (values.length) result[name] = distribution(values);
  }
  return result;
}

export function loadCampaigns(configurationId) {
  const directory = path.join(root, "results", configurationId);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^campaign-\d+$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))
    .map((entry) => {
      const rawPath = path.join(directory, entry.name, "raw-results.json");
      if (!fs.existsSync(rawPath)) {
        throw new Error(`${entry.name} is missing raw-results.json`);
      }
      const reportPath = path.join(directory, entry.name, "outcome.md");
      if (!fs.existsSync(reportPath)) {
        throw new Error(`${entry.name} is missing outcome.md`);
      }
      const rawBytes = fs.readFileSync(rawPath);
      const reportBytes = fs.readFileSync(reportPath);
      return {
        name: entry.name,
        rawPath,
        reportPath,
        rawSha256: `sha256:${sha256(rawBytes)}`,
        reportSha256: `sha256:${sha256(reportBytes)}`,
        run: JSON.parse(rawBytes.toString("utf8")),
      };
    });
}

export function aggregateCampaigns(configurationId, campaigns) {
  const expectedIds = validateCampaigns(campaigns, { configurationId });
  const first = campaigns[0].run;
  const aggregate = {
    ...first,
    schemaVersion: 2,
    harnessRevision: `${first.harnessRevision}-campaign-aggregate`,
    startedAt: campaigns[0].run.startedAt,
    completedAt: campaigns.at(-1).run.completedAt,
    configuration: {
      ...first.configuration,
      runId: `${configurationId.toLowerCase()}-aggregate`,
      campaignCount: campaigns.length,
      campaignRunIds: campaigns.map((campaign) => campaign.run.configuration.runId),
    },
    preflight: {
      ...first.preflight,
      runId: `${configurationId.toLowerCase()}-aggregate`,
      sandbox: {
        ...first.preflight.sandbox,
        ownershipMarker: "redacted-per-campaign",
        namespace: "redacted-per-campaign",
        cleanup: { manifestId: "see-campaign-preflights", expiresAt: "see-campaign-preflights" },
        effectiveTargetHash: "see-campaign-preflights",
        approval: null,
      },
    },
    environment: {
      ...first.environment,
      campaignCount: campaigns.length,
    },
    results: combineResults(campaigns, expectedIds),
    campaigns: campaigns.map((campaign) => ({
      name: campaign.name,
      runId: campaign.run.configuration.runId,
      raw: `${campaign.name}/raw-results.json`,
      rawSha256: campaign.rawSha256,
      report: `${campaign.name}/outcome.md`,
      reportSha256: campaign.reportSha256,
    })),
    campaignApprovals: campaigns.map((campaign) => ({
      name: campaign.name,
      effectiveTargetHash: campaign.run.preflight.sandbox.effectiveTargetHash,
      approval: campaign.run.preflight.sandbox.approval,
    })),
    campaignVariability: campaignVariability(campaigns),
  };
  if (configurationId === "CFG-ONEDRIVE-LIVE") {
    const separateSync = buildSeparateSync(configurationId);
    aggregate.separateSync = separateSync.record;
    const index = aggregate.results.findIndex((result) => result.scenarioId === "S0-BCK-006");
    if (index >= 0) {
      aggregate.results[index] = {
        ...separateSync.result,
        evidence: {
          ...(separateSync.result.evidence || {}),
          separateCompatibilityReport: separateSync.record.report,
          providerCampaigns: "Not part of provider-API CAS campaigns",
        },
      };
    }
  }
  return aggregate;
}

export function authoritativeSyncConfig(configurationId) {
  const configFile = CONFIG_FILE_BY_ID[configurationId];
  if (!configFile) throw new Error(`No authoritative config registered for ${configurationId}`);
  return JSON.parse(fs.readFileSync(path.join(root, "config", configFile), "utf8"));
}

export function buildSeparateSync(configurationId, {
  syncConfigurationId = "CFG-ONEDRIVE-SYNC",
} = {}) {
  const syncDir = path.join(root, "results", syncConfigurationId);
  const syncRawPath = path.join(syncDir, "raw-results.json");
  const syncReportPath = path.join(syncDir, "outcome.md");
  if (!fs.existsSync(syncRawPath) || !fs.existsSync(syncReportPath)) {
    throw new Error(
      `${syncConfigurationId} is missing raw-results.json/outcome.md for the separate S0-BCK-006 sync evidence`,
    );
  }
  const syncRawBytes = fs.readFileSync(syncRawPath);
  const syncReportBytes = fs.readFileSync(syncReportPath);
  const syncRun = JSON.parse(syncRawBytes.toString("utf8"));
  const syncIdentity = buildEvidenceIdentity(authoritativeSyncConfig(configurationId));
  if (syncRun.schemaVersion !== 2 ||
      stableJson(syncRun.evidenceIdentity) !== stableJson(syncIdentity)) {
    throw new Error(
      `${syncConfigurationId} synced-folder evidence is stale for the current source/catalog/applicability/config revision`,
    );
  }
  const syncResult = syncRun.results.find((result) => result.scenarioId === "S0-BCK-006");
  if (!syncResult) throw new Error(`${syncConfigurationId} is missing the S0-BCK-006 result`);
  return {
    result: syncResult,
    record: {
      configurationId: syncConfigurationId,
      scenarioId: "S0-BCK-006",
      raw: `../${syncConfigurationId}/raw-results.json`,
      rawSha256: `sha256:${sha256(syncRawBytes)}`,
      report: `../${syncConfigurationId}/outcome.md`,
      reportSha256: `sha256:${sha256(syncReportBytes)}`,
      evidenceIdentity: syncIdentity,
      // Retain the independent pre-write authorization context and full signed
      // proof so comparison revalidates against these, not the proof's own fields.
      syncAuthorization: syncResult.evidence?.syncAuthorization || null,
      crossClientEvidence: syncResult.evidence?.crossClientEvidence || null,
    },
  };
}

async function main() {
  const configurations = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["CFG-ONEDRIVE-LIVE", "CFG-ADO-LIVE", "CFG-GITHUB-LIVE"];
  for (const configurationId of configurations) {
    const campaigns = loadCampaigns(configurationId);
    if (!campaigns.length) throw new Error(`${configurationId} has no retained campaigns`);
    const aggregate = aggregateCampaigns(configurationId, campaigns);
    const directory = path.join(root, "results", configurationId);
    fs.writeFileSync(path.join(directory, "raw-results.json"), JSON.stringify(aggregate, null, 2) + "\n", "utf8");
    fs.writeFileSync(path.join(directory, "outcome.md"), renderOutcomeReport(aggregate), "utf8");
    fs.writeFileSync(path.join(directory, "preflight.json"), JSON.stringify(aggregate.preflight, null, 2) + "\n", "utf8");
    console.log(`${configurationId}: aggregated ${campaigns.length} complete campaigns`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
