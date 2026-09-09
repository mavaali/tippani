# S0 Outcome: CFG-ONEDRIVE-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-ONEDRIVE-LIVE
**Adapter:** onedrive
**Authoritative backing path:** onedrive
**Dataset scale:** small
**Recommendation:** Proceed to architecture-mapping evaluation
**Applicable absolute gates:** 18
**Eligibility:** Yes

## Coverage

Executed 21 of 58 catalog scenarios. 21 apply to this configuration; 0 applicable absolute gates were not executed.

| Outcome class | Count | Meaning |
|---|---:|---|
| Pass | 20 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 1 | Applicable, but a prerequisite is unavailable |
| Incomplete | 0 | Applicable implementation or evidence is incomplete |
| N/A | 0 | Applicable family, contract-level exception approved by review |
| Not applicable | 37 | Assigned to another configuration by design |
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
| Provider/API version | Microsoft Graph v1.0 |
| Configured platform/filesystem | windows-ntfs |
| Temporary store root | tippani-s0-s0-onedrive-live-c3-1788212697875-ImigMo |
| Network characteristics | Local Windows client to provider service over current network path |
| Provider region | Provider-managed; client region not asserted |
| Storage characteristics | Provider-authoritative envelope plus local Windows client cache |
| Sync-client state | Personal and Business clients running; API campaign does not use sync-folder authority |
| Repository protections | Not recorded |
| Dependency versions | node=24.14.0; sqlite=3.51.2 |
| Workload mix | scenario-defined deterministic small/medium/stress fixtures |
| Known limitations | Single physical Windows machine; two independent client processes share one provider identity |
| Process topology | Independent OS child processes sharing one provider account for collaboration gates |
| Dataset scale | small |
| Applicability profile | onedrive |
| Store namespace | tippani-s0/s0-onedrive-live-c3-1788212697875 |
| Authentication setup | Live delegated identity (supplied at runtime) |
| Cleanup manifest | syn-cleanup-s0-onedrive-live |
| Cleanup expiry | 2026-09-01T22:59:08.132Z |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-onedrive-live-c3-1788212697875` |
| Operation budget | 100 |
| Duration budget | 300000 ms |
| Object budget | 10000 |
| Storage/transfer budget | 104857600 bytes |
| Declared provider operations | ["ensure-folder","put-content","get-content","list-children","delete-folder"] |
| Timer | `performance.now()` monotonic elapsed time |
| Performance statistics | Minimum, p50, p95, maximum, mean, sample variability |
| Raw evidence | [raw-results.json](raw-results.json) |
| Redacted preflight | [preflight.json](preflight.json) |

## Scenario results

| Scenario ID | Type | Applicability/result | Duration (ms) | Evidence / reason | Raw |
|---|---|---|---:|---|---|
| `S0-ATM-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-ATM-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-ATM-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CON-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CON-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CON-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CON-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CON-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-JRN-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-JRN-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CRS-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CRS-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-CRS-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COL-002` | absolute | Pass | 9182.210 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 13881.232 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 5207.735 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 7531.166 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2 | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 8505.888 | accounts=1; clientProcesses=2; changeMechanism=Graph drive-item polling; observedGeneration=1 | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Pass | 9533.746 | winners=1; staleConflicts=1; durableGeneration=2 | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 10592.380 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=35137 | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Blocked | 0.361 | Blocked — requires a Windows OneDrive sync-client profile to measure synced-folder conflicts. | [JSON](raw-results.json) |
| `S0-COR-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-COR-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-HYD-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-HYD-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-HYD-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-MIG-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-MIG-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-MIG-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-MIG-004` | absolute | Pass | 3187.442 | workspaceIdPreserved=true; generation=1; receipt=true | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 6406.124 | recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 10331.380 | restoredGeneration=2; oneHead=true | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 5363.199 | outageRejected=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 8328.584 | discoveredNewerAuthority=true; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 1.650 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 1.194 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 1.530 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.898 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 1.143 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 1.402 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 50250.252 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=5; bytesPerMutation_small=11546.167; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=30; requestBytes_small=16098; responseBytes_small=53179; repetitions_medium=4; requestsPerMutation_medium=5; bytesPerMutation_medium=78510.25; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=20; requestBytes_medium=100016; responseBytes_medium=214025; repetitions_stress=2; requestsPerMutation_stress=5; bytesPerMutation_stress=1442167.5; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=10; requestBytes_stress=959112; responseBytes_stress=1925223; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.328 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=3; test=4; migration=3; deployment=3; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Microsoft Graph drive API and delegated authentication","implementation":"Graph drive-item envelope with ETag CAS and version history","test":"Live sandbox, concurrency, offline, failure, version, and cleanup coverage","migration":"Receipt-gated local-to-drive rehome","deployment":"Delegated credential, drive coordinates, and approved namespace","maintenance":"Graph API and OneDrive consistency behavior","diagnostics":"Provider responses, request telemetry, and authoritative generation state","recovery":"Version history plus offline conflict reconciliation"}; total=24; mean=3 | [JSON](raw-results.json) |

## Correctness summary

| Criterion | Outcome |
|---|---|
| Atomicity and concurrency | Not applicable |
| Collaboration | Pass |
| Crash and operational recovery | Pass |
| Corruption and rehydration | Not applicable |
| Migration and import | Pass |
| Backup and restore | Pass |
| Safety and security | Pass |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-COL-006` | collaboratorDiscoveryMs | 919.000 | ms |
| `S0-PER-004` | setupMs_small | 5924.706 | ms |
| `S0-PER-004` | warmupMs_small | 2969.392 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 1300.127 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 1417.385 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 1622.282 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 1622.282 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 1446.634 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 110.147 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 734.468 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 928.136 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 1070.174 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 1070.174 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 909.822 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 124.816 | ms |
| `S0-PER-004` | cleanupMs_small | 0.027 | ms |
| `S0-PER-004` | setupMs_medium | 5318.580 | ms |
| `S0-PER-004` | warmupMs_medium | 2353.660 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 1453.800 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 1494.790 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 1734.305 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 1734.305 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 1547.570 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 109.617 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 753.334 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 794.115 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 890.740 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 890.740 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 818.442 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 50.871 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.014 | ms |
| `S0-PER-004` | setupMs_stress | 6094.921 | ms |
| `S0-PER-004` | warmupMs_stress | 2760.171 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 1790.833 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 1790.833 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 1827.532 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 1827.532 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 1809.183 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 18.349 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 873.908 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 873.908 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 955.611 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 955.611 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 914.759 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 40.851 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.007 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 1978.834 | ms |

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
