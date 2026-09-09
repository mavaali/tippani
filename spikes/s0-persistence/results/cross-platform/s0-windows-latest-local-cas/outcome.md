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
| OS | win32 10.0.26100 |
| Architecture | x64 |
| CPU | AMD EPYC 7763 64-Core Processor                 |
| Logical CPUs | 2 |
| Total memory | 8584425472 bytes |
| Runtime | Node 24.19.0 |
| Provider/API version | N/A |
| Configured platform/filesystem | Windows/NTFS |
| Detected filesystem | NTFS |
| Temporary store root | tippani-s0-s0-local-cas-windows-latest-33450465982-RaJo20 |
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
| Ownership marker | `tippani-s0:s0-local-cas-windows-latest-33450465982` |
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
| `S0-ATM-001` | absolute | Pass | 28.765 | generation=1; updatedPartitions=4 | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Pass | 24.817 | aliasResolved=true; generation=1 | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Pass | 12.726 | previousGenerationPreserved=true; danglingAlias=false | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Pass | 192.264 | processes=2; winners=1; staleConflicts=1; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Pass | 311.520 | processes=4; winners=1; staleConflicts=3; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Pass | 36.866 | independentWriters=2; committed=2 | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Pass | 33.588 | frozenRevision=1; preservedRevision=2 | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Pass | 353.084 | processes=3; winners=1; staleConflicts=2; durableGeneration=1; boundedContention=true | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Pass | 34.573 | journalStatus=planned; tupleCount=1 | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Pass | 11.521 | rejectedBeforeCommit=true | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Pass | 206.890 | killedBeforeCommitGeneration=0; killedAfterCommitGeneration=1; lostResponseRecovered=true | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Pass | 93.687 | partialAliasVisible=false; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Pass | 82.609 | previousGenerationPreserved=true; killedProcess=true; mechanism=process-kill | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Pass | 213.689 | processes=3; winners=1; staleConflicts=2; durableGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Pass | 264.061 | commits=5; strayTempFiles=0; durableGeneration=5; tornReplaceKilled=true; previousGenerationIntact=true | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Pass | 11.334 | typedCorruptionFailure=true | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Pass | 3.506 | partialRestoreVisible=false | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Pass | 1.488 | unsupportedVersionFailedClosed=true | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Pass | 9.049 | permissionErrorFailedClosed=true; treatedAsAbsent=false | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Pass | 19.184 | enumeratedWorkspaces=3 | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Pass | 29.700 | exactRehydration=true; generation=1 | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Pass | 49.502 | surfacedBeforeMutation=true; reconciledThenAccepted=true | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Pass | 15.616 | migrated=1; idempotentSecondRun=true; generationPreserved=2 | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Pass | 15.408 | rolledBackOnInterrupt=true; resumedToComplete=true | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Pass | 194.072 | failedClosedOnUnsupported=true; sourcePreserved=true | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Pass | 10.848 | receiptIssued=true; generation=0 | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Pass | 9.263 | corruptRejected=true; incompleteRejected=true; duplicateRejected=true | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Pass | 7.976 | workspaceCount=1; knownGeneration=0 | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Pass | 16.951 | exactRestore=true; corruptBackupRejected=true | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Pass | 103.405 | restartedInSeparateProcess=true; generation=1; selectionRecovered=true | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Pass | 113.906 | orphanedLockObserved=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Pass | 48.596 | identifiesWorkspace=true; leaksBody=false; leaksSecret=false | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.420 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.195 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.420 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.426 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.436 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.437 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Pass | 273.861 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Pass | 1541.772 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; repetitions_small=40; repetitions_medium=20; repetitions_stress=8 | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Pass | 5633.650 | scales=small,medium,stress; discardedWarmupRuns=1; repetitions=5; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.252 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=1; implementation=3; test=3; migration=2; deployment=1; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Built-in filesystem and crypto APIs","implementation":"Envelope, alias index, lock ownership, fsync, and atomic replace","test":"Filesystem race, process-kill, torn-replace, corruption, and backup fixtures","migration":"Envelope migration with explicit original preservation","deployment":"No service, credential, or external package","maintenance":"Filesystem and platform-specific durability behavior","diagnostics":"Envelope, index, lock, and temp-file diagnostics","recovery":"Stale-lock, temp-file, index rebuild, and replace recovery"}; total=19; mean=2.375 | [JSON](raw-results.json) |

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
| `S0-CON-005` | contentionCompletionMs | 352.801 | ms |
| `S0-PER-001` | initializedMinMs_small | 1.202 | ms |
| `S0-PER-001` | initializedP50Ms_small | 1.509 | ms |
| `S0-PER-001` | initializedP95Ms_small | 1.666 | ms |
| `S0-PER-001` | initializedMaxMs_small | 1.666 | ms |
| `S0-PER-001` | initializedMeanMs_small | 1.495 | ms |
| `S0-PER-001` | initializedStdDevMs_small | 0.160 | ms |
| `S0-PER-001` | createMinMs_small | 4.873 | ms |
| `S0-PER-001` | createP50Ms_small | 4.984 | ms |
| `S0-PER-001` | createP95Ms_small | 8.065 | ms |
| `S0-PER-001` | createMaxMs_small | 8.065 | ms |
| `S0-PER-001` | createMeanMs_small | 5.910 | ms |
| `S0-PER-001` | createStdDevMs_small | 1.285 | ms |
| `S0-PER-001` | enumerateMinMs_small | 0.118 | ms |
| `S0-PER-001` | enumerateP50Ms_small | 0.133 | ms |
| `S0-PER-001` | enumerateP95Ms_small | 0.151 | ms |
| `S0-PER-001` | enumerateMaxMs_small | 0.151 | ms |
| `S0-PER-001` | enumerateMeanMs_small | 0.135 | ms |
| `S0-PER-001` | enumerateStdDevMs_small | 0.011 | ms |
| `S0-PER-001` | initializedMinMs_medium | 1.576 | ms |
| `S0-PER-001` | initializedP50Ms_medium | 1.638 | ms |
| `S0-PER-001` | initializedP95Ms_medium | 6.565 | ms |
| `S0-PER-001` | initializedMaxMs_medium | 6.565 | ms |
| `S0-PER-001` | initializedMeanMs_medium | 2.610 | ms |
| `S0-PER-001` | initializedStdDevMs_medium | 1.978 | ms |
| `S0-PER-001` | createMinMs_medium | 5.164 | ms |
| `S0-PER-001` | createP50Ms_medium | 5.735 | ms |
| `S0-PER-001` | createP95Ms_medium | 7.508 | ms |
| `S0-PER-001` | createMaxMs_medium | 7.508 | ms |
| `S0-PER-001` | createMeanMs_medium | 6.261 | ms |
| `S0-PER-001` | createStdDevMs_medium | 0.921 | ms |
| `S0-PER-001` | enumerateMinMs_medium | 0.119 | ms |
| `S0-PER-001` | enumerateP50Ms_medium | 0.128 | ms |
| `S0-PER-001` | enumerateP95Ms_medium | 0.179 | ms |
| `S0-PER-001` | enumerateMaxMs_medium | 0.179 | ms |
| `S0-PER-001` | enumerateMeanMs_medium | 0.136 | ms |
| `S0-PER-001` | enumerateStdDevMs_medium | 0.022 | ms |
| `S0-PER-001` | initializedMinMs_stress | 1.478 | ms |
| `S0-PER-001` | initializedP50Ms_stress | 1.570 | ms |
| `S0-PER-001` | initializedP95Ms_stress | 1.682 | ms |
| `S0-PER-001` | initializedMaxMs_stress | 1.682 | ms |
| `S0-PER-001` | initializedMeanMs_stress | 1.583 | ms |
| `S0-PER-001` | initializedStdDevMs_stress | 0.073 | ms |
| `S0-PER-001` | createMinMs_stress | 14.025 | ms |
| `S0-PER-001` | createP50Ms_stress | 15.484 | ms |
| `S0-PER-001` | createP95Ms_stress | 16.741 | ms |
| `S0-PER-001` | createMaxMs_stress | 16.741 | ms |
| `S0-PER-001` | createMeanMs_stress | 15.464 | ms |
| `S0-PER-001` | createStdDevMs_stress | 1.072 | ms |
| `S0-PER-001` | enumerateMinMs_stress | 0.136 | ms |
| `S0-PER-001` | enumerateP50Ms_stress | 0.184 | ms |
| `S0-PER-001` | enumerateP95Ms_stress | 0.198 | ms |
| `S0-PER-001` | enumerateMaxMs_stress | 0.198 | ms |
| `S0-PER-001` | enumerateMeanMs_stress | 0.177 | ms |
| `S0-PER-001` | enumerateStdDevMs_stress | 0.023 | ms |
| `S0-PER-002` | openByAliasMinMs_small | 0.292 | ms |
| `S0-PER-002` | openByAliasP50Ms_small | 0.391 | ms |
| `S0-PER-002` | openByAliasP95Ms_small | 0.547 | ms |
| `S0-PER-002` | openByAliasMaxMs_small | 0.697 | ms |
| `S0-PER-002` | openByAliasMeanMs_small | 0.420 | ms |
| `S0-PER-002` | openByAliasStdDevMs_small | 0.071 | ms |
| `S0-PER-002` | mutationMinMs_small | 9.078 | ms |
| `S0-PER-002` | mutationP50Ms_small | 11.204 | ms |
| `S0-PER-002` | mutationP95Ms_small | 14.461 | ms |
| `S0-PER-002` | mutationMaxMs_small | 14.541 | ms |
| `S0-PER-002` | mutationMeanMs_small | 11.413 | ms |
| `S0-PER-002` | mutationStdDevMs_small | 1.669 | ms |
| `S0-PER-002` | conflictMinMs_small | 4.834 | ms |
| `S0-PER-002` | conflictP50Ms_small | 5.343 | ms |
| `S0-PER-002` | conflictP95Ms_small | 7.765 | ms |
| `S0-PER-002` | conflictMaxMs_small | 8.825 | ms |
| `S0-PER-002` | conflictMeanMs_small | 5.755 | ms |
| `S0-PER-002` | conflictStdDevMs_small | 1.005 | ms |
| `S0-PER-002` | openByAliasMinMs_medium | 0.527 | ms |
| `S0-PER-002` | openByAliasP50Ms_medium | 0.628 | ms |
| `S0-PER-002` | openByAliasP95Ms_medium | 0.866 | ms |
| `S0-PER-002` | openByAliasMaxMs_medium | 1.111 | ms |
| `S0-PER-002` | openByAliasMeanMs_medium | 0.665 | ms |
| `S0-PER-002` | openByAliasStdDevMs_medium | 0.130 | ms |
| `S0-PER-002` | mutationMinMs_medium | 9.806 | ms |
| `S0-PER-002` | mutationP50Ms_medium | 10.747 | ms |
| `S0-PER-002` | mutationP95Ms_medium | 15.147 | ms |
| `S0-PER-002` | mutationMaxMs_medium | 15.152 | ms |
| `S0-PER-002` | mutationMeanMs_medium | 11.290 | ms |
| `S0-PER-002` | mutationStdDevMs_medium | 1.536 | ms |
| `S0-PER-002` | conflictMinMs_medium | 4.917 | ms |
| `S0-PER-002` | conflictP50Ms_medium | 5.501 | ms |
| `S0-PER-002` | conflictP95Ms_medium | 10.163 | ms |
| `S0-PER-002` | conflictMaxMs_medium | 10.961 | ms |
| `S0-PER-002` | conflictMeanMs_medium | 6.378 | ms |
| `S0-PER-002` | conflictStdDevMs_medium | 1.808 | ms |
| `S0-PER-002` | openByAliasMinMs_stress | 8.390 | ms |
| `S0-PER-002` | openByAliasP50Ms_stress | 8.625 | ms |
| `S0-PER-002` | openByAliasP95Ms_stress | 9.908 | ms |
| `S0-PER-002` | openByAliasMaxMs_stress | 9.908 | ms |
| `S0-PER-002` | openByAliasMeanMs_stress | 8.914 | ms |
| `S0-PER-002` | openByAliasStdDevMs_stress | 0.514 | ms |
| `S0-PER-002` | mutationMinMs_stress | 24.739 | ms |
| `S0-PER-002` | mutationP50Ms_stress | 27.709 | ms |
| `S0-PER-002` | mutationP95Ms_stress | 38.302 | ms |
| `S0-PER-002` | mutationMaxMs_stress | 38.302 | ms |
| `S0-PER-002` | mutationMeanMs_stress | 28.898 | ms |
| `S0-PER-002` | mutationStdDevMs_stress | 3.991 | ms |
| `S0-PER-002` | conflictMinMs_stress | 8.980 | ms |
| `S0-PER-002` | conflictP50Ms_stress | 9.863 | ms |
| `S0-PER-002` | conflictP95Ms_stress | 12.458 | ms |
| `S0-PER-002` | conflictMaxMs_stress | 12.458 | ms |
| `S0-PER-002` | conflictMeanMs_stress | 10.023 | ms |
| `S0-PER-002` | conflictStdDevMs_stress | 0.999 | ms |
| `S0-PER-003` | backupMinMs_small | 0.320 | ms |
| `S0-PER-003` | backupP50Ms_small | 0.333 | ms |
| `S0-PER-003` | backupP95Ms_small | 0.434 | ms |
| `S0-PER-003` | backupMaxMs_small | 0.434 | ms |
| `S0-PER-003` | backupMeanMs_small | 0.355 | ms |
| `S0-PER-003` | backupStdDevMs_small | 0.042 | ms |
| `S0-PER-003` | restoreMinMs_small | 4.885 | ms |
| `S0-PER-003` | restoreP50Ms_small | 5.871 | ms |
| `S0-PER-003` | restoreP95Ms_small | 7.875 | ms |
| `S0-PER-003` | restoreMaxMs_small | 7.875 | ms |
| `S0-PER-003` | restoreMeanMs_small | 6.068 | ms |
| `S0-PER-003` | restoreStdDevMs_small | 1.117 | ms |
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
| `S0-PER-003` | backupMinMs_medium | 0.392 | ms |
| `S0-PER-003` | backupP50Ms_medium | 0.464 | ms |
| `S0-PER-003` | backupP95Ms_medium | 0.951 | ms |
| `S0-PER-003` | backupMaxMs_medium | 0.951 | ms |
| `S0-PER-003` | backupMeanMs_medium | 0.547 | ms |
| `S0-PER-003` | backupStdDevMs_medium | 0.204 | ms |
| `S0-PER-003` | restoreMinMs_medium | 7.546 | ms |
| `S0-PER-003` | restoreP50Ms_medium | 10.724 | ms |
| `S0-PER-003` | restoreP95Ms_medium | 28.594 | ms |
| `S0-PER-003` | restoreMaxMs_medium | 28.594 | ms |
| `S0-PER-003` | restoreMeanMs_medium | 15.518 | ms |
| `S0-PER-003` | restoreStdDevMs_medium | 8.126 | ms |
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
| `S0-PER-003` | backupMinMs_stress | 4.587 | ms |
| `S0-PER-003` | backupP50Ms_stress | 7.072 | ms |
| `S0-PER-003` | backupP95Ms_stress | 7.353 | ms |
| `S0-PER-003` | backupMaxMs_stress | 7.353 | ms |
| `S0-PER-003` | backupMeanMs_stress | 6.182 | ms |
| `S0-PER-003` | backupStdDevMs_stress | 1.274 | ms |
| `S0-PER-003` | restoreMinMs_stress | 22.579 | ms |
| `S0-PER-003` | restoreP50Ms_stress | 29.399 | ms |
| `S0-PER-003` | restoreP95Ms_stress | 53.266 | ms |
| `S0-PER-003` | restoreMaxMs_stress | 53.266 | ms |
| `S0-PER-003` | restoreMeanMs_stress | 32.867 | ms |
| `S0-PER-003` | restoreStdDevMs_stress | 11.411 | ms |
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
