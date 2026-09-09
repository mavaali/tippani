# S0 Outcome: CFG-LOCAL-SQLITE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-LOCAL-SQLITE
**Adapter:** local-sqlite
**Authoritative backing path:** local
**Dataset scale:** small
**Recommendation:** Proceed to architecture-mapping evaluation
**Applicable absolute gates:** 38
**Eligibility:** Yes

## Coverage

Executed 42 of 58 catalog scenarios. 42 apply to this configuration; 0 applicable absolute gates were not executed.

| Outcome class | Count | Meaning |
|---|---:|---|
| Pass | 41 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 0 | Applicable, but a prerequisite is unavailable |
| Incomplete | 0 | Applicable implementation or evidence is incomplete |
| N/A | 1 | Applicable family, contract-level exception approved by review |
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
| Temporary store root | tippani-s0-s0-local-sqlite-windows-VnKzE6 |
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
| Ownership marker | `tippani-s0:s0-local-sqlite-windows` |
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
| `S0-ATM-001` | absolute | Pass | 46.513 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 30.910 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 29.454 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 255.020 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 352.915 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 31.133 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 30.269 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 338.488 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 26.361 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 22.954 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 419.493 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 265.053 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 246.604 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 339.974 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 221.052 | commits=5; strayTempFiles=0; durableGeneration=5 | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 34.682 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 50.306 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 25.130 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 28.716 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 30.897 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 57.068 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 35.497 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 34.506 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 29.208 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 28.262 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 29.698 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 29.332 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 32.819 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 62.445 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 250.080 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | N/A | 0.345 | SQLite owns locking internally and recovers a killed writer through its own journal on open, so the external stale-lock-file recovery scenario does not apply to its contract (reviewer-approved). | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 30.574 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.735 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.337 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.923 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.619 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.605 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.897 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 630.952 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 492.311 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 2330.798 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.528 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=2; test=2; migration=2; deployment=1; maintenance=2; diagnostics=2; recovery=2; rationale={"dependencies":"Built-in node:sqlite API","implementation":"One built-in node:sqlite database with transactional rows and WAL","test":"Transaction, process-kill, corruption, migration, and backup fixtures","migration":"Schema migration inside database transactions","deployment":"No service, credential, or native package","maintenance":"One built-in database API","diagnostics":"Database health, schema, and workspace diagnostics","recovery":"SQLite transaction journal and WAL recovery"}; total=14; mean=1.75 | [JSON](raw-results.json) |

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
| `S0-CON-005` | contentionCompletionMs | 337.949 | ms |
| `S0-PER-001` | initializedMinMs_small | 14.904 | ms |
| `S0-PER-001` | initializedP50Ms_small | 16.891 | ms |
| `S0-PER-001` | initializedP95Ms_small | 18.273 | ms |
| `S0-PER-001` | initializedMaxMs_small | 18.273 | ms |
| `S0-PER-001` | initializedMeanMs_small | 16.718 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 1.175 | ms |
| `S0-PER-001` | createMinMs_small | 0.877 | ms |
| `S0-PER-001` | createP50Ms_small | 1.261 | ms |
| `S0-PER-001` | createP95Ms_small | 1.698 | ms |
| `S0-PER-001` | createMaxMs_small | 1.698 | ms |
| `S0-PER-001` | createMeanMs_small | 1.225 | ms |
| `S0-PER-001` | createStdDevMs_small | 0.312 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.094 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.119 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.227 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.227 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.132 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.049 | ms |
| `S0-PER-001` | initializedMinMs_medium | 16.922 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 17.661 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 19.493 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 19.493 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 17.828 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 0.918 | ms |
| `S0-PER-001` | createMinMs_medium | 1.896 | ms |
| `S0-PER-001` | createP50Ms_medium | 1.986 | ms |
| `S0-PER-001` | createP95Ms_medium | 2.825 | ms |
| `S0-PER-001` | createMaxMs_medium | 2.825 | ms |
| `S0-PER-001` | createMeanMs_medium | 2.123 | ms |
| `S0-PER-001` | createStdDevMs_medium | 0.354 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.099 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.140 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.166 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.166 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.137 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.022 | ms |
| `S0-PER-001` | initializedMinMs_stress | 14.368 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 15.638 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 19.886 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 19.886 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 16.576 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 1.935 | ms |
| `S0-PER-001` | createMinMs_stress | 11.142 | ms |
| `S0-PER-001` | createP50Ms_stress | 18.759 | ms |
| `S0-PER-001` | createP95Ms_stress | 20.429 | ms |
| `S0-PER-001` | createMaxMs_stress | 20.429 | ms |
| `S0-PER-001` | createMeanMs_stress | 17.306 | ms |
| `S0-PER-001` | createStdDevMs_stress | 3.453 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.171 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.191 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.222 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.222 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.196 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.018 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 0.065 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.099 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.210 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 0.272 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 0.113 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.047 | ms |
| `S0-PER-002` | mutationMinMs_small | 0.729 | ms |
| `S0-PER-002` | mutationP50Ms_small | 1.103 | ms |
| `S0-PER-002` | mutationP95Ms_small | 2.017 | ms |
| `S0-PER-002` | mutationMaxMs_small | 2.389 | ms |
| `S0-PER-002` | mutationMeanMs_small | 1.216 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 0.375 | ms |
| `S0-PER-002` | conflictMinMs_small | 0.134 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.203 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.433 | ms |
| `S0-PER-002` | conflictMaxMs_small | 0.463 | ms |
| `S0-PER-002` | conflictMeanMs_small | 0.233 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 0.096 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 0.180 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.243 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.488 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 0.872 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 0.307 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.158 | ms |
| `S0-PER-002` | mutationMinMs_medium | 1.728 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 2.450 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 3.335 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 3.393 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 2.450 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 0.488 | ms |
| `S0-PER-002` | conflictMinMs_medium | 0.287 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.411 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.743 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 0.927 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 0.448 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 0.164 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 2.913 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 3.425 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 6.192 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 6.192 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 4.100 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 1.070 | ms |
| `S0-PER-002` | mutationMinMs_stress | 16.233 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 19.266 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 31.233 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 31.233 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 21.250 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 4.584 | ms |
| `S0-PER-002` | conflictMinMs_stress | 3.241 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 3.569 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 5.828 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 5.828 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 4.214 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 0.976 | ms |
| `S0-PER-003` | backupMinMs_small | 0.216 | ms |
| `S0-PER-003` | backupP50Ms_small | 0.298 | ms |
| `S0-PER-003` | backupP95Ms_small | 0.333 | ms |
| `S0-PER-003` | backupMaxMs_small | 0.333 | ms |
| `S0-PER-003` | backupMeanMs_small | 0.289 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.041 | ms |
| `S0-PER-003` | restoreMinMs_small | 1.451 | ms |
| `S0-PER-003` | restoreP50Ms_small | 1.587 | ms |
| `S0-PER-003` | restoreP95Ms_small | 1.771 | ms |
| `S0-PER-003` | restoreMaxMs_small | 1.771 | ms |
| `S0-PER-003` | restoreMeanMs_small | 1.587 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 0.107 | ms |
| `S0-PER-003` | storeMinBytes_small | 411816.000 | bytes |
| `S0-PER-003` | storeP50Bytes_small | 411816.000 | bytes |
| `S0-PER-003` | storeP95Bytes_small | 411816.000 | bytes |
| `S0-PER-003` | storeMaxBytes_small | 411816.000 | bytes |
| `S0-PER-003` | storeMeanBytes_small | 411816.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_small | 3864.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_small | 3864.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_small | 3864.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_small | 3864.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_small | 3864.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_small | 106.578 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_small | 106.578 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_small | 106.578 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_small | 106.578 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_small | 106.578 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_small | 0.000 | ratio |
| `S0-PER-003` | backupMinMs_medium | 0.306 | ms |
| `S0-PER-003` | backupP50Ms_medium | 0.483 | ms |
| `S0-PER-003` | backupP95Ms_medium | 0.537 | ms |
| `S0-PER-003` | backupMaxMs_medium | 0.537 | ms |
| `S0-PER-003` | backupMeanMs_medium | 0.436 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.090 | ms |
| `S0-PER-003` | restoreMinMs_medium | 1.666 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 1.880 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 2.181 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 2.181 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 1.911 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 0.170 | ms |
| `S0-PER-003` | storeMinBytes_medium | 584856.000 | bytes |
| `S0-PER-003` | storeP50Bytes_medium | 584856.000 | bytes |
| `S0-PER-003` | storeP95Bytes_medium | 584856.000 | bytes |
| `S0-PER-003` | storeMaxBytes_medium | 584856.000 | bytes |
| `S0-PER-003` | storeMeanBytes_medium | 584856.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_medium | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_medium | 25463.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_medium | 25463.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_medium | 25463.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_medium | 25463.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_medium | 25463.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_medium | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_medium | 22.969 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_medium | 22.969 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_medium | 22.969 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_medium | 22.969 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_medium | 22.969 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_medium | 0.000 | ratio |
| `S0-PER-003` | backupMinMs_stress | 2.892 | ms |
| `S0-PER-003` | backupP50Ms_stress | 3.449 | ms |
| `S0-PER-003` | backupP95Ms_stress | 4.265 | ms |
| `S0-PER-003` | backupMaxMs_stress | 4.265 | ms |
| `S0-PER-003` | backupMeanMs_stress | 3.584 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 0.501 | ms |
| `S0-PER-003` | restoreMinMs_stress | 7.434 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 9.479 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 11.129 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 11.129 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 9.329 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 1.608 | ms |
| `S0-PER-003` | storeMinBytes_stress | 2599536.000 | bytes |
| `S0-PER-003` | storeP50Bytes_stress | 2599536.000 | bytes |
| `S0-PER-003` | storeP95Bytes_stress | 2599536.000 | bytes |
| `S0-PER-003` | storeMaxBytes_stress | 2599536.000 | bytes |
| `S0-PER-003` | storeMeanBytes_stress | 2599536.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_stress | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_stress | 479766.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_stress | 479766.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_stress | 479766.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_stress | 479766.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_stress | 479766.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_stress | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_stress | 5.418 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_stress | 5.418 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_stress | 5.418 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_stress | 5.418 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_stress | 5.418 | ratio |
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
