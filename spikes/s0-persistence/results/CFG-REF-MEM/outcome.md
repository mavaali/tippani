# S0 Outcome: CFG-REF-MEM

**Report date:** 2026-08-16
**Harness revision:** s0-harness-v2
**Configuration ID:** CFG-REF-MEM
**Adapter:** reference-memory
**Authoritative backing path:** local
**Dataset scale:** small
**Recommendation:** Incomplete

## Coverage

Executed 39 of 58 catalog scenarios (16 absolute gates not executed).

Not executed in this configuration:

- `S0-COL-002` (absolute) — Two users on a shared backing path cannot silently overwrite each other
- `S0-COL-003` (absolute) — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- `S0-COL-004` (absolute) — Remote success with a lost response is reconciled without duplicate generation or false failure
- `S0-COL-005` (absolute) — Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite
- `S0-COL-006` (absolute) — Another collaborator discovers a committed generation through the backing path change mechanism
- `S0-BCK-001` (absolute) — Local flush and atomic replace preserve file and index durability under supported filesystems
- `S0-BCK-002` (absolute) — OneDrive ETag/version preconditions reject stale updates and support version recovery
- `S0-BCK-003` (absolute) — ADO object/ref preconditions reject stale updates and preserve one auditable generation commit
- `S0-BCK-004` (absolute) — GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit
- `S0-BCK-005` (absolute) — Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state
- `S0-BCK-006` (relative) — Synced-folder conflict behavior is measured separately from provider-API CAS
- `S0-MIG-004` (absolute) — Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt
- `S0-BKP-003` (absolute) — Shared-backing history/export recovers a known generation without rewriting newer valid history
- `S0-BKP-004` (absolute) — Restored shared workspace establishes one explicit authoritative head
- `S0-REC-002` (absolute) — Stale lock recovery removes only provably owned stale state
- `S0-REC-003` (absolute) — Provider outage/auth/throttle/lost-response recovery reconciles authoritative state
- `S0-REC-004` (absolute) — Local offline cache reconciles against newer authority without silent overwrite
- `S0-PER-004` (relative) — Provider requests, bytes, throttling, CAS latency, and collaborator discovery are measured comparably
- `S0-PER-005` (relative) — Operational and implementation complexity is recorded using the same rubric

An unexecuted absolute gate is missing evidence, not a pass.

## Preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-reference-selftest` |
| Operation budget | 100 |
| Duration budget | 60000 ms |

## Scenario results

