const absolute = "absolute";
const relative = "relative";

const entries = [
  ["S0-ATM-001", absolute, "A multi-field workspace mutation commits completely or not at all", "1"],
  ["S0-ATM-002", absolute, "Branch-to-PR alias transition preserves one workspace and commits alias/index/state atomically", "1"],
  ["S0-ATM-003", absolute, "Failed mutation exposes no empty-body intent, mixed generation, or dangling alias", "1"],
  ["S0-CON-001", absolute, "Portal/user and Copilot/MCP writers from generation g produce one winner and one typed stale conflict", "2"],
  ["S0-CON-002", absolute, "Multiple headless/automation clients cannot overwrite a newer generation", "2"],
  ["S0-CON-003", absolute, "Independent workspaces progress concurrently without global serialization", "2"],
  ["S0-CON-004", absolute, "Concurrent staging during publication preserves the newer intent revision", "2"],
  ["S0-CON-005", absolute, "Lock/CAS contention is bounded, observable, and retryable", "2"],
  ["S0-JRN-001", absolute, "Frozen intent tuples and planned journal become durable atomically before any provider operation", "3"],
  ["S0-JRN-002", absolute, "No journal references a missing workspace, generation, or intent revision", "3"],
  ["S0-CRS-001", absolute, "Kill before/during/after commit recovers only the complete previous or committed generation", "4"],
  ["S0-CRS-002", absolute, "Kill during alias/index update never exposes a partially updated index", "4"],
  ["S0-CRS-003", absolute, "Kill during backup or migration leaves an unambiguous recoverable state", "4"],
  ["S0-COL-001", absolute, "Independent local actors observe one stable workspace/generation and equal concurrency rules", "5"],
  ["S0-COL-002", absolute, "Two users on a shared backing path cannot silently overwrite each other", "5"],
  ["S0-COL-003", absolute, "Two devices reconnecting from different generations receive deterministic conflict/reload behavior", "5"],
  ["S0-COL-004", absolute, "Remote success with a lost response is reconciled without duplicate generation or false failure", "5"],
  ["S0-COL-005", absolute, "Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite", "5"],
  ["S0-COL-006", absolute, "Another collaborator discovers a committed generation through the backing path change mechanism", "5"],
  ["S0-BCK-001", absolute, "Local flush and atomic replace preserve file and index durability under supported filesystems", "6"],
  ["S0-BCK-002", absolute, "OneDrive ETag/version preconditions reject stale updates and support version recovery", "6"],
  ["S0-BCK-003", absolute, "ADO object/ref preconditions reject stale updates and preserve one auditable generation commit", "6"],
  ["S0-BCK-004", absolute, "GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit", "6"],
  ["S0-BCK-005", absolute, "Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state", "6"],
  ["S0-BCK-006", relative, "Synced-folder conflict behavior is measured separately from provider-API CAS", "6"],
  ["S0-COR-001", absolute, "Truncated, invalid, checksum-failing, or damaged primary state is detected and preserved/quarantined", "7"],
  ["S0-COR-002", absolute, "Missing/dangling aliases and duplicate identities fail closed", "7"],
  ["S0-COR-003", absolute, "Unsupported schema/provider-operation version fails closed with a typed state", "7"],
  ["S0-COR-004", absolute, "Permission-denied or unreadable existing state is never treated as an absent/new store", "7"],
  ["S0-HYD-001", absolute, "Startup enumerates and validates all workspaces/aliases before APIs open", "8"],
  ["S0-HYD-002", absolute, "Rehydration restores exact generation, intent order, private state, journal state, and last selection", "8"],
  ["S0-HYD-003", absolute, "Incomplete/indeterminate journals are surfaced for reconciliation before mutation is accepted", "8"],
  ["S0-MIG-001", absolute, "Forward migration is transactional or resumable, idempotent, and preserves originals/audit", "9"],
  ["S0-MIG-002", absolute, "Interrupted migration resumes or rolls back without ambiguity", "9"],
  ["S0-MIG-003", absolute, "Unsupported source version and downgrade policy are explicit and fail closed", "9"],
  ["S0-MIG-004", absolute, "Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt", "9"],
  ["S0-IMP-001", absolute, "Complete checksummed legacy envelope validates before atomic import", "10"],
  ["S0-IMP-002", absolute, "Failed/corrupt/duplicate legacy import preserves source and creates no partial destination", "10"],
  ["S0-BKP-001", absolute, "Active-store backup is internally consistent at one logical generation", "11"],
  ["S0-BKP-002", absolute, "Restore reproduces exact workspace/journal state and rejects incomplete/corrupt backup", "11"],
  ["S0-BKP-003", absolute, "Shared-backing history/export recovers a known generation without rewriting newer valid history", "11"],
  ["S0-BKP-004", absolute, "Restored shared workspace establishes one explicit authoritative head", "11"],
  ["S0-REC-001", absolute, "Clean and forced shutdown restart recover exact durable state", "12"],
  ["S0-REC-002", absolute, "Stale lock recovery removes only provably owned stale state", "12"],
  ["S0-REC-003", absolute, "Provider outage/auth/throttle/lost-response recovery reconciles authoritative state", "12"],
  ["S0-REC-004", absolute, "Local offline cache reconciles against newer authority without silent overwrite", "12"],
  ["S0-REC-005", absolute, "Diagnostics identify recovery state without exposing content or credentials", "12"],
  ["S0-SEC-001", absolute, "Preflight rejects non-allow-listed, unmarked, default/protected, or production coordinates before provider calls", "Safety contract"],
  ["S0-SEC-002", absolute, "Effective sandbox identity is verified and corporate-account fallback is impossible", "Prerequisites"],
  ["S0-SEC-003", absolute, "Only synthetic data appears in stores, fixtures, logs, backups, screenshots, dumps, and reports", "Prerequisites"],
  ["S0-SEC-004", absolute, "Credentials remain brokered/redacted and absent from workspace state and evidence", "Safety contract"],
  ["S0-SEC-005", absolute, "Cleanup/reaper deletes only run-owned resources recorded in the manifest", "Safety contract"],
  ["S0-SEC-006", absolute, "Provider request/object/time/storage budgets stop unsafe or abusive runs", "Safety contract"],
  ["S0-PER-001", relative, "Cold startup and enumeration are measured at small, medium, and stress scale", "13"],
  ["S0-PER-002", relative, "Alias-open, mutation, conflict, and journal p50/p95 are measured comparably", "13"],
  ["S0-PER-003", relative, "Backup/restore time, store size, memory, and write amplification are measured comparably", "13"],
  ["S0-PER-004", relative, "Provider requests, bytes, throttling, CAS latency, and collaborator discovery are measured comparably", "13"],
  ["S0-PER-005", relative, "Operational and implementation complexity is recorded using the same rubric", "Decision criteria"],
];

export const SCENARIOS = Object.freeze(entries.map(([id, criterionType, title, section]) =>
  Object.freeze({ id, criterionType, title, section })));

export function scenarioById(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) || null;
}

export function validateScenarioCatalog(catalog = SCENARIOS) {
  const seen = new Set();
  for (const scenario of catalog) {
    if (!/^S0-[A-Z]{3}-\d{3}$/.test(scenario.id)) {
      throw new Error(`Invalid scenario ID: ${scenario.id}`);
    }
    if (seen.has(scenario.id)) throw new Error(`Duplicate scenario ID: ${scenario.id}`);
    if (![absolute, relative].includes(scenario.criterionType)) {
      throw new Error(`Invalid criterion type for ${scenario.id}`);
    }
    if (!scenario.title || !scenario.section) {
      throw new Error(`Incomplete scenario definition: ${scenario.id}`);
    }
    seen.add(scenario.id);
  }
  return true;
}
