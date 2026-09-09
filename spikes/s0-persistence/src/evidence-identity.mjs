import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPLICABILITY_PROFILES,
  ARCHITECTURE_MAPPINGS,
  CONFIGURATION_MATRIX,
} from "./applicability.mjs";
import { SCENARIOS } from "./scenario-catalog.mjs";

const spikeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceRoot = path.join(spikeRoot, "src");

function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, normalized(value[key])]),
  );
}

export function stableJson(value) {
  return JSON.stringify(normalized(value));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function canonicalSourceContent(content) {
  return String(content).replace(/\r\n?/g, "\n");
}

export function sourceRevisionFromEntries(entries) {
  const material = entries
    .map(({ path: relative, content }) =>
      `${String(relative).replaceAll("\\", "/")}\0${canonicalSourceContent(content)}`)
    .sort()
    .join("\0");
  return `sha256:${sha256(material)}`;
}

function sourceFiles(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, base);
    return entry.isFile() && entry.name.endsWith(".mjs")
      ? [path.relative(base, full).replaceAll(path.sep, "/")]
      : [];
  });
}

export function currentSourceRevision() {
  return sourceRevisionFromEntries(sourceFiles(sourceRoot).map((relative) => ({
    path: relative,
    content: fs.readFileSync(path.join(sourceRoot, relative), "utf8"),
  })));
}

export function catalogRevision(catalog = SCENARIOS) {
  return `sha256:${sha256(stableJson(catalog))}`;
}

export function applicabilityRevision() {
  return `sha256:${sha256(stableJson({
    profiles: APPLICABILITY_PROFILES,
    configurations: CONFIGURATION_MATRIX,
    mappings: ARCHITECTURE_MAPPINGS,
  }))}`;
}

export function normalizedSyncProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  return {
    syncRootEnv: profile.syncRootEnv ?? null,
    clientIdentityEnv: profile.clientIdentityEnv ?? null,
    clientStateEnv: profile.clientStateEnv ?? null,
    requiredClientState: profile.requiredClientState ?? null,
    requireIndependentClients: profile.requireIndependentClients === true,
    retainedEvidenceEnv: profile.retainedEvidenceEnv ?? null,
    signerPublicKeyEnv: profile.signerPublicKeyEnv ?? null,
    trustedSignerFingerprint: profile.trustedSignerFingerprint ?? null,
  };
}

export function decisionConfigRevision(config) {
  const sandbox = config?.sandbox || {};
  return `sha256:${sha256(stableJson({
    configurationId: config?.configurationId,
    adapter: config?.adapter,
    backingPath: config?.backingPath,
    applicabilityProfile: config?.applicabilityProfile,
    platform: config?.platform,
    scale: config?.scale,
    syntheticDataOnly: config?.syntheticDataOnly,
    dryRun: config?.dryRun === true,
    budgets: config?.budgets,
    scenarioIds: config?.scenarioIds,
    sandbox: {
      kind: sandbox.kind,
      approved: sandbox.approved,
      allowListed: sandbox.allowListed,
      identityVerified: sandbox.identityVerified,
      corporateFallbackDisabled: sandbox.corporateFallbackDisabled,
      defaultBranchExcluded: sandbox.defaultBranchExcluded,
      dryRunOperations: sandbox.dryRunOperations,
      syncProfile: normalizedSyncProfile(sandbox.syncProfile),
    },
  }))}`;
}

export function buildEvidenceIdentity(config, catalog = SCENARIOS) {
  return {
    sourceRevision: currentSourceRevision(),
    catalogRevision: catalogRevision(catalog),
    applicabilityRevision: applicabilityRevision(),
    configRevision: decisionConfigRevision(config),
  };
}
