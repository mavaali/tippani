# S0 Outcome: CFG-GITHUB-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-GITHUB-LIVE
**Adapter:** github
**Authoritative backing path:** github
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
| Provider/API version | GitHub REST 2022-11-28 |
| Configured platform/filesystem | windows-ntfs |
| Temporary store root | tippani-s0-s0-github-live-c1-1788214437144-cFjdBx |
| Network characteristics | Local Windows client to provider service over current network path |
| Provider region | Provider-managed; client region not asserted |
| Storage characteristics | Provider-authoritative repository envelope plus local Windows client cache |
| Sync-client state | Not applicable |
| Repository protections | Default branch excluded; all mutations use a per-run branch |
| Dependency versions | node=24.14.0; sqlite=3.51.2 |
| Workload mix | scenario-defined deterministic small/medium/stress fixtures |
| Known limitations | Single physical Windows machine; two independent client processes share one provider identity |
| Process topology | Independent OS child processes sharing one provider account for collaboration gates |
| Dataset scale | small |
| Applicability profile | github |
| Store namespace | tippani-s0/s0-github-live-c1-1788214437144 |
| Authentication setup | Live delegated identity (supplied at runtime) |
| Cleanup manifest | syn-cleanup-s0-github-live |
| Cleanup expiry | 2026-09-01T23:04:20.355Z |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-github-live-c1-1788214437144` |
| Operation budget | 100 |
| Duration budget | 300000 ms |
| Object budget | 10000 |
| Storage/transfer budget | 104857600 bytes |
| Declared provider operations | ["connect","get-contents","put-contents","list-contents","list-commits","delete-ref"] |
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
| `S0-COL-002` | absolute | Pass | 6287.374 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 9261.015 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 4202.330 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1 | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 6041.035 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2 | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 6779.845 | accounts=1; clientProcesses=2; changeMechanism=GitHub ref and contents polling; observedGeneration=1 | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Pass | 7619.040 | winners=1; staleConflicts=1; durableGeneration=2 | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 5812.651 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=65107 | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Pass | 3093.584 | workspaceIdPreserved=true; generation=1; receipt=true | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 4843.541 | recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 11597.837 | restoredGeneration=2; oneHead=true | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 4531.111 | outageRejected=true; recoveredGeneration=1 | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 6194.139 | discoveredNewerAuthority=true; noSilentOverwrite=true | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.785 | providerPreflightRejected=true; errorCount=8 | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.783 | corporateFallbackImpossible=true | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.851 | syntheticFixtureAccepted=true; actualDataRejected=true | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.651 | configSecretRejected=true; workspaceHasNoSecrets=true | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.624 | ownedAuthorized=true; foreignRefused=true | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.642 | nonPositiveBudgetsRejected=true | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 36131.872 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=5; bytesPerMutation_small=17269.333; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=30; requestBytes_small=22546; responseBytes_small=81070; repetitions_medium=4; requestsPerMutation_medium=5; bytesPerMutation_medium=108540.5; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=20; requestBytes_medium=134076; responseBytes_medium=300086; repetitions_stress=2; requestsPerMutation_stress=5; bytesPerMutation_stress=1967160; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=10; requestBytes_stress=1279178; responseBytes_stress=2655142; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.519 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=4; test=4; migration=3; deployment=3; maintenance=4; diagnostics=3; recovery=3; rationale={"dependencies":"GitHub REST API and repository-scoped authentication","implementation":"Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads","test":"Live repository, blob race, consistency, offline, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Repository-scoped credential, coordinates, and per-run branch","maintenance":"GitHub REST API, blob/ref semantics, and read-after-write consistency handling","diagnostics":"Provider responses, request telemetry, branch, blob, and generation state","recovery":"Commit history plus offline conflict reconciliation"}; total=26; mean=3.25 | [JSON](raw-results.json) |

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
| `S0-COL-006` | collaboratorDiscoveryMs | 639.000 | ms |
| `S0-PER-004` | setupMs_small | 4017.743 | ms |
| `S0-PER-004` | warmupMs_small | 1290.076 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 1018.488 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 1053.328 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 1178.071 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 1178.071 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 1092.490 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 60.047 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 430.285 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 473.633 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 543.527 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 543.527 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 478.151 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 39.834 | ms |
| `S0-PER-004` | cleanupMs_small | 0.057 | ms |
| `S0-PER-004` | setupMs_medium | 3885.747 | ms |
| `S0-PER-004` | warmupMs_medium | 1323.709 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 1101.140 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 1159.446 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 1225.648 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 1225.648 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 1175.490 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 49.800 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 457.374 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 459.116 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 551.514 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 551.514 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 497.752 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 40.778 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.029 | ms |
| `S0-PER-004` | setupMs_stress | 4883.539 | ms |
| `S0-PER-004` | warmupMs_stress | 1860.138 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 1506.455 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 1506.455 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 1799.974 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 1799.974 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 1653.215 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 146.760 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 552.503 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 552.503 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 656.423 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 656.423 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 604.463 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 51.960 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.011 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 882.027 | ms |

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
