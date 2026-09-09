import crypto from "node:crypto";
import { sha256, stableJson } from "./evidence-identity.mjs";

export const EVIDENCE_KIND = "onedrive-synced-folder-cross-client-evidence";

export const FUTURE_SYNC_PROBE = "Required future probe: two independent OneDrive sync clients on " +
  "separate devices producing a cross-client evidence artifact (distinct immutable client IDs, " +
  "observed timestamps/operations, conflict/recovery outcomes, and approval metadata) carrying a " +
  "detached signature from the trusted signer, bound to the approved syncTargetHash and config revision.";

// The signed payload is the canonical artifact body with the detached signature
// removed. An unkeyed SHA is forgeable, so trust comes from the signature alone.
export function evidenceSigningPayload(artifact) {
  const { signature, ...body } = artifact || {};
  return Buffer.from(stableJson(body), "utf8");
}

export function toPublicKey(publicKey) {
  if (!publicKey) return null;
  if (typeof publicKey === "object" && !Buffer.isBuffer(publicKey) &&
      typeof publicKey.export === "function") {
    return publicKey;
  }
  try {
    return crypto.createPublicKey(publicKey);
  } catch {
    return null;
  }
}

export function publicKeyFingerprint(publicKey) {
  const key = toPublicKey(publicKey);
  if (!key) return null;
  try {
    const der = key.export({ type: "spki", format: "der" });
    return `sha256:${sha256(der)}`;
  } catch {
    return null;
  }
}

export function verifyEvidenceSignature(artifact, publicKey) {
  const key = toPublicKey(publicKey);
  if (!key) return false;
  if (key.asymmetricKeyType !== "ed25519") return false;
  if (typeof artifact?.signature !== "string" || !artifact.signature) return false;
  try {
    return crypto.verify(
      null,
      evidenceSigningPayload(artifact),
      key,
      Buffer.from(artifact.signature, "base64"),
    );
  } catch {
    return false;
  }
}

