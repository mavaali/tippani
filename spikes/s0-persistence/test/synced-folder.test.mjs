import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveEffectiveProviderConfig,
  syncTargetHash,
  resolveSyncTarget,
} from "../src/preflight.mjs";
import { decisionConfigRevision } from "../src/evidence-identity.mjs";
import {
  EVIDENCE_KIND,
  assessSyncedFolderEvidence,
  validateCrossClientEvidence,
  verifyRetainedSyncProof,
  evidenceSigningPayload,
  publicKeyFingerprint,
  verifyEvidenceSignature,
} from "../src/sync-evidence.mjs";
import { SCENARIO_IMPLEMENTATIONS } from "../src/scenario-implementations.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const liveConfig = JSON.parse(fs.readFileSync(
  path.join(root, "config", "provider-onedrive-live.json"),
  "utf8",
));

const approvedEnv = {
  S0_ONEDRIVE_SYNC_ROOT: "/approved/OneDrive/tippani-s0",
  S0_SYNC_CLIENT_IDENTITY: "sync-operator@contoso.example",
  S0_SYNC_CLIENT_STATE: "verified-signed-in",
};
const approved = resolveEffectiveProviderConfig(liveConfig, approvedEnv);
const approvedHash = approved.sandbox.syncTargetHash;
const configRevision = decisionConfigRevision(approved);

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const signerFingerprint = publicKeyFingerprint(publicKey);
const other = crypto.generateKeyPairSync("ed25519");

let pass = 0;
let fail = 0;
async function check(name, action) {
  try { await action(); pass++; }
  catch (error) { fail++; console.error(`  FAIL: ${name}`); console.error(`        ${error.stack || error}`); }
}

function sign(artifact) {
  const signature = crypto.sign(null, evidenceSigningPayload(artifact), privateKey);
  return { ...artifact, signature: signature.toString("base64") };
}

const syncApproval = {
  targetHash: approvedHash,
  approver: "S0 sync approver",
  approvedAt: "2026-09-03T20:00:00.000Z",
  reference: "syn-sync-approval-1",
};

function signedArtifact(overrides = {}) {
  const now = Date.now();
  return sign({
    schemaVersion: 1,
    kind: EVIDENCE_KIND,
    syncTargetHash: approvedHash,
    configRevision,
    signerFingerprint,
    validatedAt: new Date(now - 30000).toISOString(),
    clients: [
      { clientId: "device-A-9f2c", observedAt: new Date(now - 120000).toISOString(), operations: ["create", "edit"] },
      { clientId: "device-B-1a77", observedAt: new Date(now - 60000).toISOString(), operations: ["edit"] },
    ],
    outcomes: { conflict: true, recovery: true, conflictArtifacts: ["workspace-device-B.json"] },
    approval: { ...syncApproval },
    ...overrides,
  });
}

function baseInput(overrides = {}) {
  return {
    boundTargetHash: approvedHash,
    syncApproval,
    providerApprovalTargetHash: "sha256:provider-distinct-target",
    requiredClientState: "verified-signed-in",
    observedClientState: "verified-signed-in",
    observedClientIdentity: "sync-operator@contoso.example",
    configRevision,
    retainedEvidence: signedArtifact(),
    trustedPublicKey: publicKey,
    trustedFingerprint: signerFingerprint,
    probe: { createMs: 5, conflictFilesCreated: 0 },
    ...overrides,
  };
}

await check("effective preflight binds an approved sync target hash and distinct sync approval", () => {
  assert.ok(approvedHash && approvedHash.startsWith("sha256:"));
  assert.equal(approved.sandbox.syncTarget.syncRoot, "/approved/OneDrive/tippani-s0");
  assert.ok("syncApproval" in approved.sandbox, "a distinct sync approval record must be resolved");
});

