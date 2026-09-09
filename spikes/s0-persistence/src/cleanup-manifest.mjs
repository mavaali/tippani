import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import {
  acquireLockSync,
  isIndeterminateAtomicWrite,
  writeFileAtomicSync,
} from "./adapters/fs-atomic.mjs";

const SCHEMA_VERSION = 4;
const CLEANUP_PHASES = new Set([
  "recorded",
  "prepared",
  "mutating",
  "deleted",
  "cleaned",
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

export function cleanupCoordinatesHash(provider, coordinates) {
  const material = JSON.stringify(stable({ provider, coordinates }));
  return `sha256:${crypto.createHash("sha256").update(material).digest("hex")}`;
}

function manifestDigest(document) {
  return `sha256:${crypto.createHash("sha256")
    .update(JSON.stringify(stable(document)))
    .digest("hex")}`;
}

export class CleanupManifest {
  constructor({
    runId,
    ownershipMarker,
    manifestId = null,
    coordinatesHash = null,
    effectiveTargetHash = null,
    manifestNonce = null,
    filePath = null,
    revision = 0,
    syncDirectory = null,
    loadPersisted = CleanupManifest.load,
  }) {
    if (ownershipMarker !== `tippani-s0:${runId}`) {
      throw new Error("Cleanup ownership marker does not match run ID");
    }
    this.runId = runId;
    this.ownershipMarker = ownershipMarker;
    this.manifestId = manifestId;
    this.coordinatesHash = coordinatesHash;
    this.effectiveTargetHash = effectiveTargetHash;
    this.manifestNonce = manifestNonce;
    this.filePath = filePath;
    this.revision = revision;
    this.resources = [];
    this.syncDirectory = syncDirectory;
    this.loadPersisted = loadPersisted;
    this.reconciliationRequired = false;
    this.reconciliationError = null;
  }

  static load(filePath) {
    let document;
    try {
      document = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      throw new Error("Cleanup manifest is not valid JSON");
    }
    const { manifestDigest: recordedDigest, ...payload } = document || {};
    if (![2, 3, SCHEMA_VERSION].includes(payload.schemaVersion) ||
        payload.syntheticData !== true ||
        !Number.isInteger(payload.revision) ||
        payload.revision < 0 ||
        !Array.isArray(payload.resources) ||
        recordedDigest !== manifestDigest(payload)) {
      throw new Error("Cleanup manifest failed integrity validation");
    }
    const resources = payload.resources.map((resource) => ({
      ...structuredClone(resource),
      phase: resource.phase || (
        resource.cleaned === true
          ? "cleaned"
          : resource.condition
            ? "prepared"
            : "recorded"
      ),
    }));
    const manifest = new CleanupManifest({
      runId: payload.runId,
      ownershipMarker: payload.ownershipMarker,
      manifestId: payload.manifestId,
      coordinatesHash: payload.coordinatesHash,
      effectiveTargetHash: payload.effectiveTargetHash,
      manifestNonce: payload.manifestNonce || null,
      filePath,
      revision: payload.revision,
    });
    manifest.resources = resources;
    for (const resource of manifest.resources) {
      if (!resource?.id || !resource?.kind ||
          resource.runId !== manifest.runId ||
          resource.ownershipMarker !== manifest.ownershipMarker ||
          (resource.coordinatesHash ?? null) !== manifest.coordinatesHash ||
          (resource.effectiveTargetHash ?? null) !== manifest.effectiveTargetHash ||
          (manifest.manifestNonce &&
            resource.manifestNonce !== manifest.manifestNonce) ||
          !CLEANUP_PHASES.has(resource.phase) ||
          (resource.cleaned === true) !== (resource.phase === "cleaned") ||
          typeof resource.cleaned !== "boolean") {
        throw new Error("Cleanup manifest contains an invalid resource");
      }
    }
    return manifest;
  }

  persistIfConfigured() {
    if (this.filePath) this.persist();
  }

  assertMutationAllowed() {
    if (!this.reconciliationRequired) return;
    const error = new Error(
      "Cleanup manifest state is indeterminate; reload persisted state before mutation",
    );
    error.code = "cleanup_manifest_reconciliation_required";
    error.requiresReconciliation = true;
    error.cause = this.reconciliationError;
    throw error;
  }

  assertPersistedCurrent(filePath = this.filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      if (this.revision !== 0 || this.resources.length !== 0) {
        const error = new Error("Cleanup manifest persisted state is missing");
        error.code = "cleanup_manifest_stale";
        throw error;
      }
      return;
    }
    const persisted = this.loadPersisted(filePath);
    if (persisted.runId !== this.runId ||
        persisted.ownershipMarker !== this.ownershipMarker ||
        persisted.manifestId !== this.manifestId ||
        persisted.coordinatesHash !== this.coordinatesHash ||
        persisted.effectiveTargetHash !== this.effectiveTargetHash ||
        persisted.manifestNonce !== this.manifestNonce ||
        persisted.revision !== this.revision ||
        JSON.stringify(stable(persisted.resources)) !==
          JSON.stringify(stable(this.resources))) {
      const error = new Error("Cleanup manifest revision or resource phase is stale");
      error.code = "cleanup_manifest_stale";
      throw error;
    }
  }

  reconcilePersistedState(filePath, resource = null) {
    const persisted = this.loadPersisted(filePath);
    if (persisted.runId !== this.runId ||
        persisted.ownershipMarker !== this.ownershipMarker ||
        persisted.manifestId !== this.manifestId ||
        persisted.coordinatesHash !== this.coordinatesHash ||
        persisted.effectiveTargetHash !== this.effectiveTargetHash ||
        persisted.manifestNonce !== this.manifestNonce) {
      throw new Error("Cleanup manifest persisted identity changed during reconciliation");
    }
    let external = null;
    if (resource) {
      const current = persisted.resources.find((candidate) =>
        candidate.kind === resource.kind && candidate.id === resource.id);
      if (!current) {
        throw new Error("Cleanup resource is missing after persisted reconciliation");
      }
      external = structuredClone(current);
      delete external.cleaned;
    }
    this.revision = persisted.revision;
    this.resources = persisted.resources;
    this.filePath = filePath;
    if (resource) {
      for (const key of Object.keys(resource)) delete resource[key];
      Object.assign(resource, external);
    }
    this.reconciliationRequired = false;
    this.reconciliationError = null;
  }

  reloadPersisted(resource = null) {
    if (!this.filePath) throw new TypeError("Cleanup manifest path is required");
    this.reconcilePersistedState(this.filePath, resource);
    return this.evidence();
  }

  mutateAndPersist(resource, mutation) {
    this.assertMutationAllowed();
    const previousResources = structuredClone(this.resources);
    const previousRevision = this.revision;
    const previousResource = resource ? structuredClone(resource) : null;
    let lock = null;
    try {
      if (this.filePath) {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        lock = acquireLockSync(`${this.filePath}.lock`);
        this.assertPersistedCurrent();
      }
      mutation();
      if (this.filePath) this.persistUnlocked(this.filePath);
    } catch (error) {
      if (this.filePath && isIndeterminateAtomicWrite(error)) {
        try {
          this.reconcilePersistedState(this.filePath, resource);
          error.reconciled = true;
          error.persistedRevision = this.revision;
        } catch (reconciliationError) {
          this.reconciliationRequired = true;
          this.reconciliationError = reconciliationError;
          error.reconciled = false;
          error.reconciliationError = reconciliationError;
        }
      } else {
        this.resources = previousResources;
        this.revision = previousRevision;
        if (resource && previousResource) {
          for (const key of Object.keys(resource)) delete resource[key];
          Object.assign(resource, previousResource);
        }
      }
      throw error;
    } finally {
      lock?.release();
    }
  }

  record(resource) {
    this.assertMutationAllowed();
    if (!resource?.id || !resource?.kind) throw new TypeError("Cleanup resource id and kind are required");
    if (resource.runId !== this.runId || resource.ownershipMarker !== this.ownershipMarker) {
      throw new Error("Cleanup resource is not owned by this run");
    }
    if ((resource.coordinatesHash ?? null) !== this.coordinatesHash ||
        (resource.effectiveTargetHash ?? null) !== this.effectiveTargetHash) {
      throw new Error("Cleanup resource does not match the approved provider target");
    }
    if (this.manifestNonce && resource.manifestNonce !== this.manifestNonce) {
      throw new Error("Cleanup resource does not match the persisted manifest nonce");
    }
    if (this.resources.some((item) => item.id === resource.id && item.kind === resource.kind)) {
      throw new Error(`Cleanup resource already recorded: ${resource.kind}/${resource.id}`);
    }
    this.mutateAndPersist(resource, () => {
      resource.phase = "recorded";
      this.resources.push({
        ...structuredClone(resource),
        phase: "recorded",
        cleaned: false,
      });
      this.revision++;
    });
  }

  authorize(resource) {
    return this.resources.some((item) =>
      item.kind === resource.kind &&
      item.id === resource.id &&
      item.runId === resource.runId &&
      item.ownershipMarker === resource.ownershipMarker &&
      (item.coordinatesHash ?? null) === (resource.coordinatesHash ?? null) &&
      (item.effectiveTargetHash ?? null) === (resource.effectiveTargetHash ?? null) &&
      JSON.stringify(item.condition || null) === JSON.stringify(resource.condition || null) &&
      item.cleaned === false);
  }

  markCleaned(resource) {
    this.transition(resource, ["deleted"], "cleaned", { cleaned: true });
  }

  markMutating(resource) {
    this.transition(resource, ["prepared", "mutating"], "mutating");
  }

  markPrepared(resource) {
    this.transition(resource, ["mutating", "prepared"], "prepared");
  }

  markDeleted(resource) {
    this.assertMutationAllowed();
    const phase = this.phase(resource);
    const absentWithoutMutation = phase === "prepared" && resource.condition?.absent === true;
    if (!absentWithoutMutation && phase !== "mutating" && phase !== "deleted") {
      throw new Error("Refusing cleanup phase transition");
    }
    this.transition(resource, [phase], "deleted");
  }

  phase(resource) {
    return this.resources.find((candidate) =>
      candidate.kind === resource.kind && candidate.id === resource.id)?.phase || null;
  }

  transition(resource, allowedPhases, nextPhase, { cleaned = false } = {}) {
    this.assertMutationAllowed();
    const item = this.resources.find((candidate) =>
      candidate.kind === resource.kind && candidate.id === resource.id);
    if (!item || !this.authorize(resource) || !allowedPhases.includes(item.phase)) {
      throw new Error("Refusing cleanup phase transition");
    }
    this.mutateAndPersist(resource, () => {
      if (item.phase === nextPhase && item.cleaned === cleaned) {
        resource.phase = nextPhase;
        return;
      }
      item.phase = nextPhase;
      item.cleaned = cleaned;
      resource.phase = nextPhase;
      this.revision++;
    });
  }

  bindCondition(resource, condition) {
    this.assertMutationAllowed();
    const item = this.resources.find((candidate) =>
      candidate.kind === resource.kind && candidate.id === resource.id);
    if (!item || item.cleaned || item.phase !== "recorded" ||
        item.condition || resource.condition) {
      throw new Error("Refusing to replace or duplicate a cleanup condition");
    }
    this.mutateAndPersist(resource, () => {
      item.condition = structuredClone(condition);
      resource.condition = structuredClone(condition);
      item.phase = "prepared";
      resource.phase = "prepared";
      this.revision++;
    });
  }

  payload() {
    return {
      schemaVersion: SCHEMA_VERSION,
      syntheticData: true,
      revision: this.revision,
      runId: this.runId,
      ownershipMarker: this.ownershipMarker,
      manifestId: this.manifestId,
      coordinatesHash: this.coordinatesHash,
      effectiveTargetHash: this.effectiveTargetHash,
      manifestNonce: this.manifestNonce,
      resources: this.resources.map((item) => structuredClone(item)),
    };
  }

  toJSON() {
    const payload = this.payload();
    return {
      ...payload,
      manifestDigest: manifestDigest(payload),
    };
  }

  evidence() {
    const document = this.toJSON();
    return {
      artifact: this.filePath ? path.basename(this.filePath) : "cleanup-manifest.json",
      manifestId: this.manifestId,
      manifestNonce: this.manifestNonce,
      digest: document.manifestDigest,
      schemaVersion: document.schemaVersion,
      revision: document.revision,
      resourceCount: document.resources.length,
      cleanedCount: document.resources.filter((resource) => resource.cleaned).length,
      phases: Object.fromEntries(
        [...CLEANUP_PHASES].map((phase) => [
          phase,
          document.resources.filter((resource) => resource.phase === phase).length,
        ]),
      ),
    };
  }

  persistUnlocked(filePath) {
    const document = this.toJSON();
    writeFileAtomicSync(
      filePath,
      JSON.stringify(document, null, 2) + "\n",
      this.syncDirectory ? { syncDirectory: this.syncDirectory } : undefined,
    );
    this.filePath = filePath;
    return this.evidence();
  }

  persist(filePath = this.filePath) {
    this.assertMutationAllowed();
    if (!filePath) throw new TypeError("Cleanup manifest path is required");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const previousPath = this.filePath;
    const lock = acquireLockSync(`${filePath}.lock`);
    try {
      if (fs.existsSync(filePath)) {
        this.assertPersistedCurrent(filePath);
      } else if (previousPath === filePath && (this.revision !== 0 || this.resources.length !== 0)) {
        const error = new Error("Cleanup manifest persisted state is missing");
        error.code = "cleanup_manifest_stale";
        throw error;
      }
      try {
        return this.persistUnlocked(filePath);
      } catch (error) {
        if (isIndeterminateAtomicWrite(error)) {
          try {
            this.reconcilePersistedState(filePath);
            error.reconciled = true;
            error.persistedRevision = this.revision;
          } catch (reconciliationError) {
            this.reconciliationRequired = true;
            this.reconciliationError = reconciliationError;
            error.reconciled = false;
            error.reconciliationError = reconciliationError;
          }
        }
        throw error;
      }
    } finally {
      lock.release();
    }
  }

  write(filePath) {
    return this.persist(filePath);
  }
}

export function createCleanupAuthorization(config, store, { filePath = null } = {}) {
  if (typeof store?.cleanupResource !== "function") {
    throw new TypeError("Provider store must describe its cleanup resource");
  }
  const persistedManifest = filePath && fs.existsSync(filePath)
    ? CleanupManifest.load(filePath)
    : null;
  const configuredNonce = config.sandbox?.cleanup?.manifestNonce || null;
  const manifestNonce =
    persistedManifest?.manifestNonce ||
    configuredNonce ||
    store.cleanupManifestNonce ||
    crypto.randomUUID();
  if (persistedManifest && (!persistedManifest.manifestNonce ||
      (configuredNonce && configuredNonce !== persistedManifest.manifestNonce))) {
    throw new Error("Persisted cleanup manifest nonce does not match this provider run");
  }
  store.bindCleanupManifestNonce?.(manifestNonce);
  if (config.sandbox?.cleanup) {
    config.sandbox.cleanup.manifestNonce = manifestNonce;
  }
  const resource = store.cleanupResource();
  const coordinates = config.backingPath === "onedrive"
    ? {
      driveId: config.driveId || config.sandbox?.coordinates?.driveId,
      folder: config.folderPath || config.sandbox?.coordinates?.folder,
    }
    : config.backingPath === "ado"
      ? {
        organization: config.org || config.sandbox?.coordinates?.organization,
        project: config.project || config.sandbox?.coordinates?.project,
        repository: config.repo || config.sandbox?.coordinates?.repository,
      }
      : {
        owner: config.owner || config.sandbox?.coordinates?.owner,
        repository: config.repo || config.sandbox?.coordinates?.repository,
      };
  const coordinatesHash = cleanupCoordinatesHash(config.backingPath, coordinates);
  const effectiveTargetHash =
    config.sandbox?.effectiveTargetHash ||
    config.sandbox?.approval?.targetHash ||
    "dry-run-unapproved";
  if (resource.coordinatesHash !== coordinatesHash ||
      resource.effectiveTargetHash !== effectiveTargetHash ||
      resource.manifestNonce !== manifestNonce) {
    throw new Error("Cleanup store does not match the approved provider coordinates");
  }
  const manifestId = config.sandbox?.cleanup?.manifestId || null;
  if (persistedManifest) {
    const manifest = persistedManifest;
    const recorded = manifest.resources.find((candidate) =>
      candidate.kind === resource.kind && candidate.id === resource.id);
    if (manifest.runId !== config.runId ||
        manifest.ownershipMarker !== config.sandbox?.ownershipMarker ||
        manifest.manifestId !== manifestId ||
        manifest.coordinatesHash !== coordinatesHash ||
        manifest.effectiveTargetHash !== effectiveTargetHash ||
        manifest.manifestNonce !== manifestNonce ||
        !recorded ||
        recorded.cleaned === true ||
        recorded.runId !== resource.runId ||
        recorded.ownershipMarker !== resource.ownershipMarker ||
        recorded.coordinatesHash !== resource.coordinatesHash ||
        recorded.effectiveTargetHash !== resource.effectiveTargetHash ||
        recorded.manifestNonce !== resource.manifestNonce ||
        JSON.stringify(recorded.marker || null) !==
          JSON.stringify(resource.marker || null)) {
      throw new Error("Persisted cleanup manifest does not authorize this provider run");
    }
    const resumedResource = structuredClone(recorded);
    delete resumedResource.cleaned;
    return { manifest, resource: resumedResource };
  }
  const manifest = new CleanupManifest({
    runId: config.runId,
    ownershipMarker: config.sandbox?.ownershipMarker,
    manifestId,
    coordinatesHash,
    effectiveTargetHash,
    manifestNonce,
    filePath,
  });
  manifest.record(resource);
  return { manifest, resource };
}

export function assertCleanupAuthorized(manifest, resource, expected) {
  if (!manifest?.authorize?.(resource) ||
      (expected?.manifestId && manifest.manifestId !== expected.manifestId) ||
      resource?.kind !== expected?.kind ||
      resource?.id !== expected?.id ||
      resource?.runId !== expected?.runId ||
      resource?.ownershipMarker !== expected?.ownershipMarker ||
      resource?.coordinatesHash !== expected?.coordinatesHash ||
      resource?.effectiveTargetHash !== expected?.effectiveTargetHash ||
      resource?.manifestNonce !== expected?.manifestNonce ||
      manifest.manifestNonce !== expected?.manifestNonce ||
      JSON.stringify(resource?.marker || null) !==
        JSON.stringify(expected?.marker || null)) {
    throw new Error("Refusing provider cleanup without exact manifest authorization");
  }
}
