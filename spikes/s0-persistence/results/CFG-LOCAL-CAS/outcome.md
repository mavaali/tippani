# S0 Outcome: CFG-LOCAL-CAS

**Report date:** 2026-08-19
**Harness revision:** s0-harness-v2
**Configuration ID:** CFG-LOCAL-CAS
**Adapter:** local-cas
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
| Ownership marker | `tippani-s0:s0-local-cas-windows` |
| Operation budget | 100 |
| Duration budget | 300000 ms |

## Scenario results

| Scenario ID | Type | Status | Duration (ms) | Evidence |
|---|---|---|---:|---|
| `S0-ATM-001` | absolute | Pass | 18.269 | generation=1; updatedPartitions=4 |
| `S0-ATM-002` | absolute | Pass | 18.818 | aliasResolved=true; generation=1 |
| `S0-ATM-003` | absolute | Pass | 13.204 | previousGenerationPreserved=true; danglingAlias=false |
| `S0-CON-001` | absolute | Pass | 146.182 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 |
| `S0-CON-002` | absolute | Pass | 186.372 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 |
| `S0-CON-003` | absolute | Pass | 30.030 | independentWriters=2; committed=2 |
| `S0-CON-004` | absolute | Pass | 24.333 | frozenRevision=1; preservedRevision=2 |
| `S0-CON-005` | absolute | Pass | 180.028 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true |
| `S0-JRN-001` | absolute | Pass | 11.019 | journalStatus=planned; tupleCount=1 |
| `S0-JRN-002` | absolute | Pass | 11.866 | rejectedBeforeCommit=true |
| `S0-CRS-001` | absolute | Pass | 224.923 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true |
| `S0-CRS-002` | absolute | Pass | 160.756 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill |
| `S0-CRS-003` | absolute | Pass | 98.297 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill |
| `S0-COL-001` | absolute | Pass | 167.970 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 |
| `S0-BCK-001` | absolute | Pass | 284.162 | commits=5; strayTempFiles=0; durableGeneration=5; tornReplaceKilled=true; previousGenerationIntact=true |
| `S0-COR-001` | absolute | Pass | 5.993 | typedCorruptionFailure=true |
| `S0-COR-002` | absolute | Pass | 2.987 | partialRestoreVisible=false |
| `S0-COR-003` | absolute | Pass | 1.183 | unsupportedVersionFailedClosed=true |
| `S0-COR-004` | absolute | Pass | 5.546 | permissionErrorFailedClosed=true; treatedAsAbsent=false |
| `S0-HYD-001` | absolute | Pass | 14.568 | enumeratedWorkspaces=3 |
| `S0-HYD-002` | absolute | Pass | 22.248 | exactRehydration=true; generation=1 |
| `S0-HYD-003` | absolute | Pass | 32.897 | surfacedBeforeMutation=true; reconciledThenAccepted=true |
| `S0-MIG-001` | absolute | Pass | 12.957 | migrated=1; idempotentSecondRun=true; generationPreserved=2 |
| `S0-MIG-002` | absolute | Pass | 11.759 | rolledBackOnInterrupt=true; resumedToComplete=true |
| `S0-MIG-003` | absolute | Pass | 4.531 | failedClosedOnUnsupported=true; sourcePreserved=true |
| `S0-IMP-001` | absolute | Pass | 4.599 | receiptIssued=true; generation=0 |
| `S0-IMP-002` | absolute | Pass | 3.739 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true |
| `S0-BKP-001` | absolute | Pass | 4.247 | workspaceCount=1; knownGeneration=0 |
| `S0-BKP-002` | absolute | Pass | 11.884 | exactRestore=true; corruptBackupRejected=true |
| `S0-REC-001` | absolute | Pass | 117.564 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true |
| `S0-REC-002` | absolute | Pass | 123.420 | orphanedLockObserved=true; recoveredGeneration=1 |
| `S0-REC-005` | absolute | Pass | 16.064 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false |
| `S0-SEC-001` | absolute | Pass | 0.481 | providerPreflightRejected=true; errorCount=8 |
| `S0-SEC-002` | absolute | Pass | 0.277 | corporateFallbackImpossible=true |
| `S0-SEC-003` | absolute | Pass | 0.443 | syntheticFixtureAccepted=true; actualDataRejected=true |
| `S0-SEC-004` | absolute | Pass | 0.369 | configSecretRejected=true; workspaceHasNoSecrets=true |
| `S0-SEC-005` | absolute | Pass | 0.282 | ownedAuthorized=true; foreignRefused=true |
| `S0-SEC-006` | absolute | Pass | 0.324 | nonPositiveBudgetsRejected=true |
| `S0-PER-001` | relative | Pass | 29.332 | scales=small,medium,stress |
| `S0-PER-002` | relative | Pass | 1417.009 | scales=small,medium,stress |
| `S0-PER-003` | relative | Pass | 519.551 | scales=small,medium,stress; storeBytes_small=3827; payloadBytes_small=3807; writeAmplification_small=1.01; storeBytes_medium=25064; payloadBytes_medium=25044; writeAmplification_medium=1; storeBytes_stress=471767; payloadBytes_stress=471747; writeAmplification_stress=1 |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | contentionCompletionMs | 179.748 | ms |
| `S0-PER-001` | initializedMs_small | 1.269 | ms |
| `S0-PER-001` | createMs_small | 2.289 | ms |
| `S0-PER-001` | enumerateMs_small | 0.281 | ms |
| `S0-PER-001` | initializedMs_medium | 3.114 | ms |
| `S0-PER-001` | createMs_medium | 2.906 | ms |
| `S0-PER-001` | enumerateMs_medium | 0.119 | ms |
| `S0-PER-001` | initializedMs_stress | 1.457 | ms |
| `S0-PER-001` | createMs_stress | 11.773 | ms |
| `S0-PER-001` | enumerateMs_stress | 0.153 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 2.434 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 3.278 | ms |
| `S0-PER-002` | mutationP50Ms_small | 6.555 | ms |
| `S0-PER-002` | mutationP95Ms_small | 9.069 | ms |
| `S0-PER-002` | conflictP50Ms_small | 4.316 | ms |
| `S0-PER-002` | conflictP95Ms_small | 6.547 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 2.734 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 4.804 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 7.086 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 11.721 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 4.969 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 8.576 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 13.997 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 20.004 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 28.669 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 31.770 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 13.460 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 16.739 | ms |
| `S0-PER-003` | backupMs_small | 2.425 | ms |
| `S0-PER-003` | restoreMs_small | 3.846 | ms |
| `S0-PER-003` | backupMs_medium | 1.918 | ms |
| `S0-PER-003` | restoreMs_medium | 4.071 | ms |
| `S0-PER-003` | backupMs_stress | 6.167 | ms |
| `S0-PER-003` | restoreMs_stress | 18.900 | ms |

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