await check("an arbitrary directory produces a different bound hash than the approved target", () => {
  const arbitrary = resolveEffectiveProviderConfig(liveConfig, {
    ...approvedEnv,
    S0_ONEDRIVE_SYNC_ROOT: "/tmp/some-arbitrary-folder",
  });
  assert.notEqual(arbitrary.sandbox.syncTargetHash, approvedHash);
});

await check("a missing sync-client identity cannot be bound", () => {
  const target = resolveSyncTarget(liveConfig, {
    S0_ONEDRIVE_SYNC_ROOT: "/approved/OneDrive/tippani-s0",
    S0_SYNC_CLIENT_STATE: "verified-signed-in",
  });
  assert.equal(syncTargetHash(target), null);
});

await check("an arbitrary directory (bound hash mismatch) cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ boundTargetHash: "sha256:arbitrary-directory" }));
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /arbitrary directory/i);
});

await check("a missing distinct sync approval record cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ syncApproval: null }));
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /distinct synced-folder approval/i);
});

await check("a sync approval reusing the provider-API target hash cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({
    syncApproval: { ...syncApproval, targetHash: "sha256:provider-distinct-target" },
    providerApprovalTargetHash: "sha256:provider-distinct-target",
  }));
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /must not reuse the provider-API/i);
});

await check("a future sync approval date cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({
    syncApproval: { ...syncApproval, approvedAt: new Date(Date.now() + 86400000).toISOString() },
  }));
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /future/i);
});

await check("a default 'running' sync-client state cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ observedClientState: "running" }));
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /'running'|cannot pass/i);
});

await check("a self-reported client count (no structured artifact) cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: null }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /Incomplete/);
  assert.match(detail.skip, /self-reported client counts cannot/i);
  assert.match(detail.skip, /Required future probe/);
  assert.equal(detail.evidence, undefined);
});

await check("an unbound arbitrary conflict JSON cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({
    retainedEvidence: { conflict: true, independentClients: 2 },
  }));
  assert.ok(detail.skip);
  assert.equal(detail.evidence, undefined);
  const errors = validateCrossClientEvidence({ conflict: true, independentClients: 2 }, {
    approvedTargetHash: approvedHash, boundTargetHash: approvedHash, configRevision,
    trustedPublicKey: publicKey, trustedFingerprint: signerFingerprint,
  });
  assert.ok(errors.some((error) => /not bound to the approved sync target/.test(error)));
  assert.ok(errors.some((error) => /two independent sync clients/.test(error)));
  assert.ok(errors.some((error) => /detached signature is required/.test(error)));
});

await check("a valid signed cross-client artifact produces a Pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput());
  assert.ok(detail.evidence, "a fully valid signed artifact should pass");
  assert.deepEqual(detail.evidence.clients, ["device-A-9f2c", "device-B-1a77"]);
  assert.equal(detail.evidence.providerApiCasUsed, false);
  assert.equal(detail.evidence.conflictOutcome, true);
  assert.equal(detail.evidence.signerFingerprint, signerFingerprint);
  assert.ok(detail.evidence.signerPublicKey, "the trusted public key is retained for re-verification");
  assert.ok(detail.evidence.crossClientEvidence, "the full signed proof is retained");
});

await check("tampered evidence metadata invalidates the detached signature", () => {
  const artifact = signedArtifact();
  artifact.clients[0].clientId = "device-A-tampered";
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: artifact }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /signature is invalid/);
});

await check("a fabricated artifact re-signed by an untrusted key cannot pass", () => {
  const artifact = signedArtifact();
  const forged = crypto.sign(null, evidenceSigningPayload(artifact), other.privateKey);
  artifact.signature = forged.toString("base64");
  const detail = assessSyncedFolderEvidence(baseInput({
    retainedEvidence: artifact,
    trustedPublicKey: publicKey,
  }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /signature is invalid/);
});

await check("a wrong trusted key that mismatches the configured fingerprint cannot pass", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ trustedPublicKey: other.publicKey }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /does not match the configured trusted fingerprint/);
});

