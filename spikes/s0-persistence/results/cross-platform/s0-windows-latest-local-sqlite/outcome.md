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
| OS | win32 10.0.26100 |
| Architecture | x64 |
| CPU | AMD EPYC 9V74 80-Core Processor                 |
| Logical CPUs | 2 |
| Total memory | 8584425472 bytes |
| Runtime | Node 24.19.0 |
| Provider/API version | N/A |
| Configured platform/filesystem | Windows/NTFS |
| Detected filesystem | NTFS |
| Temporary store root | tippani-s0-s0-local-sqlite-windows-latest-33450465982-BscfcN |
| Network characteristics | Not recorded |
| Provider region | Not recorded |
| Storage characteristics | GitHub-hosted runner workspace on NTFS |
| Sync-client state | Not applicable |
| Repository protections | Not recorded |
| Dependency versions | node=24.19.0; sqlite=3.53.3 |
| Workload mix | scenario-defined deterministic small/medium/stress fixtures |
| Known limitations | Ephemeral GitHub-hosted runner |
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
| Ownership marker | `tippani-s0:s0-local-sqlite-windows-latest-33450465982` |
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
| `S0-ATM-001` | absolute | Pass | 68.553 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 57.015 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 50.413 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 272.218 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 282.811 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 96.519 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 55.646 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 255.584 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 63.694 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 51.451 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 236.816 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 127.620 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 151.939 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 232.443 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 142.517 | commits=5; strayTempFiles=0; durableGeneration=5 | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 49.086 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 86.628 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 48.370 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 45.548 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 52.315 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 112.577 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 59.936 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 59.545 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 50.720 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 53.751 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 52.270 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 52.159 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 62.345 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 116.538 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 146.735 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | N/A | 0.193 | SQLite owns locking internally and recovers a killed writer through its own journal on open, so the external stale-lock-file recovery scenario does not apply to its contract (reviewer-approved). | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 52.286 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.494 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.186 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.416 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.403 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.381 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.453 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 1191.401 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 636.819 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 4054.344 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.298 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=2; test=2; migration=2; deployment=1; maintenance=2; diagnostics=2; recovery=2; rationale={"dependencies":"Built-in node:sqlite API","implementation":"One built-in node:sqlite database with transactional rows and WAL","test":"Transaction, process-kill, corruption, migration, and backup fixtures","migration":"Schema migration inside database transactions","deployment":"No service, credential, or native package","maintenance":"One built-in database API","diagnostics":"Database health, schema, and workspace diagnostics","recovery":"SQLite transaction journal and WAL recovery"}; total=14; mean=1.75 | [JSON](raw-results.json) |

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
| `S0-CON-005` | contentionCompletionMs | 255.385 | ms |
| `S0-PER-001` | initializedMinMs_small | 37.208 | ms |
| `S0-PER-001` | initializedP50Ms_small | 37.549 | ms |
| `S0-PER-001` | initializedP95Ms_small | 59.920 | ms |
| `S0-PER-001` | initializedMaxMs_small | 59.920 | ms |
| `S0-PER-001` | initializedMeanMs_small | 42.209 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 8.879 | ms |
| `S0-PER-001` | createMinMs_small | 3.899 | ms |
| `S0-PER-001` | createP50Ms_small | 4.793 | ms |
| `S0-PER-001` | createP95Ms_small | 7.587 | ms |
| `S0-PER-001` | createMaxMs_small | 7.587 | ms |
| `S0-PER-001` | createMeanMs_small | 5.193 | ms |
| `S0-PER-001` | createStdDevMs_small | 1.256 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.059 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.062 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.120 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.120 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.074 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.023 | ms |
| `S0-PER-001` | initializedMinMs_medium | 35.002 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 36.038 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 38.085 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 38.085 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 36.472 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 1.080 | ms |
| `S0-PER-001` | createMinMs_medium | 4.544 | ms |
| `S0-PER-001` | createP50Ms_medium | 4.683 | ms |
| `S0-PER-001` | createP95Ms_medium | 6.507 | ms |
| `S0-PER-001` | createMaxMs_medium | 6.507 | ms |
| `S0-PER-001` | createMeanMs_medium | 5.130 | ms |
| `S0-PER-001` | createStdDevMs_medium | 0.742 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.054 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.054 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.070 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.070 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.059 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.006 | ms |
| `S0-PER-001` | initializedMinMs_stress | 33.275 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 40.619 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 42.478 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 42.478 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 39.358 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 3.199 | ms |
| `S0-PER-001` | createMinMs_stress | 17.090 | ms |
| `S0-PER-001` | createP50Ms_stress | 17.725 | ms |
| `S0-PER-001` | createP95Ms_stress | 23.832 | ms |
| `S0-PER-001` | createMaxMs_stress | 23.832 | ms |
| `S0-PER-001` | createMeanMs_stress | 18.845 | ms |
| `S0-PER-001` | createStdDevMs_stress | 2.527 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.071 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.076 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.101 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.101 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.082 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.012 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 0.039 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.059 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.102 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 0.139 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 0.066 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.019 | ms |
| `S0-PER-002` | mutationMinMs_small | 2.596 | ms |
| `S0-PER-002` | mutationP50Ms_small | 3.106 | ms |
| `S0-PER-002` | mutationP95Ms_small | 4.533 | ms |
| `S0-PER-002` | mutationMaxMs_small | 7.958 | ms |
| `S0-PER-002` | mutationMeanMs_small | 3.428 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 0.990 | ms |
| `S0-PER-002` | conflictMinMs_small | 0.115 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.121 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.175 | ms |
| `S0-PER-002` | conflictMaxMs_small | 0.272 | ms |
| `S0-PER-002` | conflictMeanMs_small | 0.129 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 0.027 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 0.099 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.121 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.160 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 0.222 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 0.134 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.026 | ms |
| `S0-PER-002` | mutationMinMs_medium | 3.202 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 3.573 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 5.055 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 5.060 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 3.886 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 0.624 | ms |
| `S0-PER-002` | conflictMinMs_medium | 0.178 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.188 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.239 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 0.322 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 0.206 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 0.033 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 1.794 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 1.976 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 2.099 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 2.099 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 1.958 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 0.104 | ms |
| `S0-PER-002` | mutationMinMs_stress | 14.725 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 17.284 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 47.001 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 47.001 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 21.324 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 9.947 | ms |
| `S0-PER-002` | conflictMinMs_stress | 2.070 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 2.121 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 3.859 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 3.859 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 2.395 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 0.564 | ms |
| `S0-PER-003` | backupMinMs_small | 0.109 | ms |
| `S0-PER-003` | backupP50Ms_small | 0.129 | ms |
| `S0-PER-003` | backupP95Ms_small | 0.165 | ms |
| `S0-PER-003` | backupMaxMs_small | 0.165 | ms |
| `S0-PER-003` | backupMeanMs_small | 0.135 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.019 | ms |
| `S0-PER-003` | restoreMinMs_small | 3.495 | ms |
| `S0-PER-003` | restoreP50Ms_small | 3.696 | ms |
| `S0-PER-003` | restoreP95Ms_small | 5.666 | ms |
| `S0-PER-003` | restoreMaxMs_small | 5.666 | ms |
| `S0-PER-003` | restoreMeanMs_small | 4.293 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 0.903 | ms |
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
| `S0-PER-003` | backupMinMs_medium | 0.167 | ms |
| `S0-PER-003` | backupP50Ms_medium | 0.181 | ms |
| `S0-PER-003` | backupP95Ms_medium | 0.252 | ms |
| `S0-PER-003` | backupMaxMs_medium | 0.252 | ms |
| `S0-PER-003` | backupMeanMs_medium | 0.193 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.032 | ms |
| `S0-PER-003` | restoreMinMs_medium | 4.011 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 4.617 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 5.712 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 5.712 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 4.819 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 0.694 | ms |
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
| `S0-PER-003` | backupMinMs_stress | 1.919 | ms |
| `S0-PER-003` | backupP50Ms_stress | 1.931 | ms |
| `S0-PER-003` | backupP95Ms_stress | 2.192 | ms |
| `S0-PER-003` | backupMaxMs_stress | 2.192 | ms |
| `S0-PER-003` | backupMeanMs_stress | 2.003 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 0.106 | ms |
| `S0-PER-003` | restoreMinMs_stress | 10.586 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 14.164 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 16.236 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 16.236 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 13.826 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 2.181 | ms |
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
