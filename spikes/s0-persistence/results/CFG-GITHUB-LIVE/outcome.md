# S0 Outcome: CFG-GITHUB-LIVE

**Report date:** 2026-08-16
**Harness revision:** s0-harness-v2
**Configuration ID:** CFG-GITHUB-LIVE
**Adapter:** github
**Authoritative backing path:** github
**Dataset scale:** small
**Recommendation:** Incomplete

## Coverage

Executed 9 of 58 catalog scenarios (43 absolute gates not executed).

Not executed in this configuration:

- `S0-ATM-001` (absolute) — A multi-field workspace mutation commits completely or not at all
- `S0-ATM-002` (absolute) — Branch-to-PR alias transition preserves one workspace and commits alias/index/state atomically
- `S0-ATM-003` (absolute) — Failed mutation exposes no empty-body intent, mixed generation, or dangling alias
- `S0-CON-001` (absolute) — Portal/user and Copilot/MCP writers from generation g produce one winner and one typed stale conflict
- `S0-CON-002` (absolute) — Multiple headless/automation clients cannot overwrite a newer generation
- `S0-CON-003` (absolute) — Independent workspaces progress concurrently without global serialization
- `S0-CON-004` (absolute) — Concurrent staging during publication preserves the newer intent revision
- `S0-CON-005` (absolute) — Lock/CAS contention is bounded, observable, and retryable
- `S0-JRN-001` (absolute) — Frozen intent tuples and planned journal become durable atomically before any provider operation
- `S0-JRN-002` (absolute) — No journal references a missing workspace, generation, or intent revision
- `S0-CRS-001` (absolute) — Kill before/during/after commit recovers only the complete previous or committed generation
- `S0-CRS-002` (absolute) — Kill during alias/index update never exposes a partially updated index
- `S0-CRS-003` (absolute) — Kill during backup or migration leaves an unambiguous recoverable state
- `S0-COL-001` (absolute) — Independent local actors observe one stable workspace/generation and equal concurrency rules
- `S0-COL-002` (absolute) — Two users on a shared backing path cannot silently overwrite each other
- `S0-COL-003` (absolute) — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- `S0-COL-006` (absolute) — Another collaborator discovers a committed generation through the backing path change mechanism
- `S0-BCK-001` (absolute) — Local flush and atomic replace preserve file and index durability under supported filesystems
- `S0-BCK-002` (absolute) — OneDrive ETag/version preconditions reject stale updates and support version recovery
- `S0-BCK-003` (absolute) — ADO object/ref preconditions reject stale updates and preserve one auditable generation commit
- `S0-BCK-006` (relative) — Synced-folder conflict behavior is measured separately from provider-API CAS
- `S0-COR-001` (absolute) — Truncated, invalid, checksum-failing, or damaged primary state is detected and preserved/quarantined
- `S0-COR-002` (absolute) — Missing/dangling aliases and duplicate identities fail closed
- `S0-COR-003` (absolute) — Unsupported schema/provider-operation version fails closed with a typed state
- `S0-COR-004` (absolute) — Permission-denied or unreadable existing state is never treated as an absent/new store
- `S0-HYD-001` (absolute) — Startup enumerates and validates all workspaces/aliases before APIs open
- `S0-HYD-002` (absolute) — Rehydration restores exact generation, intent order, private state, journal state, and last selection
- `S0-HYD-003` (absolute) — Incomplete/indeterminate journals are surfaced for reconciliation before mutation is accepted
- `S0-MIG-001` (absolute) — Forward migration is transactional or resumable, idempotent, and preserves originals/audit
- `S0-MIG-002` (absolute) — Interrupted migration resumes or rolls back without ambiguity
- `S0-MIG-003` (absolute) — Unsupported source version and downgrade policy are explicit and fail closed
- `S0-IMP-001` (absolute) — Complete checksummed legacy envelope validates before atomic import
- `S0-IMP-002` (absolute) — Failed/corrupt/duplicate legacy import preserves source and creates no partial destination
- `S0-BKP-001` (absolute) — Active-store backup is internally consistent at one logical generation
- `S0-BKP-002` (absolute) — Restore reproduces exact workspace/journal state and rejects incomplete/corrupt backup
- `S0-REC-001` (absolute) — Clean and forced shutdown restart recover exact durable state
- `S0-REC-002` (absolute) — Stale lock recovery removes only provably owned stale state
- `S0-REC-005` (absolute) — Diagnostics identify recovery state without exposing content or credentials
- `S0-SEC-001` (absolute) — Preflight rejects non-allow-listed, unmarked, default/protected, or production coordinates before provider calls
- `S0-SEC-002` (absolute) — Effective sandbox identity is verified and corporate-account fallback is impossible
- `S0-SEC-003` (absolute) — Only synthetic data appears in stores, fixtures, logs, backups, screenshots, dumps, and reports
- `S0-SEC-004` (absolute) — Credentials remain brokered/redacted and absent from workspace state and evidence
- `S0-SEC-005` (absolute) — Cleanup/reaper deletes only run-owned resources recorded in the manifest
- `S0-SEC-006` (absolute) — Provider request/object/time/storage budgets stop unsafe or abusive runs
- `S0-PER-001` (relative) — Cold startup and enumeration are measured at small, medium, and stress scale
- `S0-PER-002` (relative) — Alias-open, mutation, conflict, and journal p50/p95 are measured comparably
- `S0-PER-003` (relative) — Backup/restore time, store size, memory, and write amplification are measured comparably
- `S0-PER-004` (relative) — Provider requests, bytes, throttling, CAS latency, and collaborator discovery are measured comparably
- `S0-PER-005` (relative) — Operational and implementation complexity is recorded using the same rubric

An unexecuted absolute gate is missing evidence, not a pass.

## Preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-github-live-20260816003913` |
| Operation budget | 100 |
| Duration budget | 300000 ms |

## Scenario results

| Scenario ID | Type | Status | Duration (ms) | Evidence |
|---|---|---|---:|---|
| `S0-BCK-004` | absolute | Pass | 7636.800 | winners=1; staleConflicts=1; durableGeneration=2 |
| `S0-BCK-005` | absolute | Pass | 5514.145 | faultsRejected=3; generationUnchanged=true |
| `S0-COL-004` | absolute | Pass | 4589.701 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1 |
| `S0-COL-005` | absolute | Pass | 6284.809 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2 |
| `S0-REC-003` | absolute | Pass | 4101.788 | outageRejected=true; recoveredGeneration=1 |
| `S0-REC-004` | absolute | Pass | 6552.046 | discoveredNewerAuthority=true; noSilentOverwrite=true |
| `S0-MIG-004` | absolute | Pass | 2726.839 | workspaceIdPreserved=true; generation=1; receipt=true |
| `S0-BKP-003` | absolute | Pass | 5026.376 | recoveredGeneration=1 |
| `S0-BKP-004` | absolute | Pass | 8929.004 | restoredGeneration=2; oneHead=true |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| - | No measurements emitted | - | - |

## Failures and recovery

No scenario failures.

## Risks and required follow-up

- Reference-memory results validate the harness, not a production candidate.
- Candidate adapters must implement every applicable absolute scenario before ADR comparison.

## Sign-off

| Role | Person | Date | Decision / comments |
|---|---|---|---|
| Implementer | | | |
| Independent reviewer | | | |
