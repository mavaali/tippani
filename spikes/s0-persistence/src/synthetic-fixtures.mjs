import crypto from "node:crypto";
import { deepClone, validateWorkspaceRecord } from "./workspace-contract.mjs";

const SCALE = Object.freeze({
  small: { documents: 2, intents: 2 },
  medium: { documents: 25, intents: 50 },
  stress: { documents: 500, intents: 1000 },
});

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slug(seed) {
  return String(seed || "reference")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "reference";
}

export function createSyntheticWorkspace({ seed = "reference", scale = "small" } = {}) {
  const shape = SCALE[scale];
  if (!shape) throw new RangeError(`Unknown synthetic scale: ${scale}`);
  const id = slug(seed);
  const documentsByPath = {};
  for (let i = 1; i <= shape.documents; i++) {
    const path = `specs/synthetic-${String(i).padStart(4, "0")}.md`;
    const body = `# Synthetic specification ${i}\n\nGenerated fixture ${id}-${i}.\n`;
    documentsByPath[path] = {
      documentId: `syn-doc-${id}-${i}`,
      sourceRevision: `syn-rev-${i}`,
      activeAdapter: "synthetic",
      body,
      contentHash: hash(body),
    };
  }

  const intentsById = {};
  const orderedIntentIds = [];
  const documentPaths = Object.keys(documentsByPath);
  for (let i = 1; i <= shape.intents; i++) {
    const intentId = `syn-intent-${id}-${i}`;
    const path = documentPaths[(i - 1) % documentPaths.length];
    const contentHash = documentsByPath[path].contentHash;
    intentsById[intentId] = {
      intentId,
      intentRevision: 1,
      contentHash,
      operation: "edit",
      path,
    };
    orderedIntentIds.push(intentId);
  }

  const firstPath = documentPaths[0];
  const workspace = {
    schemaVersion: 1,
    syntheticData: true,
    workspaceId: `syn-ws-${id}`,
    aliases: [`syn-alias-branch-${id}`],
    activePublicationTarget: `syn-target-${id}`,
    mode: "remote",
    documentsByPath,
    selectedDocumentPath: firstPath,
    generation: 0,
    pushable: {
      remote: { intentsById, orderedIntentIds },
    },
    localManifest: {
      repoIdentity: `syn-repo-${id}`,
      branch: `tippani-s0/${id}`,
      baselineHead: `syn-head-${id}-0`,
      observedUpstream: `syn-remote-${id}-0`,
      ownedPaths: {},
      recognizedOutgoingCommits: [],
    },
    private: {
      personalAnnotations: [{
        id: `syn-note-${id}-1`,
        author: "Synthetic Person 001",
        content: "Synthetic annotation for persistence testing.",
      }],
      selection: { documentPath: firstPath },
      activeContext: { actor: "Synthetic Actor A" },
      viewedProgress: {},
      pendingProposals: {},
      paneRecovery: { activePane: "document" },
      locksMetadata: {},
      audit: [],
    },
    publication: { activeJournalId: null, journalsById: {} },
    lifecycle: { state: "active", lastClientAt: "2000-01-01T00:00:00.000Z" },
  };
  validateWorkspaceRecord(workspace);
  assertSyntheticOnly(workspace);
  return workspace;
}

function walk(value, visit, path = "$") {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walk(item, visit, `${path}.${key}`);
    }
  }
}

export function assertSyntheticOnly(value) {
  if (!value || value.syntheticData !== true) {
    throw new Error("Synthetic fixture marker is required");
  }
  const forbidden = [
    /\bmicrosoft\.com\b/i,
    /\bdev\.azure\.com\b/i,
    /\bgithub\.com\b/i,
    /\bsharepoint\.com\b/i,
    /@(?!(?:example\.invalid)\b)[a-z0-9.-]+\.[a-z]{2,}\b/i,
    /\bhttps?:\/\/(?![a-z0-9.-]+\.invalid\b|localhost\b|127\.0\.0\.1\b)/i,
  ];
  walk(value, (item, path) => {
    if (typeof item !== "string") return;
    if (forbidden.some((pattern) => pattern.test(item))) {
      throw new Error(`Non-synthetic value detected at ${path}`);
    }
  });
  return true;
}

