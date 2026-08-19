# S0 Outcome: CFG-LOCAL-CAS

**Report date:** 2026-08-16
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
| `S0-ATM-001` | absolute | Pass | 18.663 | generation=1; updatedPartitions=4 |
| `S0-ATM-002` | absolute | Pass | 15.054 | aliasResolved=true; generation=1 |
| `S0-ATM-003` | absolute | Pass | 10.953 | previousGenerationPreserved=true; danglingAlias=false |
| `S0-CON-001` | absolute | Pass | 117.436 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 |
| `S0-CON-002` | absolute | Pass | 168.513 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 |
| `S0-CON-003` | absolute | Pass | 23.776 | independentWriters=2; committed=2 |
| `S0-CON-004` | absolute | Pass | 18.045 | frozenRevision=1; preservedRevision=2 |
| `S0-CON-005` | absolute | Pass | 135.000 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true |
| `S0-JRN-001` | absolute | Pass | 9.663 | journalStatus=planned; tupleCount=1 |
| `S0-JRN-002` | absolute | Pass | 8.488 | rejectedBeforeCommit=true |
| `S0-CRS-001` | absolute | Pass | 196.046 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true |
| `S0-CRS-002` | absolute | Pass | 98.969 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill |
| `S0-CRS-003` | absolute | Pass | 87.911 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill |
| `S0-COL-001` | absolute | Pass | 148.450 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 |
| `S0-BCK-001` | absolute | Pass | 234.815 | commits=5; strayTempFiles=0; durableGeneration=5; tornReplaceKilled=true; previousGenerationIntact=true |
| `S0-COR-001` | absolute | Pass | 6.309 | typedCorruptionFailure=true |
| `S0-COR-002` | absolute | Pass | 2.900 | partialRestoreVisible=false |
| `S0-COR-003` | absolute | Pass | 1.405 | unsupportedVersionFailedClosed=true |
| `S0-COR-004` | absolute | Pass | 4.911 | permissionErrorFailedClosed=true; treatedAsAbsent=false |
| `S0-HYD-001` | absolute | Pass | 11.656 | enumeratedWorkspaces=3 |
| `S0-HYD-002` | absolute | Pass | 17.542 | exactRehydration=true; generation=1 |
| `S0-HYD-003` | absolute | Pass | 28.901 | surfacedBeforeMutation=true; reconciledThenAccepted=true |
| `S0-MIG-001` | absolute | Pass | 12.721 | migrated=1; idempotentSecondRun=true; generationPreserved=2 |
| `S0-MIG-002` | absolute | Pass | 12.232 | rolledBackOnInterrupt=true; resumedToComplete=true |
| `S0-MIG-003` | absolute | Pass | 4.766 | failedClosedOnUnsupported=true; sourcePreserved=true |
| `S0-IMP-001` | absolute | Pass | 4.395 | receiptIssued=true; generation=0 |
| `S0-IMP-002` | absolute | Pass | 4.267 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true |
| `S0-BKP-001` | absolute | Pass | 4.153 | workspaceCount=1; knownGeneration=0 |
| `S0-BKP-002` | absolute | Pass | 12.844 | exactRestore=true; corruptBackupRejected=true |
| `S0-REC-001` | absolute | Pass | 97.195 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true |
| `S0-REC-002` | absolute | Pass | 101.487 | orphanedLockObserved=true; recoveredGeneration=1 |
| `S0-REC-005` | absolute | Pass | 12.886 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false |
| `S0-SEC-001` | absolute | Pass | 0.298 | providerPreflightRejected=true; errorCount=8 |
| `S0-SEC-002` | absolute | Pass | 0.178 | corporateFallbackImpossible=true |
| `S0-SEC-003` | absolute | Pass | 0.305 | syntheticFixtureAccepted=true; actualDataRejected=true |
| `S0-SEC-004` | absolute | Pass | 0.262 | configSecretRejected=true; workspaceHasNoSecrets=true |
| `S0-SEC-005` | absolute | Pass | 0.217 | ownedAuthorized=true; foreignRefused=true |
| `S0-SEC-006` | absolute | Pass | 0.807 | nonPositiveBudgetsRejected=true |
| `S0-PER-001` | relative | Pass | 31.138 | scales=small,medium,stress |
| `S0-PER-002` | relative | Pass | 1150.880 | scales=small,medium,stress |
| `S0-PER-003` | relative | Pass | 529.620 | scales=small,medium,stress; storeBytes_small=3827; payloadBytes_small=3807; writeAmplification_small=1.01; storeBytes_medium=25064; payloadBytes_medium=25044; writeAmplification_medium=1; storeBytes_stress=471767; payloadBytes_stress=471747; writeAmplification_stress=1 |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | contentionCompletionMs | 134.728 | ms |
| `S0-PER-001` | initializedMs_small | 1.453 | ms |
| `S0-PER-001` | createMs_small | 4.291 | ms |
| `S0-PER-001` | enumerateMs_small | 0.126 | ms |
| `S0-PER-001` | initializedMs_medium | 1.830 | ms |
| `S0-PER-001` | createMs_medium | 2.235 | ms |
| `S0-PER-001` | enumerateMs_medium | 0.089 | ms |
| `S0-PER-001` | initializedMs_stress | 1.441 | ms |
| `S0-PER-001` | createMs_stress | 10.952 | ms |
| `S0-PER-001` | enumerateMs_stress | 0.137 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 1.993 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 3.421 | ms |
| `S0-PER-002` | mutationP50Ms_small | 6.405 | ms |
| `S0-PER-002` | mutationP95Ms_small | 8.198 | ms |
| `S0-PER-002` | conflictP50Ms_small | 4.229 | ms |
| `S0-PER-002` | conflictP95Ms_small | 6.118 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 2.191 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 2.865 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 6.850 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 9.353 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 4.344 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 6.164 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 10.338 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 12.328 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 17.266 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 24.739 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 8.621 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 12.860 | ms |
| `S0-PER-003` | backupMs_small | 2.127 | ms |
| `S0-PER-003` | restoreMs_small | 3.960 | ms |
| `S0-PER-003` | backupMs_medium | 2.002 | ms |
| `S0-PER-003` | restoreMs_medium | 5.697 | ms |
| `S0-PER-003` | backupMs_stress | 4.897 | ms |
| `S0-PER-003` | restoreMs_stress | 13.952 | ms |

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
