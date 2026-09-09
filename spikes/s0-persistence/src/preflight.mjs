import crypto from "node:crypto";

const PROVIDERS = new Set(["onedrive", "ado", "github"]);
const PROVIDER_TARGETS = Object.freeze({
  onedrive: Object.freeze({
    coordinates: Object.freeze({
      driveId: Object.freeze({ option: "driveId", env: "S0_ONEDRIVE_DRIVE_ID" }),
      folder: Object.freeze({ option: "folderPath", env: "S0_ONEDRIVE_FOLDER" }),
    }),
  }),
  ado: Object.freeze({
    coordinates: Object.freeze({
      organization: Object.freeze({ option: "org", env: "S0_ADO_ORG" }),
      project: Object.freeze({ option: "project", env: "S0_ADO_PROJECT" }),
      repository: Object.freeze({ option: "repo", env: "S0_ADO_REPO" }),
    }),
  }),
  github: Object.freeze({
    coordinates: Object.freeze({
      owner: Object.freeze({ option: "owner", env: "S0_GITHUB_OWNER" }),
      repository: Object.freeze({ option: "repo", env: "S0_GITHUB_REPO" }),
    }),
  }),
});
const TRUSTED_IDENTITY = Symbol("s0.trustedProviderIdentity");
const ALLOWED_CREDENTIAL_METADATA = new Set([
  "credentialbrokerref",
  "credentialsource",
  "identitylabel",
]);

function isCredentialKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (ALLOWED_CREDENTIAL_METADATA.has(normalized)) return false;
  return normalized === "pat" ||
    normalized === "apikey" ||
    normalized === "connectionstring" ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("credentials") ||
    normalized.endsWith("credentialvalue") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("sas");
}

export class PreflightError extends Error {
  constructor(errors) {
    super(`S0 preflight failed:\n- ${errors.join("\n- ")}`);
    this.name = "PreflightError";
    this.code = "preflight_failed";
    this.errors = errors;
  }
}

function positiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

export function isRuntimePlaceholder(value) {
  return typeof value !== "string" || !value.trim() ||
    /supplied at runtime|replace before live|<[^>]+>|\btemplate\b/i.test(value);
}

function hashTarget(target) {
  return crypto.createHash("sha256").update(JSON.stringify(target)).digest("hex");
}

export function providerTargetHash(target) {
  if (!target || typeof target !== "object") return null;
  const coordinates = target.coordinates || {};
  if (isRuntimePlaceholder(target.identity) ||
      Object.values(coordinates).some(isRuntimePlaceholder) ||
      isRuntimePlaceholder(target.namespace)) {
    return null;
  }
  return `sha256:${hashTarget({
    provider: target.provider,
    identity: target.identity,
    coordinates,
    namespace: target.namespace,
  })}`;
}

export const SYNC_ROOT_ENV = "S0_ONEDRIVE_SYNC_ROOT";
export const SYNC_CLIENT_IDENTITY_ENV = "S0_SYNC_CLIENT_IDENTITY";
export const SYNC_CLIENT_STATE_ENV = "S0_SYNC_CLIENT_STATE";
export const SYNC_APPROVAL_ENV = Object.freeze({
  approver: "S0_SYNC_APPROVER",
  approvedAt: "S0_SYNC_APPROVED_AT",
  reference: "S0_SYNC_APPROVAL_REFERENCE",
  targetHash: "S0_SYNC_TARGET_HASH",
});

export function resolveSyncTarget(config, env = process.env) {
  const profile = config?.sandbox?.syncProfile;
  if (!profile || typeof profile !== "object") return null;
  return {
    provider: config?.backingPath || null,
    kind: "onedrive-synced-folder",
    syncRoot: env[profile.syncRootEnv || SYNC_ROOT_ENV] || null,
    clientIdentity: env[profile.clientIdentityEnv || SYNC_CLIENT_IDENTITY_ENV] || null,
    requiredClientState: profile.requiredClientState || null,
    observedClientState: env[profile.clientStateEnv || SYNC_CLIENT_STATE_ENV] || null,
    namespace: config?.sandbox?.namespace || null,
  };
}

