# S0 Outcome: CFG-LOCAL-CAS

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-LOCAL-CAS
**Adapter:** local-cas
**Authoritative backing path:** local
**Dataset scale:** small
**Recommendation:** Proceed to architecture-mapping evaluation
**Applicable absolute gates:** 38
**Eligibility:** Yes

## Coverage

Executed 42 of 58 catalog scenarios. 42 apply to this configuration; 0 applicable absolute gates were not executed.

| Outcome class | Count | Meaning |
|---|---:|---|
| Pass | 42 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 0 | Applicable, but a prerequisite is unavailable |
| Incomplete | 0 | Applicable implementation or evidence is incomplete |
| N/A | 0 | Applicable family, contract-level exception approved by review |
| Not applicable | 16 | Assigned to another configuration by design |
| Not executed | 0 | Applicable, but no result exists |

## Configuration and environment

| Dimension | Value |
|---|---|
| OS | win32 10.0.26200 |
| Architecture | x64 |
| CPU | Intel(R) Core(TM) Ultra 7 165H |
| Logical CPUs | 22 |
| Total memory | 33983225856 bytes |
| Runtime | Node 24.14.0 |
| Provider/API version | N/A |
| Configured platform/filesystem | windows-ntfs |
| Temporary store root | tippani-s0-s0-local-cas-windows-5WIRDU |
| Network characteristics | Not recorded |
| Provider region | Not recorded |
| Process topology | Independent OS child processes for concurrency and kill tests |
| Dataset scale | small |
| Applicability profile | local |
| Store namespace | — |
| Authentication setup | Synthetic Local Harness |
| Cleanup manifest | — |
| Cleanup expiry | — |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-local-cas-windows` |
| Operation budget | 100 |
| Duration budget | 300000 ms |
| Object budget | 10000 |
| Storage/transfer budget | 104857600 bytes |
| Declared provider operations | [] |
| Timer | `performance.now()` monotonic elapsed time |
| Performance statistics | Minimum, p50, p95, maximum, mean, sample variability |
| Raw evidence | [raw-results.json](raw-results.json) |
| Redacted preflight | [preflight.json](preflight.json) |

## Scenario results

| Scenario ID | Type | Applicability/result | Duration (ms) | Evidence / reason | Raw |
|---|---|---|---:|---|---|
| `S0-ATM-001` | absolute | Pass | 30.931 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 34.156 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 29.092 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 285.565 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 403.053 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 56.175 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 45.561 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 340.020 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 34.457 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 25.889 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 504.754 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 260.507 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 228.310 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 329.028 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 613.120 | commits=5; strayTempFiles=0; durableGeneration=5; tornReplaceKilled=true; previousGenerationIntact=true | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 18.096 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 5.773 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 2.723 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 12.791 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 37.055 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 46.947 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 68.262 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 35.749 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 29.661 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 13.094 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 10.360 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 9.014 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 12.253 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 27.347 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 250.182 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Pass | 267.170 | orphanedLockObserved=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 33.574 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.371 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.288 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.692 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.560 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.278 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.178 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 389.896 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 2883.804 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 5555.946 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.158 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=3; test=3; migration=2; deployment=1; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Built-in filesystem and crypto APIs","implementation":"Envelope, alias index, lock ownership, fsync, and atomic replace","test":"Filesystem race, process-kill, torn-replace, corruption, and backup fixtures","migration":"Envelope migration with explicit original preservation","deployment":"No service, credential, or external package","maintenance":"Filesystem and platform-specific durability behavior","diagnostics":"Envelope, index, lock, and temp-file diagnostics","recovery":"Stale-lock, temp-file, index rebuild, and replace recovery"}; total=19; mean=2.375 | [JSON](raw-results.json) |

## Correctness summary

| Criterion | Outcome |
|---|---|
| Atomicity and concurrency | Pass |
| Collaboration | Pass |
| Crash and operational recovery | Pass |
| Corruption and rehydration | Pass |
| Migration and import | Pass |
| Backup and restore | Pass |
| Safety and security | Pass |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-CON-005` | contentionCompletionMs | 339.941 | ms |
| `S0-PER-001` | initializedMinMs_small | 2.259 | ms |
| `S0-PER-001` | initializedP50Ms_small | 2.890 | ms |
| `S0-PER-001` | initializedP95Ms_small | 4.176 | ms |
| `S0-PER-001` | initializedMaxMs_small | 4.176 | ms |
| `S0-PER-001` | initializedMeanMs_small | 3.138 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 0.646 | ms |
| `S0-PER-001` | createMinMs_small | 5.749 | ms |
| `S0-PER-001` | createP50Ms_small | 6.230 | ms |
| `S0-PER-001` | createP95Ms_small | 9.892 | ms |
| `S0-PER-001` | createMaxMs_small | 9.892 | ms |
| `S0-PER-001` | createMeanMs_small | 7.159 | ms |
| `S0-PER-001` | createStdDevMs_small | 1.520 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.208 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.388 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.553 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.553 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.366 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.118 | ms |
| `S0-PER-001` | initializedMinMs_medium | 2.071 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 2.869 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 4.461 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 4.461 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 3.261 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 0.914 | ms |
| `S0-PER-001` | createMinMs_medium | 7.379 | ms |
| `S0-PER-001` | createP50Ms_medium | 8.895 | ms |
| `S0-PER-001` | createP95Ms_medium | 9.434 | ms |
| `S0-PER-001` | createMaxMs_medium | 9.434 | ms |
| `S0-PER-001` | createMeanMs_medium | 8.730 | ms |
| `S0-PER-001` | createStdDevMs_medium | 0.713 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.221 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.345 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.391 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.391 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.315 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.063 | ms |
| `S0-PER-001` | initializedMinMs_stress | 2.087 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 2.694 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 3.472 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 3.472 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 2.808 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 0.471 | ms |
| `S0-PER-001` | createMinMs_stress | 13.752 | ms |
| `S0-PER-001` | createP50Ms_stress | 23.956 | ms |
| `S0-PER-001` | createP95Ms_stress | 28.648 | ms |
| `S0-PER-001` | createMaxMs_stress | 28.648 | ms |
| `S0-PER-001` | createMeanMs_stress | 22.680 | ms |
| `S0-PER-001` | createStdDevMs_stress | 5.035 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.298 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.379 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.718 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.718 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.439 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.147 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 3.606 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 4.669 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 5.993 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 6.510 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 4.764 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.639 | ms |
| `S0-PER-002` | mutationMinMs_small | 13.813 | ms |
| `S0-PER-002` | mutationP50Ms_small | 17.134 | ms |
| `S0-PER-002` | mutationP95Ms_small | 22.198 | ms |
| `S0-PER-002` | mutationMaxMs_small | 22.717 | ms |
| `S0-PER-002` | mutationMeanMs_small | 17.579 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 2.342 | ms |
| `S0-PER-002` | conflictMinMs_small | 8.741 | ms |
| `S0-PER-002` | conflictP50Ms_small | 10.692 | ms |
| `S0-PER-002` | conflictP95Ms_small | 13.617 | ms |
| `S0-PER-002` | conflictMaxMs_small | 14.130 | ms |
| `S0-PER-002` | conflictMeanMs_small | 10.950 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 1.467 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 4.741 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 5.560 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 6.611 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 7.286 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 5.600 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.611 | ms |
| `S0-PER-002` | mutationMinMs_medium | 17.471 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 20.077 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 22.917 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 23.170 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 20.352 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 1.605 | ms |
| `S0-PER-002` | conflictMinMs_medium | 10.347 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 12.410 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 15.597 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 17.179 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 12.755 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 1.914 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 16.066 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 17.806 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 24.394 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 24.394 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 19.172 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 2.960 | ms |
| `S0-PER-002` | mutationMinMs_stress | 34.326 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 37.537 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 44.605 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 44.605 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 38.409 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 3.188 | ms |
| `S0-PER-002` | conflictMinMs_stress | 17.187 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 18.420 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 21.129 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 21.129 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 19.090 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 1.358 | ms |
| `S0-PER-003` | backupMinMs_small | 2.180 | ms |
| `S0-PER-003` | backupP50Ms_small | 2.541 | ms |
| `S0-PER-003` | backupP95Ms_small | 3.738 | ms |
| `S0-PER-003` | backupMaxMs_small | 3.738 | ms |
| `S0-PER-003` | backupMeanMs_small | 2.771 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.533 | ms |
| `S0-PER-003` | restoreMinMs_small | 7.928 | ms |
| `S0-PER-003` | restoreP50Ms_small | 8.261 | ms |
| `S0-PER-003` | restoreP95Ms_small | 11.959 | ms |
| `S0-PER-003` | restoreMaxMs_small | 11.959 | ms |
| `S0-PER-003` | restoreMeanMs_small | 9.406 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 1.655 | ms |
| `S0-PER-003` | storeMinBytes_small | 3863.000 | bytes |
| `S0-PER-003` | storeP50Bytes_small | 3863.000 | bytes |
| `S0-PER-003` | storeP95Bytes_small | 3863.000 | bytes |
| `S0-PER-003` | storeMaxBytes_small | 3863.000 | bytes |
| `S0-PER-003` | storeMeanBytes_small | 3863.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_small | 3843.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_small | 3843.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_small | 3843.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_small | 3843.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_small | 3843.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_small | 0.000 | ratio |
| `S0-PER-003` | backupMinMs_medium | 2.298 | ms |
| `S0-PER-003` | backupP50Ms_medium | 3.136 | ms |
| `S0-PER-003` | backupP95Ms_medium | 3.808 | ms |
| `S0-PER-003` | backupMaxMs_medium | 3.808 | ms |
| `S0-PER-003` | backupMeanMs_medium | 3.052 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.581 | ms |
| `S0-PER-003` | restoreMinMs_medium | 7.258 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 9.832 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 11.119 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 11.119 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 9.526 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 1.267 | ms |
| `S0-PER-003` | storeMinBytes_medium | 25480.000 | bytes |
| `S0-PER-003` | storeP50Bytes_medium | 25480.000 | bytes |
| `S0-PER-003` | storeP95Bytes_medium | 25480.000 | bytes |
| `S0-PER-003` | storeMaxBytes_medium | 25480.000 | bytes |
| `S0-PER-003` | storeMeanBytes_medium | 25480.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_medium | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_medium | 25460.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_medium | 25460.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_medium | 25460.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_medium | 25460.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_medium | 25460.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_medium | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_medium | 1.001 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_medium | 1.001 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_medium | 1.001 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_medium | 1.001 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_medium | 1.001 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_medium | 0.000 | ratio |
| `S0-PER-003` | backupMinMs_stress | 9.884 | ms |
| `S0-PER-003` | backupP50Ms_stress | 11.464 | ms |
| `S0-PER-003` | backupP95Ms_stress | 13.269 | ms |
| `S0-PER-003` | backupMaxMs_stress | 13.269 | ms |
| `S0-PER-003` | backupMeanMs_stress | 11.309 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 1.167 | ms |
| `S0-PER-003` | restoreMinMs_stress | 20.818 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 21.639 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 23.532 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 23.532 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 21.874 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 0.901 | ms |
| `S0-PER-003` | storeMinBytes_stress | 479783.000 | bytes |
| `S0-PER-003` | storeP50Bytes_stress | 479783.000 | bytes |
| `S0-PER-003` | storeP95Bytes_stress | 479783.000 | bytes |
| `S0-PER-003` | storeMaxBytes_stress | 479783.000 | bytes |
| `S0-PER-003` | storeMeanBytes_stress | 479783.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_stress | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_stress | 479763.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_stress | 479763.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_stress | 479763.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_stress | 479763.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_stress | 479763.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_stress | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_stress | 1.000 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_stress | 1.000 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_stress | 1.000 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_stress | 1.000 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_stress | 1.000 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_stress | 0.000 | ratio |

## Failures and recovery

No scenario failures.

## Risks and required follow-up

| Gate | State | Owner | Evidence required |
|---|---|---|---|
| — | None | — | — |

## Configuration recommendation

This component may proceed into an architecture mapping. Relative evidence remains non-decisional until an entire mapping is eligible.

## Evidence

- [Raw machine-readable results](raw-results.json)
- [Redacted preflight](preflight.json)

## Sign-off

| Role | Person | Date | Decision / comments |
|---|---|---|---|
| Implementer | | | |
| Independent reviewer | | | |
