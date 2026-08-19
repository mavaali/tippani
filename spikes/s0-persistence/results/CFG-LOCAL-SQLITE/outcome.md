# S0 Outcome: CFG-LOCAL-SQLITE

**Report date:** 2026-08-19
**Harness revision:** s0-harness-v2
**Configuration ID:** CFG-LOCAL-SQLITE
**Adapter:** local-sqlite
**Authoritative backing path:** local
**Dataset scale:** small
**Recommendation:** Incomplete

## Coverage

Executed 41 of 58 catalog scenarios (14 absolute gates not executed).

Not executed in this configuration:

- `S0-COL-002` (absolute) — Two users on a shared backing path cannot silently overwrite each other
- `S0-COL-003` (absolute) — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- `S0-COL-004` (absolute) — Remote success with a lost response is reconciled without duplicate generation or false failure
- `S0-COL-005` (absolute) — Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite
- `S0-COL-006` (absolute) — Another collaborator discovers a committed generation through the backing path change mechanism
- `S0-BCK-002` (absolute) — OneDrive ETag/version preconditions reject stale updates and support version recovery
- `S0-BCK-003` (absolute) — ADO object/ref preconditions reject stale updates and preserve one auditable generation commit
- `S0-BCK-004` (absolute) — GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit
- `S0-BCK-005` (absolute) — Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state
- `S0-BCK-006` (relative) — Synced-folder conflict behavior is measured separately from provider-API CAS
- `S0-MIG-004` (absolute) — Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt
- `S0-BKP-003` (absolute) — Shared-backing history/export recovers a known generation without rewriting newer valid history
- `S0-BKP-004` (absolute) — Restored shared workspace establishes one explicit authoritative head
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
| Ownership marker | `tippani-s0:s0-local-sqlite-windows` |
| Operation budget | 100 |
| Duration budget | 300000 ms |

## Scenario results