// The approved synced-folder binding hashes only the authorised sync root,
// client identity, required client state, and namespace. It intentionally
// excludes the observed client state so an unverified/default client can never
// silently match the approved target.
export function syncTargetHash(target) {
  if (!target || typeof target !== "object") return null;
  if (isRuntimePlaceholder(target.syncRoot) ||
      isRuntimePlaceholder(target.clientIdentity) ||
      isRuntimePlaceholder(target.requiredClientState) ||
      isRuntimePlaceholder(target.namespace)) {
    return null;
  }
  return `sha256:${hashTarget({
    provider: target.provider,
    kind: target.kind,
    syncRoot: target.syncRoot,
    clientIdentity: target.clientIdentity,
    requiredClientState: target.requiredClientState,
    namespace: target.namespace,
  })}`;
}

// The synced-folder approval is a distinct record from the provider-API target
// approval. Its target hash is supplied out of band (S0_SYNC_TARGET_HASH) and
// must equal the computed sync target hash; it must never be the provider hash.
export function resolveSyncApproval(config, env = process.env) {
  const profile = config?.sandbox?.syncProfile;
  if (!profile || typeof profile !== "object") return null;
  const declared = config?.sandbox?.syncApproval || {};
  return {
    approver: env[SYNC_APPROVAL_ENV.approver] || declared.approver || null,
    approvedAt: env[SYNC_APPROVAL_ENV.approvedAt] || declared.approvedAt || null,
    reference: env[SYNC_APPROVAL_ENV.reference] || declared.reference || null,
    targetHash: env[SYNC_APPROVAL_ENV.targetHash] || declared.targetHash || null,
    signerFingerprint: profile.trustedSignerFingerprint || null,
  };
}

function approvalFrom(config, env) {
  const declared = config?.sandbox?.approval || {};
  return {
    approver: env.S0_PREFLIGHT_APPROVER || declared.approver,
    approvedAt: env.S0_PREFLIGHT_APPROVED_AT || declared.approvedAt,
    reference: env.S0_PREFLIGHT_APPROVAL_REFERENCE || declared.reference,
    targetHash: env.S0_PREFLIGHT_TARGET_HASH || declared.targetHash,
  };
}

function cloneRecord(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneRecord);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneRecord(item)]));
}

export function resolveEffectiveProviderConfig(config, env = process.env, {
  resolvedIdentity = config?.[TRUSTED_IDENTITY] || null,
} = {}) {
  const resolved = {
    ...config,
    budgets: cloneRecord(config?.budgets),
    scenarioIds: cloneRecord(config?.scenarioIds),
    sandbox: config?.sandbox ? {
      ...config.sandbox,
      coordinates: cloneRecord(config.sandbox.coordinates),
      dryRunOperations: cloneRecord(config.sandbox.dryRunOperations),
      cleanup: cloneRecord(config.sandbox.cleanup),
      approval: cloneRecord(config.sandbox.approval),
    } : {},
  };
  const targetDefinition = PROVIDER_TARGETS[resolved?.backingPath];
  if (!targetDefinition) return resolved;
  const declaredCoordinates = resolved.sandbox?.coordinates || {};
  const coordinates = {};
  for (const [name, definition] of Object.entries(targetDefinition.coordinates)) {
    const explicit = resolved[definition.option];
    coordinates[name] = !isRuntimePlaceholder(explicit)
      ? explicit
      : env[definition.env] || declaredCoordinates[name] || null;
    resolved[definition.option] = coordinates[name];
  }
  const target = {
    provider: resolved.backingPath,
    identity: resolvedIdentity,
    coordinates,
    namespace: resolved.sandbox?.namespace || null,
  };
  delete resolved.effectiveIdentity;
  resolved.sandbox = {
    ...(resolved.sandbox || {}),
    coordinates,
    effectiveTargetHash: providerTargetHash(target),
    approval: approvalFrom(resolved, env),
  };
  const sync = resolveSyncTarget(resolved, env);
  if (sync) {
    resolved.sandbox.syncTarget = sync;
    resolved.sandbox.syncTargetHash = syncTargetHash(sync);
    resolved.sandbox.syncApproval = resolveSyncApproval(resolved, env);
  }
  if (resolvedIdentity) {
    Object.defineProperty(resolved, TRUSTED_IDENTITY, {
      configurable: false,
      enumerable: true,
      value: resolvedIdentity,
      writable: false,
    });
  }
  return resolved;
}