export function cloneSyntheticWorkspace(workspace) {
  assertSyntheticOnly(workspace);
  return deepClone(workspace);
}

// A minimal prior-schema (v0) record: documents were a flat path->body map and
// annotations lived at the top level. It is deliberately smaller than the v1
// shape so migration has real structural work to do.
export function createLegacyWorkspaceV0({ seed = "legacy", generation = 0 } = {}) {
  const id = slug(seed);
  const documents = {};
  for (let i = 1; i <= 2; i++) {
    const path = `specs/synthetic-${String(i).padStart(4, "0")}.md`;
    documents[path] = `# Synthetic legacy specification ${i}\n\nGenerated v0 fixture ${id}-${i}.\n`;
  }
  const legacy = {
    schemaVersion: 0,
    syntheticData: true,
    workspaceId: `syn-ws-${id}`,
    aliases: [`syn-alias-branch-${id}`],
    generation,
    documents,
    selectedDocumentPath: Object.keys(documents)[0],
    annotations: [{
      id: `syn-note-${id}-1`,
      author: "Synthetic Person 001",
      content: "Synthetic annotation carried from v0.",
    }],
  };
  assertSyntheticOnly(legacy);
  return legacy;
}

// Pure forward migration v0 -> v1. Preserves identity, aliases, generation, and
// annotations, and records a migration audit event. Throws fail-closed on any
// unsupported source version so a newer record is never silently downgraded.
export function migrateWorkspaceV0ToV1(legacy) {
  if (!legacy || typeof legacy !== "object") {
    throw new Error("Legacy record is required");
  }
  if (legacy.schemaVersion !== 0) {
    const error = new Error(`Unsupported source schema version: ${legacy.schemaVersion}`);
    error.code = "unsupported_schema";
    throw error;
  }
  const documentsByPath = {};
  for (const [path, body] of Object.entries(legacy.documents || {})) {
    documentsByPath[path] = {
      documentId: `syn-doc-${legacy.workspaceId}-${Object.keys(documentsByPath).length + 1}`,
      sourceRevision: "syn-rev-migrated",
      activeAdapter: "synthetic",
      body,
      contentHash: hash(body),
    };
  }
  const firstPath = Object.keys(documentsByPath)[0] || null;
  const migrated = {
    schemaVersion: 1,
    syntheticData: true,
    workspaceId: legacy.workspaceId,
    aliases: [...(legacy.aliases || [])],
    activePublicationTarget: `syn-target-${legacy.workspaceId}`,
    mode: "remote",
    documentsByPath,
    selectedDocumentPath: legacy.selectedDocumentPath || firstPath,
    generation: Number.isInteger(legacy.generation) ? legacy.generation : 0,
    pushable: { remote: { intentsById: {}, orderedIntentIds: [] } },
    localManifest: {
      repoIdentity: `syn-repo-${legacy.workspaceId}`,
      branch: `tippani-s0/${legacy.workspaceId}`,
      baselineHead: `syn-head-${legacy.workspaceId}-0`,
      observedUpstream: `syn-remote-${legacy.workspaceId}-0`,
      ownedPaths: {},
      recognizedOutgoingCommits: [],
    },
    private: {
      personalAnnotations: deepClone(legacy.annotations || []),
      selection: { documentPath: legacy.selectedDocumentPath || firstPath },
      activeContext: { actor: "Synthetic Actor A" },
      viewedProgress: {},
      pendingProposals: {},
      paneRecovery: { activePane: "document" },
      locksMetadata: {},
      audit: [{ actor: "Synthetic Migrator", action: "migrate-v0-to-v1" }],
    },
    publication: { activeJournalId: null, journalsById: {} },
    lifecycle: { state: "active", lastClientAt: "2000-01-01T00:00:00.000Z" },
  };
  validateWorkspaceRecord(migrated);
  assertSyntheticOnly(migrated);
  return migrated;
}