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
| OS | darwin 25.5.0 |
| Architecture | arm64 |
| CPU | Apple M1 (Virtual) |
| Logical CPUs | 3 |
| Total memory | 7516192768 bytes |
| Runtime | Node 24.18.0 |
| Provider/API version | N/A |
| Configured platform/filesystem | macOS/APFS |
| Detected filesystem | APFS |
| Temporary store root | tippani-s0-s0-local-sqlite-macos-latest-33450465982-pdpFh8 |
| Network characteristics | Not recorded |
| Provider region | Not recorded |
| Storage characteristics | GitHub-hosted runner workspace on APFS |
| Sync-client state | Not applicable |
| Repository protections | Not recorded |
| Dependency versions | node=24.18.0; sqlite=3.53.1 |
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
| Ownership marker | `tippani-s0:s0-local-sqlite-macos-latest-33450465982` |
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
| `S0-ATM-001` | absolute | Pass | 6.524 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 2.800 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 3.028 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 66.561 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 104.985 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 4.568 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 4.691 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 77.409 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 3.193 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 4.570 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 133.429 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 85.799 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 70.324 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 68.023 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 44.134 | commits=5; strayTempFiles=0; durableGeneration=5 | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 2.420 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 3.683 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 1.591 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 1.884 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 2.587 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 6.881 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 34.796 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 2.489 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 2.274 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 1.857 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 1.974 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 1.786 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 1.821 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 3.946 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 42.169 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | N/A | 0.087 | SQLite owns locking internally and recovers a killed writer through its own journal on open, so the external stale-lock-file recovery scenario does not apply to its contract (reviewer-approved). | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 2.540 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.249 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.084 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.198 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.166 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.141 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.111 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 82.337 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 110.005 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 347.458 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.159 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=2; test=2; migration=2; deployment=1; maintenance=2; diagnostics=2; recovery=2; rationale={"dependencies":"Built-in node:sqlite API","implementation":"One built-in node:sqlite database with transactional rows and WAL","test":"Transaction, process-kill, corruption, migration, and backup fixtures","migration":"Schema migration inside database transactions","deployment":"No service, credential, or native package","maintenance":"One built-in database API","diagnostics":"Database health, schema, and workspace diagnostics","recovery":"SQLite transaction journal and WAL recovery"}; total=14; mean=1.75 | [JSON](raw-results.json) |

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
| `S0-CON-005` | contentionCompletionMs | 77.209 | ms |
| `S0-PER-001` | initializedMinMs_small | 1.037 | ms |
| `S0-PER-001` | initializedP50Ms_small | 1.105 | ms |
| `S0-PER-001` | initializedP95Ms_small | 1.210 | ms |
| `S0-PER-001` | initializedMaxMs_small | 1.210 | ms |
| `S0-PER-001` | initializedMeanMs_small | 1.124 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 0.069 | ms |
| `S0-PER-001` | createMinMs_small | 0.154 | ms |
| `S0-PER-001` | createP50Ms_small | 0.171 | ms |
| `S0-PER-001` | createP95Ms_small | 0.178 | ms |
| `S0-PER-001` | createMaxMs_small | 0.178 | ms |
| `S0-PER-001` | createMeanMs_small | 0.168 | ms |
| `S0-PER-001` | createStdDevMs_small | 0.008 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.016 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.018 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.020 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.020 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.018 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.002 | ms |
| `S0-PER-001` | initializedMinMs_medium | 1.069 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 1.202 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 1.221 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 1.221 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 1.164 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 0.062 | ms |
| `S0-PER-001` | createMinMs_medium | 0.291 | ms |
| `S0-PER-001` | createP50Ms_medium | 0.312 | ms |
| `S0-PER-001` | createP95Ms_medium | 0.461 | ms |
| `S0-PER-001` | createMaxMs_medium | 0.461 | ms |
| `S0-PER-001` | createMeanMs_medium | 0.337 | ms |
| `S0-PER-001` | createStdDevMs_medium | 0.063 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.013 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.013 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.018 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.018 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.015 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.002 | ms |
| `S0-PER-001` | initializedMinMs_stress | 1.095 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 1.170 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 1.639 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 1.639 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 1.261 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 0.194 | ms |
| `S0-PER-001` | createMinMs_stress | 2.562 | ms |
| `S0-PER-001` | createP50Ms_stress | 2.884 | ms |
| `S0-PER-001` | createP95Ms_stress | 3.320 | ms |
| `S0-PER-001` | createMaxMs_stress | 3.320 | ms |
| `S0-PER-001` | createMeanMs_stress | 2.861 | ms |
| `S0-PER-001` | createStdDevMs_stress | 0.281 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.025 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.028 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.031 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.031 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.029 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.002 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 0.023 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.026 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.034 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 0.035 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 0.027 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.003 | ms |
| `S0-PER-002` | mutationMinMs_small | 0.153 | ms |
| `S0-PER-002` | mutationP50Ms_small | 0.200 | ms |
| `S0-PER-002` | mutationP95Ms_small | 0.455 | ms |
| `S0-PER-002` | mutationMaxMs_small | 0.585 | ms |
| `S0-PER-002` | mutationMeanMs_small | 0.236 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 0.099 | ms |
| `S0-PER-002` | conflictMinMs_small | 0.032 | ms |
| `S0-PER-002` | conflictP50Ms_small | 0.040 | ms |
| `S0-PER-002` | conflictP95Ms_small | 0.064 | ms |
| `S0-PER-002` | conflictMaxMs_small | 0.106 | ms |
| `S0-PER-002` | conflictMeanMs_small | 0.043 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 0.014 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 0.063 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.067 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.073 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 0.081 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 0.068 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.004 | ms |
| `S0-PER-002` | mutationMinMs_medium | 0.420 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 0.439 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 0.488 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 0.488 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 0.445 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 0.020 | ms |
| `S0-PER-002` | conflictMinMs_medium | 0.074 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 0.083 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 0.100 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 0.430 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 0.101 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 0.076 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 1.064 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 1.079 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 1.127 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 1.127 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 1.093 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 0.022 | ms |
| `S0-PER-002` | mutationMinMs_stress | 5.061 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 5.192 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 7.909 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 7.909 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 5.738 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 0.909 | ms |
| `S0-PER-002` | conflictMinMs_stress | 1.161 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 1.216 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 1.428 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 1.428 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 1.238 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 0.079 | ms |
| `S0-PER-003` | backupMinMs_small | 0.046 | ms |
| `S0-PER-003` | backupP50Ms_small | 0.050 | ms |
| `S0-PER-003` | backupP95Ms_small | 0.078 | ms |
| `S0-PER-003` | backupMaxMs_small | 0.078 | ms |
| `S0-PER-003` | backupMeanMs_small | 0.054 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.012 | ms |
| `S0-PER-003` | restoreMinMs_small | 0.138 | ms |
| `S0-PER-003` | restoreP50Ms_small | 0.159 | ms |
| `S0-PER-003` | restoreP95Ms_small | 0.207 | ms |
| `S0-PER-003` | restoreMaxMs_small | 0.207 | ms |
| `S0-PER-003` | restoreMeanMs_small | 0.166 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 0.023 | ms |
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
| `S0-PER-003` | backupMinMs_medium | 0.071 | ms |
| `S0-PER-003` | backupP50Ms_medium | 0.075 | ms |
| `S0-PER-003` | backupP95Ms_medium | 0.083 | ms |
| `S0-PER-003` | backupMaxMs_medium | 0.083 | ms |
| `S0-PER-003` | backupMeanMs_medium | 0.076 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.005 | ms |
| `S0-PER-003` | restoreMinMs_medium | 0.219 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 0.226 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 0.275 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 0.275 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 0.235 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 0.020 | ms |
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
| `S0-PER-003` | backupMinMs_stress | 1.239 | ms |
| `S0-PER-003` | backupP50Ms_stress | 1.241 | ms |
| `S0-PER-003` | backupP95Ms_stress | 1.258 | ms |
| `S0-PER-003` | backupMaxMs_stress | 1.258 | ms |
| `S0-PER-003` | backupMeanMs_stress | 1.247 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 0.008 | ms |
| `S0-PER-003` | restoreMinMs_stress | 1.738 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 1.830 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 1.887 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 1.887 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 1.810 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 0.054 | ms |
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