export function withResolvedProviderIdentity(config, identity, env = process.env) {
  if (isRuntimePlaceholder(identity)) {
    throw new PreflightError(["Provider-derived identity is required"]);
  }
  return resolveEffectiveProviderConfig(config, env, { resolvedIdentity: identity });
}

export function trustedProviderIdentity(config) {
  return config?.[TRUSTED_IDENTITY] || null;
}

export function normalizedCleanup(sandbox, now = new Date()) {
  const cleanup = sandbox?.cleanup;
  if (!cleanup) return null;
  const retentionHours = Number(cleanup.retentionHours);
  const expiresAt = positiveNumber(retentionHours)
    ? new Date(now.getTime() + (retentionHours * 60 * 60 * 1000)).toISOString()
    : cleanup.expiresAt;
  return { ...cleanup, expiresAt };
}

function findEmbeddedSecrets(value, path = "$", errors = []) {
  if (!value || typeof value !== "object") return errors;
  for (const [key, item] of Object.entries(value)) {
    const itemPath = `${path}.${key}`;
    if (isCredentialKey(key) && item !== null && item !== "" && item !== false) {
      errors.push(`Credential material is forbidden in config at ${itemPath}`);
    } else if (item && typeof item === "object") {
      findEmbeddedSecrets(item, itemPath, errors);
    }
  }
  return errors;
}

export { findEmbeddedSecrets };