// A retained cross-client artifact is the only credible synced-folder proof. It
// must be bound to the approved sync target hash and config revision, list at
// least two distinct immutable client IDs with non-future observed
// timestamps/operations, record a conflict or recovery outcome, and carry a
// detached signature from the configured trusted signer. Environment counts,
// unbound self-reports, and forged SHA digests fail.
export function validateCrossClientEvidence(artifact, {
  approvedTargetHash = null,
  boundTargetHash = null,
  configRevision = null,
  trustedPublicKey = null,
  trustedFingerprint = null,
  expectedApproval = null,
  now = Date.now(),
} = {}) {
  if (!artifact || typeof artifact !== "object") {
    return ["no structured retained cross-client evidence artifact was supplied"];
  }
  const errors = [];
  if (artifact.schemaVersion !== 1) errors.push("unsupported cross-client evidence schemaVersion");
  if (artifact.kind !== EVIDENCE_KIND) errors.push("unexpected cross-client evidence kind");
  if (!boundTargetHash || artifact.syncTargetHash !== boundTargetHash ||
      !approvedTargetHash || artifact.syncTargetHash !== approvedTargetHash) {
    errors.push("evidence is not bound to the approved sync target hash");
  }
  if (!configRevision || artifact.configRevision !== configRevision) {
    errors.push("evidence config revision is stale or unbound");
  }
  const clients = Array.isArray(artifact.clients) ? artifact.clients : [];
  if (clients.length < 2) errors.push("at least two independent sync clients are required");
  const ids = clients.map((client) => client?.clientId);
  if (ids.some((id) => typeof id !== "string" || !id.trim()) ||
      new Set(ids).size !== ids.length) {
    errors.push("client IDs must be distinct, immutable, non-empty identifiers");
  }
  // validatedAt is part of the signed payload and bounds every observed/approval
  // timestamp. It must not be in the future relative to the caller's clock.
  const validatedAt = Date.parse(artifact.validatedAt);
  if (typeof artifact.validatedAt !== "string" || !Number.isFinite(validatedAt)) {
    errors.push("evidence validatedAt is missing or invalid");
  } else if (validatedAt > now) {
    errors.push("evidence validatedAt is in the future");
  }
  const upperBound = Number.isFinite(validatedAt) ? Math.min(validatedAt, now) : now;
  for (const client of clients) {
    const label = client?.clientId || "<unknown>";
    const observed = Date.parse(client?.observedAt);
    if (typeof client?.observedAt !== "string" || !Number.isFinite(observed)) {
      errors.push(`client ${label} lacks a valid observed timestamp`);
    } else if (observed > upperBound) {
      errors.push(`client ${label} has an observed timestamp in the future`);
    }
    if (!Array.isArray(client?.operations) || client.operations.length === 0) {
      errors.push(`client ${label} lacks observed operations`);
    }
  }
  const outcomes = artifact.outcomes || {};
  if (outcomes.conflict !== true && outcomes.recovery !== true) {
    errors.push("evidence must record an observed conflict or recovery outcome");
  }
  const approval = artifact.approval || {};
  const approvedAt = Date.parse(approval.approvedAt);
  if (typeof approval.approver !== "string" || !approval.approver.trim() ||
      typeof approval.approvedAt !== "string" || !Number.isFinite(approvedAt) ||
      typeof approval.reference !== "string" || !approval.reference.trim()) {
    errors.push("evidence approval requires approver, approvedAt, and reference");
  } else if (approvedAt > upperBound) {
    errors.push("evidence approval date is in the future");
  }
  if (!approval.targetHash || approval.targetHash !== boundTargetHash) {
    errors.push("evidence approval is not bound to the sync target hash");
  }
  // The signed proof approval must canonically equal the runtime sync approval
  // validated before the probe/write (approver/date/reference/targetHash).
  if (expectedApproval && typeof expectedApproval === "object") {
    const canonicalApproval = (value) => stableJson({
      targetHash: value?.targetHash ?? null,
      approver: value?.approver ?? null,
      approvedAt: value?.approvedAt ?? null,
      reference: value?.reference ?? null,
    });
    if (canonicalApproval(approval) !== canonicalApproval(expectedApproval)) {
      errors.push("evidence approval does not match the runtime sync approval");
    }
  }
  if (!trustedFingerprint) {
    errors.push("no trusted signer fingerprint is configured; a signed cross-client artifact cannot be verified");
  }
  const trustedKey = toPublicKey(trustedPublicKey);
  if (!trustedKey) {
    errors.push("no trusted signer public key is available; Pass is unreachable");
  } else if (trustedKey.asymmetricKeyType !== "ed25519") {
    errors.push("trusted signer key must be an Ed25519 key; RSA/EC keys are not accepted");
  } else {
    const actualFingerprint = publicKeyFingerprint(trustedKey);
    if (trustedFingerprint && (!actualFingerprint || actualFingerprint !== trustedFingerprint)) {
      errors.push("the supplied signer key does not match the configured trusted fingerprint");
    }
    if (!artifact.signerFingerprint || artifact.signerFingerprint !== trustedFingerprint) {
      errors.push("evidence signer fingerprint is not bound to the trusted signer");
    }
    if (typeof artifact.signature !== "string" || !artifact.signature) {
      errors.push("evidence detached signature is required");
    } else if (!verifyEvidenceSignature(artifact, trustedKey)) {
      errors.push("evidence detached signature is invalid");
    }
  }
  return errors;
}

// The synced-folder approval is a distinct record from the provider-API target
// approval. It binds the computed sync target hash, namespace (inside the hash),
// approver/date/reference, and must never reuse the provider approval hash. These
// checks run BEFORE any probe or write.
export function assessSyncPreconditions({
  boundTargetHash = null,
  approvedTargetHash = null,
  providerApprovalTargetHash = null,
  requiredClientState = null,
  observedClientState = null,
  observedClientIdentity = null,
  syncApproval = null,
  now = Date.now(),
} = {}) {
  if (!boundTargetHash) {
    return {
      blocked: "Blocked — the synced-folder run has no approved sync-root/client-identity binding; " +
        "an arbitrary directory or unverified client cannot satisfy S0-BCK-006.",
    };
  }
  if (typeof observedClientIdentity !== "string" || !observedClientIdentity.trim()) {
    return { blocked: "Blocked — an approved OneDrive sync-client identity is required; none was observed." };
  }
  if (!requiredClientState || observedClientState !== requiredClientState) {
    return {
      blocked: `Blocked — synced-folder evidence requires the verified sync-client state ` +
        `'${requiredClientState || "<approved>"}'; observed '${observedClientState || "unset"}'. ` +
        "A default 'running' or unverified sync-client state cannot pass.",
    };
  }
  if (!syncApproval || typeof syncApproval !== "object" || !syncApproval.targetHash) {
    return {
      blocked: "Blocked — a distinct synced-folder approval record (separate from the provider-API " +
        "approval) is required before the sync probe runs.",
    };
  }
  if (providerApprovalTargetHash && syncApproval.targetHash === providerApprovalTargetHash) {
    return { blocked: "Blocked — the synced-folder approval must not reuse the provider-API target hash." };
  }
  if (!approvedTargetHash || approvedTargetHash !== boundTargetHash) {
    return {
      blocked: "Blocked — the approved sync target hash does not match the bound sync target; " +
        "an arbitrary directory cannot pass S0-BCK-006.",
    };
  }
  const approvedAt = Date.parse(syncApproval.approvedAt);
  if (typeof syncApproval.approver !== "string" || !syncApproval.approver.trim() ||
      typeof syncApproval.approvedAt !== "string" || !Number.isFinite(approvedAt) ||
      typeof syncApproval.reference !== "string" || !syncApproval.reference.trim()) {
    return { blocked: "Blocked — the synced-folder approval requires approver, approval date, and reference." };
  }
  if (approvedAt > now) {
    return { blocked: "Blocked — the synced-folder approval date is in the future." };
  }
  return null;
}

