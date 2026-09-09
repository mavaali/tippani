export const COMPLEXITY_RUBRIC = Object.freeze({
  scale: "1=trivial, 2=low, 3=moderate, 4=high, 5=very high",
  dimensions: Object.freeze([
    "dependencies",
    "implementation",
    "test",
    "migration",
    "deployment",
    "maintenance",
    "diagnostics",
    "recovery",
  ]),
});

const PROFILES = Object.freeze({
  "local-sqlite": Object.freeze({
    scores: Object.freeze({ dependencies: 1, implementation: 2, test: 2, migration: 2, deployment: 1, maintenance: 2, diagnostics: 2, recovery: 2 }),
    evidence: Object.freeze({
      dependencies: "Built-in node:sqlite API",
      implementation: "One built-in node:sqlite database with transactional rows and WAL",
      test: "Transaction, process-kill, corruption, migration, and backup fixtures",
      migration: "Schema migration inside database transactions",
      deployment: "No service, credential, or native package",
      maintenance: "One built-in database API",
      diagnostics: "Database health, schema, and workspace diagnostics",
      recovery: "SQLite transaction journal and WAL recovery",
    }),
  }),
  "local-cas": Object.freeze({
    scores: Object.freeze({ dependencies: 1, implementation: 3, test: 3, migration: 2, deployment: 1, maintenance: 3, diagnostics: 3, recovery: 3 }),
    evidence: Object.freeze({
      dependencies: "Built-in filesystem and crypto APIs",
      implementation: "Envelope, alias index, lock ownership, fsync, and atomic replace",
      test: "Filesystem race, process-kill, torn-replace, corruption, and backup fixtures",
      migration: "Envelope migration with explicit original preservation",
      deployment: "No service, credential, or external package",
      maintenance: "Filesystem and platform-specific durability behavior",
      diagnostics: "Envelope, index, lock, and temp-file diagnostics",
      recovery: "Stale-lock, temp-file, index rebuild, and replace recovery",
    }),
  }),
  onedrive: Object.freeze({
    scores: Object.freeze({ dependencies: 2, implementation: 3, test: 4, migration: 3, deployment: 3, maintenance: 3, diagnostics: 3, recovery: 3 }),
    evidence: Object.freeze({
      dependencies: "Microsoft Graph drive API and delegated authentication",
      implementation: "Graph drive-item envelope with ETag CAS and version history",
      test: "Live sandbox, concurrency, offline, failure, version, and cleanup coverage",
      migration: "Receipt-gated local-to-drive rehome",
      deployment: "Delegated credential, drive coordinates, and approved namespace",
      maintenance: "Graph API and OneDrive consistency behavior",
      diagnostics: "Provider responses, request telemetry, and authoritative generation state",
      recovery: "Version history plus offline conflict reconciliation",
    }),
  }),
  ado: Object.freeze({
    scores: Object.freeze({ dependencies: 2, implementation: 3, test: 4, migration: 3, deployment: 3, maintenance: 3, diagnostics: 3, recovery: 3 }),
    evidence: Object.freeze({
      dependencies: "Azure DevOps Git REST API and scoped authentication",
      implementation: "Repository envelope with branch-tip oldObjectId CAS",
      test: "Live repository, ref race, offline, failure, history, and cleanup coverage",
      migration: "Receipt-gated local-to-repository rehome",
      deployment: "Scoped credential, repository coordinates, and per-run branch",
      maintenance: "ADO Git REST API and ref semantics",
      diagnostics: "Provider responses, request telemetry, branch, commit, and generation state",
      recovery: "Auditable commit history plus offline conflict reconciliation",
    }),
  }),
  github: Object.freeze({
    scores: Object.freeze({ dependencies: 2, implementation: 4, test: 4, migration: 3, deployment: 3, maintenance: 4, diagnostics: 3, recovery: 3 }),
    evidence: Object.freeze({
      dependencies: "GitHub REST API and repository-scoped authentication",
      implementation: "Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads",
      test: "Live repository, blob race, consistency, offline, history, and cleanup coverage",
      migration: "Receipt-gated local-to-repository rehome",
      deployment: "Repository-scoped credential, coordinates, and per-run branch",
      maintenance: "GitHub REST API, blob/ref semantics, and read-after-write consistency handling",
      diagnostics: "Provider responses, request telemetry, branch, blob, and generation state",
      recovery: "Commit history plus offline conflict reconciliation",
    }),
  }),
});

export function complexityAssessment(config) {
  const key = config.backingPath === "local" ? config.adapter : config.backingPath;
  const profile = PROFILES[key];
  if (!profile) throw new Error(`No S0 complexity profile for ${key}`);
  const total = Object.values(profile.scores).reduce((sum, score) => sum + score, 0);
  return {
    rubric: COMPLEXITY_RUBRIC,
    scores: { ...profile.scores },
    total,
    evidence: { ...profile.evidence },
  };
}