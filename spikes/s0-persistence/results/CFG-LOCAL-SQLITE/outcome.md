# S0 Outcome: CFG-LOCAL-SQLITE

**Report date:** 2026-08-16
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
| `S0-ATM-001` | absolute | Pass | 19.908 | generation=1; updatedPartitions=4 |
| `S0-ATM-002` | absolute | Pass | 14.413 | aliasResolved=true; generation=1 |
| `S0-ATM-003` | absolute | Pass | 11.190 | previousGenerationPreserved=true; danglingAlias=false |
| `S0-CON-001` | absolute | Pass | 117.754 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 |
| `S0-CON-002` | absolute | Pass | 176.494 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 |
| `S0-CON-003` | absolute | Pass | 19.262 | independentWriters=2; committed=2 |
| `S0-CON-004` | absolute | Pass | 17.001 | frozenRevision=1; preservedRevision=2 |
| `S0-CON-005` | absolute | Pass | 159.677 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true |
| `S0-JRN-001` | absolute | Pass | 16.595 | journalStatus=planned; tupleCount=1 |
| `S0-JRN-002` | absolute | Pass | 16.761 | rejectedBeforeCommit=true |
| `S0-CRS-001` | absolute | Pass | 213.877 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true |
| `S0-CRS-002` | absolute | Pass | 107.354 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill |
| `S0-CRS-003` | absolute | Pass | 99.068 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill |
| `S0-COL-001` | absolute | Pass | 161.164 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 |
| `S0-BCK-001` | absolute | Pass | 114.964 | commits=5; strayTempFiles=0; durableGeneration=5 |
| `S0-COR-001` | absolute | Pass | 13.913 | typedCorruptionFailure=true |
| `S0-COR-002` | absolute | Pass | 23.352 | partialRestoreVisible=false |
| `S0-COR-003` | absolute | Pass | 11.318 | unsupportedVersionFailedClosed=true |
| `S0-COR-004` | absolute | Pass | 11.892 | permissionErrorFailedClosed=true; treatedAsAbsent=false |
| `S0-HYD-001` | absolute | Pass | 17.490 | enumeratedWorkspaces=3 |
| `S0-HYD-002` | absolute | Pass | 24.056 | exactRehydration=true; generation=1 |
| `S0-HYD-003` | absolute | Pass | 17.957 | surfacedBeforeMutation=true; reconciledThenAccepted=true |
| `S0-MIG-001` | absolute | Pass | 15.547 | migrated=1; idempotentSecondRun=true; generationPreserved=2 |
| `S0-MIG-002` | absolute | Pass | 16.790 | rolledBackOnInterrupt=true; resumedToComplete=true |
| `S0-MIG-003` | absolute | Pass | 16.235 | failedClosedOnUnsupported=true; sourcePreserved=true |
| `S0-IMP-001` | absolute | Pass | 14.749 | receiptIssued=true; generation=0 |
| `S0-IMP-002` | absolute | Pass | 14.908 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true |
| `S0-BKP-001` | absolute | Pass | 14.449 | workspaceCount=1; knownGeneration=0 |
| `S0-BKP-002` | absolute | Pass | 31.053 | exactRestore=true; corruptBackupRejected=true |
| `S0-REC-001` | absolute | Pass | 112.656 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true |
| `S0-REC-002` | absolute | Incomplete | 0.019 | No external lock file: SQLite owns locking internally and recovers a killed writer through its own journal on open. |
| `S0-REC-005` | absolute | Pass | 14.626 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false |
| `S0-SEC-001` | absolute | Pass | 0.081 | providerPreflightRejected=true; errorCount=8 |
| `S0-SEC-002` | absolute | Pass | 0.145 | corporateFallbackImpossible=true |
| `S0-SEC-003` | absolute | Pass | 0.193 | syntheticFixtureAccepted=true; actualDataRejected=true |
| `S0-SEC-004` | absolute | Pass | 0.149 | configSecretRejected=true; workspaceHasNoSecrets=true |
| `S0-SEC-005` | absolute | Pass | 0.068 | ownedAuthorized=true; foreignRefused=true |
| `S0-SEC-006` | absolute | Pass | 0.101 | nonPositiveBudgetsRejected=true |
| `S0-PER-001` | relative | Pass | 51.578 | scales=small,medium,stress |
| `S0-PER-002` | relative | Pass | 236.980 | scales=small,medium,stress |
| `S0-PER-003` | relative | Pass | 186.943 | scales=small,medium,stress; storeBytes_small=411816; payloadBytes_small=3864; writeAmplification_small=106.58; storeBytes_medium=584856; payloadBytes_medium=25463; writeAmplification_medium=22.97; storeBytes_stress=2599536; payloadBytes_stress=479766; writeAmplification_stress=5.42 |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | contentionCompletionMs | 159.635 | ms |
| `S0-PER-001` | initializedMs_small | 8.988 | ms |
| `S0-PER-001` | createMs_small | 0.870 | ms |
| `S0-PER-001` | enumerateMs_small | 0.096 | ms |
| `S0-PER-001` | initializedMs_medium | 7.638 | ms |
| `S0-PER-001` | createMs_medium | 1.084 | ms |
| `S0-PER-001` | enumerateMs_medium | 0.043 | ms |
| `S0-PER-001` | initializedMs_stress | 8.417 | ms |
| `S0-PER-001` | createMs_stress | 10.221 | ms |
| `S0-PER-001` | enumerateMs_stress | 0.107 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.069 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.128 | ms |
| `S0-PER-002` | mutationP50Ms_small | 0.848 | ms |
| `S0-PER-002` | mutationP95Ms_small | 1.307 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.139 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.226 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.123 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.230 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 1.133 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 1.448 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.190 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.297 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 1.296 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 2.076 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 8.532 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 12.908 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 1.513 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 4.024 | ms |
| `S0-PER-003` | backupMs_small | 0.088 | ms |
| `S0-PER-003` | restoreMs_small | 0.628 | ms |
| `S0-PER-003` | backupMs_medium | 0.152 | ms |
| `S0-PER-003` | restoreMs_medium | 0.604 | ms |
| `S0-PER-003` | backupMs_stress | 1.336 | ms |
| `S0-PER-003` | restoreMs_stress | 4.176 | ms |

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