// Pure evidence gate: preconditions (approval + binding) then signed-artifact
// validation. Only a validated, signed retained cross-client artifact is a Pass;
// everything else is Blocked/Incomplete.
export function assessSyncedFolderEvidence({
  boundTargetHash = null,
  syncApproval = null,
  providerApprovalTargetHash = null,
  requiredClientState = null,
  observedClientState = null,
  observedClientIdentity = null,
  configRevision = null,
  retainedEvidence = null,
  trustedPublicKey = null,
  trustedFingerprint = null,
  now = Date.now(),
  probe = {},
} = {}) {
  const approvedTargetHash = syncApproval?.targetHash || null;
  const precondition = assessSyncPreconditions({
    boundTargetHash,
    approvedTargetHash,
    providerApprovalTargetHash,
    requiredClientState,
    observedClientState,
    observedClientIdentity,
    syncApproval,
    now,
  });
  if (precondition) return precondition;
  const evidenceErrors = validateCrossClientEvidence(retainedEvidence, {
    approvedTargetHash,
    boundTargetHash,
    configRevision,
    trustedPublicKey,
    trustedFingerprint,
    expectedApproval: syncApproval,
    now,
  });
  if (evidenceErrors.length) {
    return {
      skip: "Incomplete — credible cross-client synced-folder evidence is unavailable: " +
        `${evidenceErrors.join("; ")}. A same-device probe and self-reported client counts cannot ` +
        `pass. ${FUTURE_SYNC_PROBE} Reporting Incomplete rather than Pass.`,
    };
  }
  const signerPublicKey = toPublicKey(trustedPublicKey);
  // The authorization context is DERIVED from the signed artifact (its approval
  // and validatedAt are inside the signature), plus the trusted public key so the
  // proof can be re-verified offline. It is retained identically on the raw run
  // and the aggregate separateSync record.
  const authorization = {
    syncTargetHash: retainedEvidence.syncTargetHash,
    syncApproval: { ...retainedEvidence.approval },
    configRevision: retainedEvidence.configRevision,
    signerFingerprint: retainedEvidence.signerFingerprint,
    signerPublicKey: signerPublicKey
      ? signerPublicKey.export({ type: "spki", format: "pem" })
      : null,
    validatedAt: retainedEvidence.validatedAt,
  };
  return {
    evidence: {
      syncClientState: observedClientState,
      syncClientIdentity: observedClientIdentity,
      probe: "two independent OneDrive sync clients (retained signed cross-client evidence)",
      clients: retainedEvidence.clients.map((client) => client.clientId),
      conflictOutcome: retainedEvidence.outcomes?.conflict === true,
      recoveryOutcome: retainedEvidence.outcomes?.recovery === true,
      signerFingerprint: retainedEvidence.signerFingerprint,
      evidenceSignature: retainedEvidence.signature,
      approvalReference: retainedEvidence.approval.reference,
      syncApprovalReference: syncApproval.reference,
      crossClientEvidence: retainedEvidence,
      syncAuthorization: authorization,
      signerPublicKey: authorization.signerPublicKey,
      providerApiCasUsed: false,
      ...(Number.isFinite(probe.conflictFilesCreated)
        ? { sameDeviceConflictFiles: probe.conflictFilesCreated }
        : {}),
      limitation: "Closure relies on a retained, signed cross-device conflict/recovery artifact; " +
        "provider-API CAS is measured separately.",
    },
    measurements: Number.isFinite(probe.createMs) ? { syncedFolderCreateMs: probe.createMs } : {},
  };
}

