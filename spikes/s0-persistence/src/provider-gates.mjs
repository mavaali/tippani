// Provider-backed absolute gates cannot be executed until an approved live
// sandbox exists. Each entry states the precise prerequisite the gate waits on,
// so coverage discloses a specific blocker rather than a bare "not executed".
//
// These are recorded as `Blocked` (not `Incomplete`): the invariant is real and
// required, the harness is ready, and only the live sandbox is missing.

const ONEDRIVE = "an approved non-production OneDrive/SharePoint sandbox with \u22652 test identities";
const ADO = "an approved disposable Azure DevOps sandbox repository and least-privilege identity";
const GITHUB = "an approved disposable GitHub sandbox repository and repository-scoped identity";
const ANY_PROVIDER = "an approved live OneDrive/ADO/GitHub sandbox";

export const BLOCKED_REASONS = Object.freeze({
  "S0-COL-002": `Blocked \u2014 requires ${ANY_PROVIDER} with two test identities on one shared backing path.`,
  "S0-COL-003": `Blocked \u2014 requires ${ANY_PROVIDER} exercised from two devices/generations with reconnect.`,
  "S0-COL-004": `Blocked \u2014 requires ${ANY_PROVIDER} with lost-response fault injection against a real commit.`,
  "S0-COL-005": `Blocked \u2014 requires ${ANY_PROVIDER} with offline write then authoritative CAS confirmation.`,
  "S0-COL-006": `Blocked \u2014 requires ${ANY_PROVIDER} change-discovery feed observed by a second collaborator.`,
  "S0-BCK-002": `Blocked \u2014 requires ${ONEDRIVE} for ETag/version precondition and version-restore tests.`,
  "S0-BCK-003": `Blocked \u2014 requires ${ADO} for object/ref precondition and auditable-commit tests.`,
  "S0-BCK-004": `Blocked \u2014 requires ${GITHUB} for object/ref precondition and auditable-commit tests.`,
  "S0-BCK-005": `Blocked \u2014 requires ${ANY_PROVIDER} with outage/throttle/auth-expiry/quota fault injection.`,
  "S0-BCK-006": `Blocked \u2014 requires a Windows OneDrive sync-client profile to measure synced-folder conflicts.`,
  "S0-BKP-003": `Blocked \u2014 requires ${ANY_PROVIDER} version history/export to recover a known generation.`,
  "S0-BKP-004": `Blocked \u2014 requires ${ANY_PROVIDER} to prove a restored shared workspace has one authoritative head.`,
  "S0-REC-003": `Blocked \u2014 requires ${ANY_PROVIDER} with outage/auth/throttle/lost-response recovery.`,
  "S0-REC-004": `Blocked \u2014 requires ${ANY_PROVIDER} plus a local offline cache to reconcile against newer authority.`,
  "S0-MIG-004": `Blocked \u2014 requires a live ${ANY_PROVIDER} destination for local-to-shared rehome.`,
  "S0-PER-004": `Blocked \u2014 requires ${ANY_PROVIDER} to measure request count, bytes, throttling, and CAS latency.`,
});

export const PROVIDER_GATE_IDS = Object.freeze(Object.keys(BLOCKED_REASONS));

// The concrete prerequisites Kay must supply to unblock the provider path. The
// preflight sheet reproduces this so approval is a single reviewed artifact.
export const PROVIDER_PREREQUISITES = Object.freeze([
  "Dedicated non-corporate sandbox identity (Visual Studio subscription), with corporate-account fallback impossible.",
  "Azure DevOps: sandbox org URL, project, disposable repo, per-run branch namespace, least-privilege token/identity.",
  "GitHub: sandbox account/org, disposable private repo, repository-scoped fine-grained token or App installation.",
  "OneDrive/SharePoint: non-production location with \u22652 test identities, versioning, and delete permission.",
  "Budgets: operation/request/object/time/storage limits and a cleanup manifest with an expiry.",
  "Explicit approval of the generated preflight sheet before any live provider call.",
]);