await check("no trusted signer key configured makes Pass unreachable", () => {
  const detail = assessSyncedFolderEvidence(baseInput({ trustedPublicKey: null }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /Pass is unreachable/);
});

await check("a future observed timestamp cannot pass", () => {
  const artifact = signedArtifact({
    clients: [
      { clientId: "device-A", observedAt: new Date(Date.now() + 86400000).toISOString(), operations: ["edit"] },
      { clientId: "device-B", observedAt: new Date(Date.now() - 1000).toISOString(), operations: ["edit"] },
    ],
  });
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: artifact }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /future/);
});

await check("evidence bound to a stale config revision cannot pass", () => {
  const artifact = signedArtifact({ configRevision: "sha256:stale-config" });
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: artifact }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /config revision is stale/);
});

await check("duplicate client IDs are rejected", () => {
  const artifact = signedArtifact({
    clients: [
      { clientId: "device-A", observedAt: new Date(Date.now() - 2000).toISOString(), operations: ["edit"] },
      { clientId: "device-A", observedAt: new Date(Date.now() - 1000).toISOString(), operations: ["edit"] },
    ],
  });
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: artifact }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /distinct, immutable/);
});

await check("valid detached signature verifies with the trusted key", () => {
  const artifact = signedArtifact();
  assert.equal(verifyEvidenceSignature(artifact, publicKey), true);
  assert.equal(verifyEvidenceSignature(artifact, other.publicKey), false);
});

await check("decisionConfigRevision incorporates the normalized sync profile", () => {
  const withRunning = structuredClone(liveConfig);
  withRunning.sandbox.syncProfile.requiredClientState = "running";
  assert.notEqual(decisionConfigRevision(withRunning), decisionConfigRevision(liveConfig));

  const withoutIndependent = structuredClone(liveConfig);
  withoutIndependent.sandbox.syncProfile.requireIndependentClients = false;
  assert.notEqual(decisionConfigRevision(withoutIndependent), decisionConfigRevision(liveConfig));

  const rekeyed = structuredClone(liveConfig);
  rekeyed.sandbox.syncProfile.trustedSignerFingerprint = "sha256:different-signer";
  assert.notEqual(decisionConfigRevision(rekeyed), decisionConfigRevision(liveConfig));

  const withoutProfile = structuredClone(liveConfig);
  delete withoutProfile.sandbox.syncProfile;
  assert.notEqual(decisionConfigRevision(withoutProfile), decisionConfigRevision(liveConfig));
});

await check("the S0-BCK-006 implementation is Blocked without a Windows sync client", async () => {
  if (process.platform === "win32") return;
  const detail = await SCENARIO_IMPLEMENTATIONS["S0-BCK-006"]({ config: approved });
  assert.ok(detail.blocked);
  assert.match(detail.blocked, /Windows OneDrive sync-client/i);
});

