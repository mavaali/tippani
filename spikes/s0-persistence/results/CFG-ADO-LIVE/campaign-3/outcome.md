# S0 Outcome: CFG-ADO-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-ADO-LIVE
**Adapter:** ado
**Authoritative backing path:** ado
**Dataset scale:** small
**Recommendation:** Proceed to architecture-mapping evaluation
**Applicable absolute gates:** 18
**Eligibility:** Yes

## Coverage

Executed 20 of 58 catalog scenarios. 20 apply to this configuration; 0 applicable absolute gates were not executed.

| Outcome class | Count | Meaning |
|---|---:|---|
| Pass | 20 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 0 | Applicable, but a prerequisite is unavailable |
| Incomplete | 0 | Applicable implementation or evidence is incomplete |
| N/A | 0 | Applicable family, contract-level exception approved by review |
| Not applicable | 38 | Assigned to another configuration by design |
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
| Provider/API version | Azure DevOps Git REST 7.1 |
| Configured platform/filesystem | windows-ntfs |
| Temporary store root | tippani-s0-s0-ado-live-c3-1788212697875-JDZozU |
| Network characteristics | Local Windows client to provider service over current network path |
| Provider region | Provider-managed; client region not asserted |
| Storage characteristics | Provider-authoritative envelope plus local Windows client cache |
| Sync-client state | Not applicable |
| Repository protections | Default branch excluded; all mutations use a per-run branch |
| Dependency versions | node=24.14.0; sqlite=3.51.2 |
| Workload mix | scenario-defined deterministic small/medium/stress fixtures |
| Known limitations | Single physical Windows machine; two independent client processes share one provider identity |
| Process topology | Independent OS child processes sharing one provider account for collaboration gates |
| Dataset scale | small |
| Applicability profile | ado |
| Store namespace | tippani-s0/s0-ado-live-c3-1788212697875 |
| Authentication setup | Live delegated identity (supplied at runtime) |
| Cleanup manifest | syn-cleanup-s0-ado-live |
| Cleanup expiry | 2026-09-01T23:03:17.789Z |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-ado-live-c3-1788212697875` |
| Operation budget | 100 |
| Duration budget | 300000 ms |
| Object budget | 10000 |
| Storage/transfer budget | 104857600 bytes |
| Declared provider operations | ["connect","read-item","push","list-items","list-commits","delete-ref"] |
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
| `S0-COL-002` | absolute | Pass | 3055.887 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 3643.401 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 1862.804 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 2751.904 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2 | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 3269.668 | accounts=1; clientProcesses=2; changeMechanism=ADO branch/ref and item polling; observedGeneration=1 | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Pass | 2187.199 | winners=1; staleConflicts=1; durableGeneration=2 | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 2212.246 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=35900 | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Pass | 1072.560 | workspaceIdPreserved=true; generation=1; receipt=true | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 2326.430 | recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 3430.351 | restoredGeneration=2; oneHead=true | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 1752.755 | outageRejected=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 2172.280 | discoveredNewerAuthority=true; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 1.083 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.633 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 1.068 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 1.767 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.652 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.769 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 13215.650 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=4; bytesPerMutation_small=9513.167; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=24; requestBytes_small=19680; responseBytes_small=37399; repetitions_medium=4; requestsPerMutation_medium=4; bytesPerMutation_medium=78099.25; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=16; requestBytes_medium=108896; responseBytes_medium=203501; repetitions_stress=2; requestsPerMutation_stress=4; bytesPerMutation_stress=1474522.5; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=8; requestBytes_stress=1029086; responseBytes_stress=1919959; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.340 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=3; test=4; migration=3; deployment=3; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Azure DevOps Git REST API and scoped authentication","implementation":"Repository envelope with branch-tip oldObjectId CAS","test":"Live repository, ref race, offline, failure, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Scoped credential, repository coordinates, and per-run branch","maintenance":"ADO Git REST API and ref semantics","diagnostics":"Provider responses, request telemetry, branch, commit, and generation state","recovery":"Auditable commit history plus offline conflict reconciliation"}; total=24; mean=3 | [JSON](raw-results.json) |

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
| `S0-COL-006` | collaboratorDiscoveryMs | 438.000 | ms |
| `S0-PER-004` | setupMs_small | 826.091 | ms |
| `S0-PER-004` | warmupMs_small | 299.205 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 485.356 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 573.643 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 600.328 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 600.328 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 553.119 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 44.485 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 98.200 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 107.929 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 267.781 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 267.781 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 134.919 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 59.762 | ms |
| `S0-PER-004` | cleanupMs_small | 0.045 | ms |
| `S0-PER-004` | setupMs_medium | 788.051 | ms |
| `S0-PER-004` | warmupMs_medium | 368.241 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 536.119 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 560.063 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 680.530 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 680.530 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 593.278 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 54.756 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 88.681 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 89.045 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 119.154 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 119.154 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 104.004 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 15.141 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.008 | ms |
| `S0-PER-004` | setupMs_stress | 1566.779 | ms |
| `S0-PER-004` | warmupMs_stress | 830.515 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 745.713 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 745.713 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 914.700 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 914.700 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 830.206 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 84.493 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 265.507 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 265.507 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 266.845 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 266.845 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 266.176 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 0.669 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.011 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 298.550 | ms |

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