| Scenario ID | Type | Status | Duration (ms) | Evidence |
|---|---|---|---:|---|
| `S0-ATM-001` | absolute | Pass | 3.023 | generation=1; updatedPartitions=4 |
| `S0-ATM-002` | absolute | Pass | 0.397 | aliasResolved=true; generation=1 |
| `S0-ATM-003` | absolute | Pass | 0.920 | previousGenerationPreserved=true; danglingAlias=false |
| `S0-CON-001` | absolute | Pass | 0.599 | writers=2; winners=1; staleConflicts=1 |
| `S0-CON-002` | absolute | Pass | 0.375 | writers=3; winners=1; staleConflicts=2 |
| `S0-CON-003` | absolute | Pass | 0.586 | independentWriters=2; committed=2 |
| `S0-CON-004` | absolute | Pass | 1.031 | frozenRevision=1; preservedRevision=2 |
| `S0-CON-005` | absolute | Pass | 0.311 | writers=2; winners=1; staleConflicts=1 |
| `S0-JRN-001` | absolute | Pass | 0.376 | journalStatus=planned; tupleCount=1 |
| `S0-JRN-002` | absolute | Pass | 0.313 | rejectedBeforeCommit=true |
| `S0-CRS-001` | absolute | Pass | 0.388 | beforeCommitGeneration=0; afterCommitResponseLostGeneration=1 |
| `S0-CRS-002` | absolute | Pass | 0.262 | partialAliasVisible=false; mechanism=in-process |
| `S0-CRS-003` | absolute | Pass | 0.409 | previousGenerationPreserved=true; mechanism=in-process |
| `S0-COL-001` | absolute | Pass | 0.799 | writers=2; winners=1; staleConflicts=1 |
| `S0-COR-001` | absolute | Pass | 0.736 | typedCorruptionFailure=true |
| `S0-COR-002` | absolute | Pass | 0.663 | partialRestoreVisible=false |
| `S0-COR-003` | absolute | Pass | 0.178 | unsupportedVersionFailedClosed=true |
| `S0-COR-004` | absolute | Pass | 0.267 | permissionErrorFailedClosed=true; treatedAsAbsent=false |
| `S0-HYD-001` | absolute | Pass | 0.295 | enumeratedWorkspaces=3 |
| `S0-HYD-002` | absolute | Pass | 0.594 | exactRehydration=true; generation=1 |
| `S0-HYD-003` | absolute | Pass | 0.998 | surfacedBeforeMutation=true; reconciledThenAccepted=true |
| `S0-MIG-001` | absolute | Pass | 0.910 | migrated=1; idempotentSecondRun=true; generationPreserved=2 |
| `S0-MIG-002` | absolute | Pass | 0.366 | rolledBackOnInterrupt=true; resumedToComplete=true |
| `S0-MIG-003` | absolute | Pass | 0.214 | failedClosedOnUnsupported=true; sourcePreserved=true |
| `S0-IMP-001` | absolute | Pass | 0.345 | receiptIssued=true; generation=0 |
| `S0-IMP-002` | absolute | Pass | 0.321 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true |
| `S0-BKP-001` | absolute | Pass | 0.278 | workspaceCount=1; knownGeneration=0 |
| `S0-BKP-002` | absolute | Pass | 0.867 | exactRestore=true; corruptBackupRejected=true |
| `S0-REC-001` | absolute | Incomplete | 0.236 | Requires a durable adapter: an in-memory store cannot demonstrate cross-process or restart behaviour. |
| `S0-REC-005` | absolute | Pass | 0.776 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false |
| `S0-SEC-001` | absolute | Pass | 0.434 | providerPreflightRejected=true; errorCount=8 |
| `S0-SEC-002` | absolute | Pass | 0.251 | corporateFallbackImpossible=true |
| `S0-SEC-003` | absolute | Pass | 0.400 | syntheticFixtureAccepted=true; actualDataRejected=true |
| `S0-SEC-004` | absolute | Pass | 0.357 | configSecretRejected=true; workspaceHasNoSecrets=true |
| `S0-SEC-005` | absolute | Pass | 0.350 | ownedAuthorized=true; foreignRefused=true |
| `S0-SEC-006` | absolute | Pass | 0.300 | nonPositiveBudgetsRejected=true |
| `S0-PER-001` | relative | Pass | 15.675 | scales=small,medium,stress |
| `S0-PER-002` | relative | Pass | 87.447 | scales=small,medium,stress |
| `S0-PER-003` | relative | Pass | 43.328 | scales=small,medium,stress; storeBytes_small=0; payloadBytes_small=3823; writeAmplification_small=0; storeBytes_medium=0; payloadBytes_medium=25250; writeAmplification_medium=0; storeBytes_stress=0; payloadBytes_stress=475753; writeAmplification_stress=0 |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | conflictCompletionMs | 0.251 | ms |
| `S0-PER-001` | initializedMs_small | 0.266 | ms |
| `S0-PER-001` | createMs_small | 0.060 | ms |
| `S0-PER-001` | enumerateMs_small | 0.002 | ms |
| `S0-PER-001` | initializedMs_medium | 0.602 | ms |
| `S0-PER-001` | createMs_medium | 0.227 | ms |
| `S0-PER-001` | enumerateMs_medium | 0.002 | ms |
| `S0-PER-001` | initializedMs_stress | 0.326 | ms |
| `S0-PER-001` | createMs_stress | 7.855 | ms |
| `S0-PER-001` | enumerateMs_stress | 0.006 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.024 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.030 | ms |
| `S0-PER-002` | mutationP50Ms_small | 0.076 | ms |
| `S0-PER-002` | mutationP95Ms_small | 0.101 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.007 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.011 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.073 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.219 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 0.451 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 0.674 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.017 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.036 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 1.223 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 2.291 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 5.083 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 8.011 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 0.047 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 0.066 | ms |
| `S0-PER-003` | backupMs_small | 0.075 | ms |
| `S0-PER-003` | restoreMs_small | 0.072 | ms |
| `S0-PER-003` | backupMs_medium | 0.070 | ms |
| `S0-PER-003` | restoreMs_medium | 0.124 | ms |
| `S0-PER-003` | backupMs_stress | 2.680 | ms |
| `S0-PER-003` | restoreMs_stress | 2.361 | ms |

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