// Comparison-side revalidation of a retained synced-folder proof. It requires the
// linked-raw and separateSync copies to be canonically identical, requires the
// retained authorization to be bound to (derived from) the signed proof, rejects a
// validatedAt after the linked run completion or the current time, and rejects
// future observed/approval timestamps independent of the caller-supplied clock.
export function verifyRetainedSyncProof({
  linkedResult = null,
  separateRecord = null,
  linkedCompletedAt = null,
  expectedConfigRevision = null,
  expectedSignerFingerprint = null,
  providerApprovalTargetHashes = [],
  now = Date.now(),
} = {}) {
  const errors = [];
  const proofLinked = linkedResult?.evidence?.crossClientEvidence || null;
  const authLinked = linkedResult?.evidence?.syncAuthorization || null;
  const proofSeparate = separateRecord?.crossClientEvidence || null;
  const authSeparate = separateRecord?.syncAuthorization || null;
  if (stableJson(proofLinked) !== stableJson(proofSeparate)) {
    errors.push("linked and separate synced-folder proof copies are not canonically identical");
  }
  if (stableJson(authLinked) !== stableJson(authSeparate)) {
    errors.push("linked and separate synced-folder authorization copies are not canonically identical");
  }
  const proof = proofLinked;
  const authorization = authLinked;
  if (!proof || typeof proof !== "object") {
    errors.push("retained synced-folder proof is missing");
    return errors;
  }
  if (!authorization || typeof authorization !== "object") {
    errors.push("retained sync authorization context is missing");
    return errors;
  }
  // The retained authorization must be derived from the signed proof, so it
  // cannot be altered without breaking the signature.
  const derived = {
    syncTargetHash: proof.syncTargetHash ?? null,
    syncApproval: proof.approval ?? null,
    configRevision: proof.configRevision ?? null,
    signerFingerprint: proof.signerFingerprint ?? null,
    validatedAt: proof.validatedAt ?? null,
  };
  const authorizationCore = {
    syncTargetHash: authorization.syncTargetHash ?? null,
    syncApproval: authorization.syncApproval ?? null,
    configRevision: authorization.configRevision ?? null,
    signerFingerprint: authorization.signerFingerprint ?? null,
    validatedAt: authorization.validatedAt ?? null,
  };
  if (stableJson(derived) !== stableJson(authorizationCore)) {
    errors.push("retained sync authorization is not bound to the signed proof");
  }
  if (expectedConfigRevision && authorization.configRevision !== expectedConfigRevision) {
    errors.push("retained sync authorization config revision is stale");
  }
  if (expectedSignerFingerprint && authorization.signerFingerprint !== expectedSignerFingerprint) {
    errors.push("retained sync authorization signer fingerprint does not match the trusted signer");
  }
  const providerHashes = new Set(
    Array.isArray(providerApprovalTargetHashes)
      ? providerApprovalTargetHashes.filter((value) => typeof value === "string" && value)
      : [],
  );
  if (providerHashes.has(proof.approval?.targetHash)) {
    errors.push("retained sync approval reuses the provider-API target hash");
  }
  const validationTime = Date.parse(authorization.validatedAt);
  const completed = Date.parse(linkedCompletedAt);
  // Every retained Pass must carry a valid, finite linked-run completedAt so the
  // validatedAt upper bound is always enforced (never skipped).
  if (typeof linkedCompletedAt !== "string" || !Number.isFinite(completed)) {
    errors.push("retained sync proof requires a valid linked run completedAt");
  }
  if (typeof authorization.validatedAt !== "string" || !Number.isFinite(validationTime)) {
    errors.push("retained sync authorization has no valid validation time");
  } else {
    if (validationTime > now) errors.push("retained validatedAt is after the current time");
    if (Number.isFinite(completed) && validationTime > completed) {
      errors.push("retained validatedAt is after the linked run completedAt");
    }
  }
  const trustedKey = toPublicKey(authorization.signerPublicKey);
  const evidenceErrors = validateCrossClientEvidence(proof, {
    approvedTargetHash: authorization.syncTargetHash,
    boundTargetHash: authorization.syncTargetHash,
    configRevision: authorization.configRevision,
    trustedPublicKey: trustedKey,
    trustedFingerprint: authorization.signerFingerprint,
    now,
  });
  errors.push(...evidenceErrors);
  return errors;
}