await check("an RSA trusted key is rejected before signature verification (Ed25519 required)", () => {
  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const fingerprint = publicKeyFingerprint(rsa.publicKey);
  const artifact = signedArtifact({ signerFingerprint: fingerprint });
  const detail = assessSyncedFolderEvidence(baseInput({
    retainedEvidence: artifact,
    trustedPublicKey: rsa.publicKey,
    trustedFingerprint: fingerprint,
  }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /must be an Ed25519 key/);
  assert.equal(verifyEvidenceSignature(signedArtifact(), rsa.publicKey), false);
});

await check("an EC trusted key is rejected before signature verification", () => {
  const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const fingerprint = publicKeyFingerprint(ec.publicKey);
  const artifact = signedArtifact({ signerFingerprint: fingerprint });
  const detail = assessSyncedFolderEvidence(baseInput({
    retainedEvidence: artifact,
    trustedPublicKey: ec.publicKey,
    trustedFingerprint: fingerprint,
  }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /must be an Ed25519 key/);
});

await check("a valid Pass retains an authorization context derived from the signed proof", () => {
  const base = Date.parse("2026-09-04T00:00:00.000Z");
  const validatedAt = new Date(base - 30000).toISOString();
  const approval = {
    targetHash: approvedHash,
    approver: "Windows sync-client test owner",
    approvedAt: new Date(base - 120000).toISOString(),
    reference: "syn-sync-001",
  };
  const artifact = signedArtifact({
    validatedAt,
    approval,
    clients: [
      { clientId: "device-A", observedAt: new Date(base - 120000).toISOString(), operations: ["create"] },
      { clientId: "device-B", observedAt: new Date(base - 60000).toISOString(), operations: ["edit"] },
    ],
  });
  const detail = assessSyncedFolderEvidence(baseInput({ retainedEvidence: artifact, syncApproval: approval, now: base }));
  assert.ok(detail.evidence);
  const authorization = detail.evidence.syncAuthorization;
  assert.equal(authorization.syncTargetHash, approvedHash);
  assert.equal(authorization.validatedAt, validatedAt);
  assert.equal(authorization.configRevision, configRevision);
  assert.equal(authorization.signerFingerprint, signerFingerprint);
  assert.deepEqual(authorization.syncApproval, approval);
});

const pem = publicKey.export({ type: "spki", format: "pem" });
function retainedPair({ base = Date.now(), artifactOverrides = {} } = {}) {
  const artifact = signedArtifact({
    validatedAt: new Date(base - 30000).toISOString(),
    clients: [
      { clientId: "device-A", observedAt: new Date(base - 120000).toISOString(), operations: ["create"] },
      { clientId: "device-B", observedAt: new Date(base - 60000).toISOString(), operations: ["edit"] },
    ],
    approval: {
      targetHash: approvedHash,
      approver: "S0 sync approver",
      approvedAt: new Date(base - 120000).toISOString(),
      reference: "syn-retained-1",
    },
    ...artifactOverrides,
  });
  const authorization = {
    syncTargetHash: artifact.syncTargetHash,
    syncApproval: artifact.approval,
    configRevision: artifact.configRevision,
    signerFingerprint: artifact.signerFingerprint,
    signerPublicKey: pem,
    validatedAt: artifact.validatedAt,
  };
  const linkedResult = {
    scenarioId: "S0-BCK-006",
    status: "Pass",
    evidence: { crossClientEvidence: artifact, syncAuthorization: authorization },
  };
  const separateRecord = { crossClientEvidence: artifact, syncAuthorization: authorization };
  return { artifact, authorization, linkedResult, separateRecord };
}

await check("retained sync proof re-verifies against a valid current signed receipt", () => {
  const base = Date.now();
  const { linkedResult, separateRecord } = retainedPair({ base });
  assert.deepEqual(
    verifyRetainedSyncProof({
      linkedResult,
      separateRecord,
      linkedCompletedAt: new Date(base + 1000).toISOString(),
      expectedConfigRevision: configRevision,
      expectedSignerFingerprint: signerFingerprint,
    }),
    [],
  );
});

await check("a 2099 proof with a fabricated 2100 validatedAt is rejected today", () => {
  const base2099 = Date.parse("2099-01-01T00:00:00.000Z");
  const validatedAt = "2100-01-01T00:00:00.000Z";
  const artifact = signedArtifact({
    validatedAt,
    clients: [
      { clientId: "A", observedAt: new Date(base2099).toISOString(), operations: ["edit"] },
      { clientId: "B", observedAt: new Date(base2099 + 1000).toISOString(), operations: ["edit"] },
    ],
    approval: { targetHash: approvedHash, approver: "R", approvedAt: new Date(base2099).toISOString(), reference: "r" },
  });
  const authorization = {
    syncTargetHash: artifact.syncTargetHash,
    syncApproval: artifact.approval,
    configRevision: artifact.configRevision,
    signerFingerprint: artifact.signerFingerprint,
    signerPublicKey: pem,
    validatedAt,
  };
  const linkedResult = { scenarioId: "S0-BCK-006", status: "Pass", evidence: { crossClientEvidence: artifact, syncAuthorization: authorization } };
  const separateRecord = { crossClientEvidence: artifact, syncAuthorization: authorization };
  const errors = verifyRetainedSyncProof({
    linkedResult,
    separateRecord,
    linkedCompletedAt: new Date(base2099 + 2000).toISOString(),
    expectedConfigRevision: configRevision,
    expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /validatedAt is after the current time/.test(error)));
  assert(errors.some((error) => /validatedAt is in the future/.test(error)));
});

await check("an altered retained approval breaks the binding to the signed proof", () => {
  const { linkedResult, separateRecord } = retainedPair({});
  const forge = (record) => {
    record.syncAuthorization = structuredClone(record.syncAuthorization);
    record.syncAuthorization.syncApproval = { ...record.syncAuthorization.syncApproval, reference: "forged" };
  };
  forge(linkedResult.evidence);
  forge(separateRecord);
  const errors = verifyRetainedSyncProof({
    linkedResult, separateRecord,
    expectedConfigRevision: configRevision, expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /authorization is not bound to the signed proof/.test(error)));
});

await check("an altered retained validatedAt breaks the binding to the signed proof", () => {
  const { linkedResult, separateRecord } = retainedPair({});
  const altered = "2026-09-04T09:00:00.000Z";
  linkedResult.evidence.syncAuthorization = { ...linkedResult.evidence.syncAuthorization, validatedAt: altered };
  separateRecord.syncAuthorization = { ...separateRecord.syncAuthorization, validatedAt: altered };
  const errors = verifyRetainedSyncProof({
    linkedResult, separateRecord,
    expectedConfigRevision: configRevision, expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /authorization is not bound to the signed proof/.test(error)));
});

await check("linked and separate retained copies must be canonically identical", () => {
  const { linkedResult, separateRecord } = retainedPair({});
  separateRecord.syncAuthorization = { ...separateRecord.syncAuthorization, validatedAt: "2026-09-04T09:00:00.000Z" };
  const errors = verifyRetainedSyncProof({
    linkedResult, separateRecord,
    expectedConfigRevision: configRevision, expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /not canonically identical/.test(error)));
});

await check("a signed proof approval that differs from the runtime sync approval is rejected before the probe", () => {
  const runtimeDifferent = { ...syncApproval, reference: "runtime-approval-differs" };
  const detail = assessSyncedFolderEvidence(baseInput({ syncApproval: runtimeDifferent }));
  assert.ok(detail.skip);
  assert.match(detail.skip, /approval does not match the runtime sync approval/);
  assert.equal(detail.evidence, undefined);
});

await check("a signed proof approval that exactly matches the runtime sync approval passes", () => {
  const detail = assessSyncedFolderEvidence(baseInput());
  assert.ok(detail.evidence);
  assert.deepEqual(detail.evidence.syncAuthorization.syncApproval, syncApproval);
});

await check("verifyRetainedSyncProof requires a finite linkedCompletedAt (null)", () => {
  const { linkedResult, separateRecord } = retainedPair({});
  const errors = verifyRetainedSyncProof({
    linkedResult, separateRecord, linkedCompletedAt: null,
    expectedConfigRevision: configRevision, expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /requires a valid linked run completedAt/.test(error)));
});

await check("verifyRetainedSyncProof requires a finite linkedCompletedAt (invalid string)", () => {
  const { linkedResult, separateRecord } = retainedPair({});
  const errors = verifyRetainedSyncProof({
    linkedResult, separateRecord, linkedCompletedAt: "not-a-timestamp",
    expectedConfigRevision: configRevision, expectedSignerFingerprint: signerFingerprint,
  });
  assert(errors.some((error) => /requires a valid linked run completedAt/.test(error)));
});

console.log(`s0-synced-folder: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