| Scenario ID | Type | Status | Duration (ms) | Evidence |
|---|---|---|---:|---|
| `S0-ATM-001` | absolute | Pass | 17.699 | generation=1; updatedPartitions=4 |
| `S0-ATM-002` | absolute | Pass | 14.620 | aliasResolved=true; generation=1 |
| `S0-ATM-003` | absolute | Pass | 12.641 | previousGenerationPreserved=true; danglingAlias=false |
| `S0-CON-001` | absolute | Pass | 145.413 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 |
| `S0-CON-002` | absolute | Pass | 200.402 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 |
| `S0-CON-003` | absolute | Pass | 20.545 | independentWriters=2; committed=2 |
| `S0-CON-004` | absolute | Pass | 19.780 | frozenRevision=1; preservedRevision=2 |
| `S0-CON-005` | absolute | Pass | 183.274 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true |
| `S0-JRN-001` | absolute | Pass | 17.437 | journalStatus=planned; tupleCount=1 |
| `S0-JRN-002` | absolute | Pass | 19.856 | rejectedBeforeCommit=true |
| `S0-CRS-001` | absolute | Pass | 258.337 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true |
| `S0-CRS-002` | absolute | Pass | 162.901 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill |
| `S0-CRS-003` | absolute | Pass | 137.253 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill |
| `S0-COL-001` | absolute | Pass | 163.010 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 |
| `S0-BCK-001` | absolute | Pass | 150.766 | commits=5; strayTempFiles=0; durableGeneration=5 |
| `S0-COR-001` | absolute | Pass | 15.829 | typedCorruptionFailure=true |
| `S0-COR-002` | absolute | Pass | 28.123 | partialRestoreVisible=false |
| `S0-COR-003` | absolute | Pass | 12.070 | unsupportedVersionFailedClosed=true |
| `S0-COR-004` | absolute | Pass | 14.068 | permissionErrorFailedClosed=true; treatedAsAbsent=false |
| `S0-HYD-001` | absolute | Pass | 16.205 | enumeratedWorkspaces=3 |
| `S0-HYD-002` | absolute | Pass | 32.435 | exactRehydration=true; generation=1 |
| `S0-HYD-003` | absolute | Pass | 20.525 | surfacedBeforeMutation=true; reconciledThenAccepted=true |
| `S0-MIG-001` | absolute | Pass | 14.301 | migrated=1; idempotentSecondRun=true; generationPreserved=2 |
| `S0-MIG-002` | absolute | Pass | 11.254 | rolledBackOnInterrupt=true; resumedToComplete=true |
| `S0-MIG-003` | absolute | Pass | 10.825 | failedClosedOnUnsupported=true; sourcePreserved=true |
| `S0-IMP-001` | absolute | Pass | 11.951 | receiptIssued=true; generation=0 |
| `S0-IMP-002` | absolute | Pass | 10.263 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true |
| `S0-BKP-001` | absolute | Pass | 10.492 | workspaceCount=1; knownGeneration=0 |
| `S0-BKP-002` | absolute | Pass | 22.960 | exactRestore=true; corruptBackupRejected=true |
| `S0-REC-001` | absolute | Pass | 139.650 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true |
| `S0-REC-002` | absolute | N/A | 0.046 | SQLite owns locking internally and recovers a killed writer through its own journal on open, so the external stale-lock-file recovery scenario does not apply to its contract (reviewer-approved). |
| `S0-REC-005` | absolute | Pass | 17.536 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false |
| `S0-SEC-001` | absolute | Pass | 0.144 | providerPreflightRejected=true; errorCount=8 |
| `S0-SEC-002` | absolute | Pass | 0.394 | corporateFallbackImpossible=true |
| `S0-SEC-003` | absolute | Pass | 0.399 | syntheticFixtureAccepted=true; actualDataRejected=true |
| `S0-SEC-004` | absolute | Pass | 0.374 | configSecretRejected=true; workspaceHasNoSecrets=true |
| `S0-SEC-005` | absolute | Pass | 0.150 | ownedAuthorized=true; foreignRefused=true |
| `S0-SEC-006` | absolute | Pass | 0.198 | nonPositiveBudgetsRejected=true |
| `S0-PER-001` | relative | Pass | 66.370 | scales=small,medium,stress |
| `S0-PER-002` | relative | Pass | 228.726 | scales=small,medium,stress |
| `S0-PER-003` | relative | Pass | 168.151 | scales=small,medium,stress; storeBytes_small=411816; payloadBytes_small=3864; writeAmplification_small=106.58; storeBytes_medium=584856; payloadBytes_medium=25463; writeAmplification_medium=22.97; storeBytes_stress=2599536; payloadBytes_stress=479766; writeAmplification_stress=5.42 |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | contentionCompletionMs | 183.195 | ms |
| `S0-PER-001` | initializedMs_small | 12.965 | ms |
| `S0-PER-001` | createMs_small | 0.883 | ms |
| `S0-PER-001` | enumerateMs_small | 0.082 | ms |
| `S0-PER-001` | initializedMs_medium | 12.540 | ms |
| `S0-PER-001` | createMs_medium | 0.903 | ms |
| `S0-PER-001` | enumerateMs_medium | 0.060 | ms |
| `S0-PER-001` | initializedMs_stress | 14.061 | ms |
| `S0-PER-001` | createMs_stress | 10.261 | ms |
| `S0-PER-001` | enumerateMs_stress | 0.139 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.042 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.116 | ms |
| `S0-PER-002` | mutationP50Ms_small | 0.538 | ms |
| `S0-PER-002` | mutationP95Ms_small | 0.994 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.103 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.225 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.084 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.367 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 0.959 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 1.617 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.159 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.394 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 1.477 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 2.328 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 9.962 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 11.687 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 1.831 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 3.162 | ms |
| `S0-PER-003` | backupMs_small | 0.111 | ms |
| `S0-PER-003` | restoreMs_small | 0.643 | ms |
| `S0-PER-003` | backupMs_medium | 0.173 | ms |
| `S0-PER-003` | restoreMs_medium | 1.136 | ms |
| `S0-PER-003` | backupMs_stress | 1.700 | ms |
| `S0-PER-003` | restoreMs_stress | 4.931 | ms |

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
