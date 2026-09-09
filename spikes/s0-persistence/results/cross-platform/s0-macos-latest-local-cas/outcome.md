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
| OS | darwin 25.5.0 |
| Architecture | arm64 |
| CPU | Apple M1 (Virtual) |
| Logical CPUs | 3 |
| Total memory | 7516192768 bytes |
| Runtime | Node 24.18.0 |
| Provider/API version | N/A |
| Configured platform/filesystem | macOS/APFS |
| Detected filesystem | APFS |
| Temporary store root | tippani-s0-s0-local-cas-macos-latest-33450465982-ON9ufH |
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
| Ownership marker | `tippani-s0:s0-local-cas-macos-latest-33450465982` |
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
| `S0-ATM-001` | absolute | Pass | 138.042 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 26.273 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 10.628 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 173.024 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 194.983 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 29.924 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 61.068 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 223.467 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 38.603 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 13.693 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 282.130 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 111.915 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 80.173 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 144.410 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 257.556 | commits=5; strayTempFiles=0; durableGeneration=5; tornReplaceKilled=true; previousGenerationIntact=true | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 8.999 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 2.416 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 1.182 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 4.435 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 8.601 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 9.125 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 20.344 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 6.420 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 6.755 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 3.785 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 4.090 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 3.117 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 2.743 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 5.014 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 100.469 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Pass | 86.114 | orphanedLockObserved=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 15.575 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.436 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.153 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.395 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.457 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.253 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.490 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 322.690 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 1708.527 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 1791.033 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.207 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=3; test=3; migration=2; deployment=1; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Built-in filesystem and crypto APIs","implementation":"Envelope, alias index, lock ownership, fsync, and atomic replace","test":"Filesystem race, process-kill, torn-replace, corruption, and backup fixtures","migration":"Envelope migration with explicit original preservation","deployment":"No service, credential, or external package","maintenance":"Filesystem and platform-specific durability behavior","diagnostics":"Envelope, index, lock, and temp-file diagnostics","recovery":"Stale-lock, temp-file, index rebuild, and replace recovery"}; total=19; mean=2.375 | [JSON](raw-results.json) |

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
| `S0-CON-005` | contentionCompletionMs | 223.227 | ms |
| `S0-PER-001` | initializedMinMs_small | 0.284 | ms |
| `S0-PER-001` | initializedP50Ms_small | 0.315 | ms |
| `S0-PER-001` | initializedP95Ms_small | 0.828 | ms |
| `S0-PER-001` | initializedMaxMs_small | 0.828 | ms |
| `S0-PER-001` | initializedMeanMs_small | 0.437 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 0.204 | ms |
| `S0-PER-001` | createMinMs_small | 2.416 | ms |
| `S0-PER-001` | createP50Ms_small | 6.541 | ms |
| `S0-PER-001` | createP95Ms_small | 12.494 | ms |
| `S0-PER-001` | createMaxMs_small | 12.494 | ms |
| `S0-PER-001` | createMeanMs_small | 6.884 | ms |
| `S0-PER-001` | createStdDevMs_small | 3.234 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.062 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.078 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.236 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.236 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.114 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.065 | ms |
| `S0-PER-001` | initializedMinMs_medium | 0.212 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 0.334 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 0.510 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 0.510 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 0.354 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 0.129 | ms |
| `S0-PER-001` | createMinMs_medium | 2.312 | ms |
| `S0-PER-001` | createP50Ms_medium | 2.601 | ms |
| `S0-PER-001` | createP95Ms_medium | 6.921 | ms |
| `S0-PER-001` | createMaxMs_medium | 6.921 | ms |
| `S0-PER-001` | createMeanMs_medium | 3.600 | ms |
| `S0-PER-001` | createStdDevMs_medium | 1.729 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.047 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.090 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.195 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.195 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.110 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.054 | ms |
| `S0-PER-001` | initializedMinMs_stress | 0.199 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 0.215 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 0.254 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 0.254 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 0.221 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 0.019 | ms |
| `S0-PER-001` | createMinMs_stress | 15.775 | ms |
| `S0-PER-001` | createP50Ms_stress | 26.864 | ms |
| `S0-PER-001` | createP95Ms_stress | 44.132 | ms |
| `S0-PER-001` | createMaxMs_stress | 44.132 | ms |
| `S0-PER-001` | createMeanMs_stress | 27.156 | ms |
| `S0-PER-001` | createStdDevMs_stress | 10.674 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.097 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.151 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.246 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.246 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.163 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.049 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 0.148 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.240 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.709 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 0.847 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 0.328 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.197 | ms |
| `S0-PER-002` | mutationMinMs_small | 3.861 | ms |
| `S0-PER-002` | mutationP50Ms_small | 12.531 | ms |
| `S0-PER-002` | mutationP95Ms_small | 20.961 | ms |
| `S0-PER-002` | mutationMaxMs_small | 29.764 | ms |
| `S0-PER-002` | mutationMeanMs_small | 12.817 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 5.965 | ms |
| `S0-PER-002` | conflictMinMs_small | 2.115 | ms |
| `S0-PER-002` | conflictP50Ms_small | 6.016 | ms |
| `S0-PER-002` | conflictP95Ms_small | 13.076 | ms |
| `S0-PER-002` | conflictMaxMs_small | 17.736 | ms |
| `S0-PER-002` | conflictMeanMs_small | 6.343 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 3.651 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 0.329 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.693 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 2.122 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 2.379 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 0.984 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.633 | ms |
| `S0-PER-002` | mutationMinMs_medium | 4.931 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 12.604 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 26.771 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 44.771 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 14.788 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 9.182 | ms |
| `S0-PER-002` | conflictMinMs_medium | 2.694 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 7.463 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 13.731 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 15.255 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 8.259 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 3.566 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 5.732 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 7.939 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 28.805 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 28.805 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 10.143 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 7.119 | ms |
| `S0-PER-002` | mutationMinMs_stress | 14.897 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 26.448 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 36.119 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 36.119 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 26.545 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 6.326 | ms |
| `S0-PER-002` | conflictMinMs_stress | 5.814 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 8.387 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 12.808 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 12.808 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 9.660 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 2.645 | ms |
| `S0-PER-003` | backupMinMs_small | 0.217 | ms |
| `S0-PER-003` | backupP50Ms_small | 0.402 | ms |
| `S0-PER-003` | backupP95Ms_small | 0.694 | ms |
| `S0-PER-003` | backupMaxMs_small | 0.694 | ms |
| `S0-PER-003` | backupMeanMs_small | 0.401 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.178 | ms |
| `S0-PER-003` | restoreMinMs_small | 1.628 | ms |
| `S0-PER-003` | restoreP50Ms_small | 2.160 | ms |
| `S0-PER-003` | restoreP95Ms_small | 9.857 | ms |
| `S0-PER-003` | restoreMaxMs_small | 9.857 | ms |
| `S0-PER-003` | restoreMeanMs_small | 4.138 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 3.173 | ms |
| `S0-PER-003` | storeMinBytes_small | 3881.000 | bytes |
| `S0-PER-003` | storeP50Bytes_small | 3881.000 | bytes |
| `S0-PER-003` | storeP95Bytes_small | 3881.000 | bytes |
| `S0-PER-003` | storeMaxBytes_small | 3881.000 | bytes |
| `S0-PER-003` | storeMeanBytes_small | 3881.000 | bytes |
| `S0-PER-003` | storeStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | payloadMinBytes_small | 3861.000 | bytes |
| `S0-PER-003` | payloadP50Bytes_small | 3861.000 | bytes |
| `S0-PER-003` | payloadP95Bytes_small | 3861.000 | bytes |
| `S0-PER-003` | payloadMaxBytes_small | 3861.000 | bytes |
| `S0-PER-003` | payloadMeanBytes_small | 3861.000 | bytes |
| `S0-PER-003` | payloadStdDevBytes_small | 0.000 | bytes |
| `S0-PER-003` | writeAmplificationMinRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationP50Ratio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationP95Ratio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationMaxRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationMeanRatio_small | 1.005 | ratio |
| `S0-PER-003` | writeAmplificationStdDevRatio_small | 0.000 | ratio |
| `S0-PER-003` | backupMinMs_medium | 0.380 | ms |
| `S0-PER-003` | backupP50Ms_medium | 0.417 | ms |
| `S0-PER-003` | backupP95Ms_medium | 0.647 | ms |
| `S0-PER-003` | backupMaxMs_medium | 0.647 | ms |
| `S0-PER-003` | backupMeanMs_medium | 0.495 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.114 | ms |
| `S0-PER-003` | restoreMinMs_medium | 1.938 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 2.459 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 2.894 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 2.894 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 2.450 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 0.340 | ms |
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
| `S0-PER-003` | backupMinMs_stress | 2.620 | ms |
| `S0-PER-003` | backupP50Ms_stress | 2.829 | ms |
| `S0-PER-003` | backupP95Ms_stress | 4.049 | ms |
| `S0-PER-003` | backupMaxMs_stress | 4.049 | ms |
| `S0-PER-003` | backupMeanMs_stress | 3.047 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 0.520 | ms |
| `S0-PER-003` | restoreMinMs_stress | 6.295 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 7.570 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 10.056 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 10.056 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 7.697 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 1.331 | ms |
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