export function validatePreflight(config, {
  env = process.env,
  requireApproval = config?.dryRun === false,
  now = new Date(),
} = {}) {
  const validationTime = now instanceof Date ? now.getTime() : Number(now);
  const errors = findEmbeddedSecrets(config);
  const effectiveConfig = resolveEffectiveProviderConfig(config, env);
  findEmbeddedSecrets(effectiveConfig, "$", errors);
  const runId = String(effectiveConfig?.runId || "");
  const sandbox = effectiveConfig?.sandbox || {};
  const budgets = effectiveConfig?.budgets || {};

  if (!/^CFG-[A-Z0-9-]+$/.test(effectiveConfig?.configurationId || "")) {
    errors.push("configurationId must match CFG-<ID>");
  }
  if (!/^s0-[a-z0-9-]+$/.test(runId)) {
    errors.push("runId must match s0-<lowercase-id>");
  }
  if (effectiveConfig?.syntheticDataOnly !== true) {
    errors.push("syntheticDataOnly must be true");
  }
  for (const name of ["maxOperations", "maxDurationMs", "maxObjects", "maxBytes"]) {
    if (!positiveNumber(budgets[name])) errors.push(`budgets.${name} must be positive`);
  }
  if (sandbox.approved !== true) errors.push("sandbox.approved must be true");
  if (sandbox.corporateFallbackDisabled !== true) {
    errors.push("Corporate-account fallback must be disabled");
  }
  if (sandbox.ownershipMarker !== `tippani-s0:${runId}`) {
    errors.push("Sandbox ownership marker must match the run ID");
  }

  if (PROVIDERS.has(effectiveConfig?.backingPath)) {
    if (sandbox.allowListed !== true) errors.push("Provider sandbox must be allow-listed");
    if (!sandbox.identityLabel) errors.push("Provider sandbox identityLabel is required");
    if (sandbox.identityVerified !== true) errors.push("Provider sandbox identity must be verified");
    if (sandbox.defaultBranchExcluded !== true) {
      errors.push("Default/protected branch exclusion must be verified");
    }
    if (sandbox.namespace !== `tippani-s0/${runId}`) {
      errors.push("Provider namespace must be scoped to the run ID");
    }
    if (!Array.isArray(sandbox.dryRunOperations) || sandbox.dryRunOperations.length === 0) {
      errors.push("Provider dry-run operation manifest is required");
    }
    const cleanup = normalizedCleanup(sandbox, new Date(validationTime));
    if (!cleanup?.manifestId || !cleanup?.expiresAt ||
      !Number.isFinite(Date.parse(cleanup.expiresAt)) ||
      (!positiveNumber(Number(sandbox.cleanup?.retentionHours)) &&
        Date.parse(cleanup.expiresAt) <= validationTime)) {
      errors.push("Provider cleanup manifest and expiry are required");
    }
    if (!sandbox.coordinates || typeof sandbox.coordinates !== "object" ||
        Object.values(sandbox.coordinates).some((value) =>
          typeof value !== "string" || !value.trim())) {
      errors.push("Provider sandbox coordinates are required");
    }
    if (requireApproval) {
      if (!trustedProviderIdentity(effectiveConfig) ||
          Object.values(sandbox.coordinates || {}).some(isRuntimePlaceholder)) {
        errors.push("Live provider identity must be provider-derived and coordinates resolved before provider calls");
      }
      const approval = sandbox.approval || {};
      if (typeof approval.approver !== "string" || !approval.approver.trim() ||
          typeof approval.approvedAt !== "string" || !Number.isFinite(Date.parse(approval.approvedAt)) ||
          typeof approval.reference !== "string" || !approval.reference.trim()) {
        errors.push("Structured preflight approval requires approver, approval date, and reference");
      } else if (Date.parse(approval.approvedAt) > validationTime) {
        errors.push("Structured preflight approval date cannot be in the future");
      }
      if (!sandbox.effectiveTargetHash || approval.targetHash !== sandbox.effectiveTargetHash) {
        errors.push("Preflight approval target hash does not match the effective provider target");
      }
    }
  }

  return errors;
}

export function assertPreflight(config, now = new Date(), options = {}) {
  const effectiveConfig = resolveEffectiveProviderConfig(config, options.env || process.env);
  const errors = validatePreflight(effectiveConfig, { ...options, now });
  if (errors.length) throw new PreflightError(errors);
  return {
    configurationId: effectiveConfig.configurationId,
    runId: effectiveConfig.runId,
    adapter: effectiveConfig.adapter,
    backingPath: effectiveConfig.backingPath,
    syntheticDataOnly: true,
    sandbox: {
      approved: true,
      kind: effectiveConfig.sandbox.kind,
      identityLabel: effectiveConfig.sandbox.identityLabel || "Synthetic Local Harness",
      identityVerified: effectiveConfig.sandbox.identityVerified === true,
      providerIdentity: trustedProviderIdentity(effectiveConfig),
      ownershipMarker: effectiveConfig.sandbox.ownershipMarker,
      namespace: effectiveConfig.sandbox.namespace || null,
      defaultBranchExcluded: effectiveConfig.sandbox.defaultBranchExcluded === true,
      corporateFallbackDisabled: true,
      dryRunOperations: [...(effectiveConfig.sandbox.dryRunOperations || [])],
      cleanup: normalizedCleanup(effectiveConfig.sandbox, now),
      effectiveTargetHash: effectiveConfig.sandbox.effectiveTargetHash || null,
      approval: effectiveConfig.sandbox.approval || null,
    },
    budgets: { ...effectiveConfig.budgets },
  };
}
