# S0 Outcome: CFG-GITHUB-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3-campaign-aggregate
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
| Store namespace | redacted-per-campaign |
| Authentication setup | Live delegated identity (supplied at runtime) |
| Cleanup manifest | see-campaign-preflights |
| Cleanup expiry | see-campaign-preflights |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `redacted-per-campaign` |
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
| `S0-COL-002` | absolute | Pass | 7228.683 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 9895.321 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 4310.763 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 6464.756 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 7161.304 | accounts=1; clientProcesses=2; changeMechanism=GitHub ref and contents polling; observedGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"GitHub ref and contents polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":639}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"GitHub ref and contents polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":680}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"GitHub ref and contents polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":689}}} | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Pass | 7595.689 | winners=1; staleConflicts=1; durableGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 5980.403 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=65107; campaigns={"campaign-1":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":65107},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":65107},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":65107},"measurements":{}}} | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Pass | 3032.396 | workspaceIdPreserved=true; generation=1; receipt=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 4877.605 | recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 11312.948 | restoredGeneration=2; oneHead=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 4410.725 | outageRejected=true; recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 6145.687 | discoveredNewerAuthority=true; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 1.024 | providerPreflightRejected=true; errorCount=8; campaigns={"campaign-1":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.695 | corporateFallbackImpossible=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 0.902 | syntheticFixtureAccepted=true; actualDataRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 1.046 | configSecretRejected=true; workspaceHasNoSecrets=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.554 | ownedAuthorized=true; foreignRefused=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.631 | nonPositiveBudgetsRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 35188.952 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=5; bytesPerMutation_small=17269.333; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=30; requestBytes_small=22546; responseBytes_small=81070; repetitions_medium=4; requestsPerMutation_medium=5; bytesPerMutation_medium=108540.5; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=20; requestBytes_medium=134076; responseBytes_medium=300086; repetitions_stress=2; requestsPerMutation_stress=5; bytesPerMutation_stress=1967160; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=10; requestBytes_stress=1279178; responseBytes_stress=2655142; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state; campaigns={"campaign-1":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[1053.3283999999985,1178.071100000001,1034.3323999999993,1018.4881000000023,1124.363000000012,1146.357600000003],"collaboratorDiscoveryMs":[508.62429999999586,543.5269999999873,473.6331000000064,479.4582999999984,430.28459999999905,433.37880000000587],"requestsPerMutation":[5,5,5,5,5,5],"transferredBytesPerMutation":[16675,16915,17151,17385,17627,17863],"requestBytesPerMutation":[3563,3643,3719,3795,3875,3951],"responseBytesPerMutation":[13112,13272,13432,13590,13752,13912],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1101.1398999999947,1225.6484999999957,1159.4462000000058,1215.7270999999892],"collaboratorDiscoveryMs":[459.1157999999996,551.5138999999908,457.3735000000015,523.0059000000037],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[108186,108418,108660,108898],"requestBytesPerMutation":[33403,33479,33559,33635],"responseBytesPerMutation":[74783,74939,75101,75263],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1799.9744999999966,1506.4553000000014],"collaboratorDiscoveryMs":[552.5029000000068,656.4229999999952],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1967043,1967277],"requestBytesPerMutation":[639551,639627],"responseBytesPerMutation":[1327492,1327650],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5,"bytesPerMutation_small":17269.333,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":30,"requestBytes_small":22546,"responseBytes_small":81070,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":108540.5,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":134076,"responseBytes_medium":300086,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1967160,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":1279178,"responseBytes_stress":2655142,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":4017.7425999999978,"warmupMs_small":1290.0759999999864,"remoteCasMinMs_small":1018.4881000000023,"remoteCasP50Ms_small":1053.3283999999985,"remoteCasP95Ms_small":1178.071100000001,"remoteCasMaxMs_small":1178.071100000001,"remoteCasMeanMs_small":1092.4901000000027,"remoteCasStdDevMs_small":60.04713383645818,"collaboratorDiscoveryMinMs_small":430.28459999999905,"collaboratorDiscoveryP50Ms_small":473.6331000000064,"collaboratorDiscoveryP95Ms_small":543.5269999999873,"collaboratorDiscoveryMaxMs_small":543.5269999999873,"collaboratorDiscoveryMeanMs_small":478.1510166666655,"collaboratorDiscoveryStdDevMs_small":39.834043196713715,"cleanupMs_small":0.05749999999534339,"setupMs_medium":3885.7465000000084,"warmupMs_medium":1323.7085999999981,"remoteCasMinMs_medium":1101.1398999999947,"remoteCasP50Ms_medium":1159.4462000000058,"remoteCasP95Ms_medium":1225.6484999999957,"remoteCasMaxMs_medium":1225.6484999999957,"remoteCasMeanMs_medium":1175.4904249999963,"remoteCasStdDevMs_medium":49.80020137104569,"collaboratorDiscoveryMinMs_medium":457.3735000000015,"collaboratorDiscoveryP50Ms_medium":459.1157999999996,"collaboratorDiscoveryP95Ms_medium":551.5138999999908,"collaboratorDiscoveryMaxMs_medium":551.5138999999908,"collaboratorDiscoveryMeanMs_medium":497.7522749999989,"collaboratorDiscoveryStdDevMs_medium":40.777691723559506,"cleanupMs_medium":0.02860000000509899,"setupMs_stress":4883.539400000009,"warmupMs_stress":1860.1375999999873,"remoteCasMinMs_stress":1506.4553000000014,"remoteCasP50Ms_stress":1506.4553000000014,"remoteCasP95Ms_stress":1799.9744999999966,"remoteCasMaxMs_stress":1799.9744999999966,"remoteCasMeanMs_stress":1653.214899999999,"remoteCasStdDevMs_stress":146.7595999999976,"collaboratorDiscoveryMinMs_stress":552.5029000000068,"collaboratorDiscoveryP50Ms_stress":552.5029000000068,"collaboratorDiscoveryP95Ms_stress":656.4229999999952,"collaboratorDiscoveryMaxMs_stress":656.4229999999952,"collaboratorDiscoveryMeanMs_stress":604.462950000001,"collaboratorDiscoveryStdDevMs_stress":51.960049999994226,"cleanupMs_stress":0.011299999998300336,"throttleFailureLatencyMs":882.0271000000066}},"campaign-2":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[1208.0908999999956,988.4994000000006,988.0286000000051,1141.2799999999988,1089.2752999999939,1373.1463999999978],"collaboratorDiscoveryMs":[604.7581999999966,448.05569999999716,419.9149000000034,439.34850000000733,439.4475999999995,425.3695000000007],"requestsPerMutation":[5,5,5,5,5,5],"transferredBytesPerMutation":[16675,16915,17151,17385,17627,17863],"requestBytesPerMutation":[3563,3643,3719,3795,3875,3951],"responseBytesPerMutation":[13112,13272,13432,13590,13752,13912],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1163.1770000000106,1027.8641999999963,1110.4213000000018,1068.960699999996],"collaboratorDiscoveryMs":[425.65959999999905,444.62050000000454,447.84709999999905,436.6420000000071],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[108186,108418,108660,108898],"requestBytesPerMutation":[33403,33479,33559,33635],"responseBytesPerMutation":[74783,74939,75101,75263],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1403.4887000000017,1514.9153000000078],"collaboratorDiscoveryMs":[501.7054000000062,472.7375999999931],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1967043,1967277],"requestBytesPerMutation":[639551,639627],"responseBytesPerMutation":[1327492,1327650],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5,"bytesPerMutation_small":17269.333,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":30,"requestBytes_small":22546,"responseBytes_small":81070,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":108540.5,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":134076,"responseBytes_medium":300086,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1967160,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":1279178,"responseBytes_stress":2655142,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":4212.717199999999,"warmupMs_small":1288.7151000000013,"remoteCasMinMs_small":988.0286000000051,"remoteCasP50Ms_small":1089.2752999999939,"remoteCasP95Ms_small":1373.1463999999978,"remoteCasMaxMs_small":1373.1463999999978,"remoteCasMeanMs_small":1131.3867666666654,"remoteCasStdDevMs_small":133.64808239891963,"collaboratorDiscoveryMinMs_small":419.9149000000034,"collaboratorDiscoveryP50Ms_small":439.34850000000733,"collaboratorDiscoveryP95Ms_small":604.7581999999966,"collaboratorDiscoveryMaxMs_small":604.7581999999966,"collaboratorDiscoveryMeanMs_small":462.8157333333341,"collaboratorDiscoveryStdDevMs_small":64.16775542120276,"cleanupMs_small":0.04869999999937136,"setupMs_medium":4148.7451,"warmupMs_medium":1410.934500000003,"remoteCasMinMs_medium":1027.8641999999963,"remoteCasP50Ms_medium":1068.960699999996,"remoteCasP95Ms_medium":1163.1770000000106,"remoteCasMaxMs_medium":1163.1770000000106,"remoteCasMeanMs_medium":1092.6058000000012,"remoteCasStdDevMs_medium":50.12048442069924,"collaboratorDiscoveryMinMs_medium":425.65959999999905,"collaboratorDiscoveryP50Ms_medium":436.6420000000071,"collaboratorDiscoveryP95Ms_medium":447.84709999999905,"collaboratorDiscoveryMaxMs_medium":447.84709999999905,"collaboratorDiscoveryMeanMs_medium":438.69230000000243,"collaboratorDiscoveryStdDevMs_medium":8.558751627136287,"cleanupMs_medium":0.009700000009615906,"setupMs_stress":4978.330799999996,"warmupMs_stress":1793.371800000008,"remoteCasMinMs_stress":1403.4887000000017,"remoteCasP50Ms_stress":1403.4887000000017,"remoteCasP95Ms_stress":1514.9153000000078,"remoteCasMaxMs_stress":1514.9153000000078,"remoteCasMeanMs_stress":1459.2020000000048,"remoteCasStdDevMs_stress":55.71330000000307,"collaboratorDiscoveryMinMs_stress":472.7375999999931,"collaboratorDiscoveryP50Ms_stress":472.7375999999931,"collaboratorDiscoveryP95Ms_stress":501.7054000000062,"collaboratorDiscoveryMaxMs_stress":501.7054000000062,"collaboratorDiscoveryMeanMs_stress":487.22149999999965,"collaboratorDiscoveryStdDevMs_stress":14.483900000006543,"cleanupMs_stress":0.006699999998090789,"throttleFailureLatencyMs":835.2898999999888}},"campaign-3":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[997.7056000000011,995.092599999989,996.8013000000064,969.8323999999993,1072.0338000000047,1024.4495000000024],"collaboratorDiscoveryMs":[423.6664000000019,423.0819999999949,940.3839999999909,442.68099999999686,459.4274999999907,491.1048999999912],"requestsPerMutation":[5,5,7,5,5,5],"transferredBytesPerMutation":[16675,16915,22542,17385,17627,17863],"requestBytesPerMutation":[3563,3643,3719,3795,3875,3951],"responseBytesPerMutation":[13112,13272,18823,13590,13752,13912],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1137.7069999999949,1135.0587999999989,1381.9007999999885,1070.4869000000035],"collaboratorDiscoveryMs":[472.8426000000036,454.02919999998994,476.5084000000061,450.10460000000603],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[108186,108418,108660,108898],"requestBytesPerMutation":[33403,33479,33559,33635],"responseBytesPerMutation":[74783,74939,75101,75263],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1333.4729999999981,1299.0080999999918],"collaboratorDiscoveryMs":[493.2866999999969,517.5481],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1967043,1967277],"requestBytesPerMutation":[639551,639627],"responseBytesPerMutation":[1327492,1327650],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5.333,"bytesPerMutation_small":18167.833,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":32,"requestBytes_small":22546,"responseBytes_small":86461,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":108540.5,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":134076,"responseBytes_medium":300086,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1967160,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":1279178,"responseBytes_stress":2655142,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":3864.357799999998,"warmupMs_small":1302.8943,"remoteCasMinMs_small":969.8323999999993,"remoteCasP50Ms_small":996.8013000000064,"remoteCasP95Ms_small":1072.0338000000047,"remoteCasMaxMs_small":1072.0338000000047,"remoteCasMeanMs_small":1009.3192000000005,"remoteCasStdDevMs_small":32.1849449236255,"collaboratorDiscoveryMinMs_small":423.0819999999949,"collaboratorDiscoveryP50Ms_small":442.68099999999686,"collaboratorDiscoveryP95Ms_small":940.3839999999909,"collaboratorDiscoveryMaxMs_small":940.3839999999909,"collaboratorDiscoveryMeanMs_small":530.0576333333278,"collaboratorDiscoveryStdDevMs_small":184.9645078839943,"cleanupMs_small":0.06819999999424908,"setupMs_medium":3875.4064999999973,"warmupMs_medium":1423.829899999997,"remoteCasMinMs_medium":1070.4869000000035,"remoteCasP50Ms_medium":1135.0587999999989,"remoteCasP95Ms_medium":1381.9007999999885,"remoteCasMaxMs_medium":1381.9007999999885,"remoteCasMeanMs_medium":1181.2883749999964,"remoteCasStdDevMs_medium":118.91049341639561,"collaboratorDiscoveryMinMs_medium":450.10460000000603,"collaboratorDiscoveryP50Ms_medium":454.02919999998994,"collaboratorDiscoveryP95Ms_medium":476.5084000000061,"collaboratorDiscoveryMaxMs_medium":476.5084000000061,"collaboratorDiscoveryMeanMs_medium":463.3712000000014,"collaboratorDiscoveryStdDevMs_medium":11.46264674235684,"cleanupMs_medium":0.07799999999406282,"setupMs_stress":4586.0484,"warmupMs_stress":1748.794700000013,"remoteCasMinMs_stress":1299.0080999999918,"remoteCasP50Ms_stress":1299.0080999999918,"remoteCasP95Ms_stress":1333.4729999999981,"remoteCasMaxMs_stress":1333.4729999999981,"remoteCasMeanMs_stress":1316.240549999995,"remoteCasStdDevMs_stress":17.232450000003155,"collaboratorDiscoveryMinMs_stress":493.2866999999969,"collaboratorDiscoveryP50Ms_stress":493.2866999999969,"collaboratorDiscoveryP95Ms_stress":517.5481,"collaboratorDiscoveryMaxMs_stress":517.5481,"collaboratorDiscoveryMeanMs_stress":505.41739999999845,"collaboratorDiscoveryStdDevMs_stress":12.130700000001525,"cleanupMs_stress":0.0204000000085216,"throttleFailureLatencyMs":811.3723000000027}}} | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.519 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=4; test=4; migration=3; deployment=3; maintenance=4; diagnostics=3; recovery=3; rationale={"dependencies":"GitHub REST API and repository-scoped authentication","implementation":"Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads","test":"Live repository, blob race, consistency, offline, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Repository-scoped credential, coordinates, and per-run branch","maintenance":"GitHub REST API, blob/ref semantics, and read-after-write consistency handling","diagnostics":"Provider responses, request telemetry, branch, blob, and generation state","recovery":"Commit history plus offline conflict reconciliation"}; total=26; mean=3.25; campaigns={"campaign-1":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":4,"test":4,"migration":3,"deployment":3,"maintenance":4,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"GitHub REST API and repository-scoped authentication","implementation":"Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads","test":"Live repository, blob race, consistency, offline, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Repository-scoped credential, coordinates, and per-run branch","maintenance":"GitHub REST API, blob/ref semantics, and read-after-write consistency handling","diagnostics":"Provider responses, request telemetry, branch, blob, and generation state","recovery":"Commit history plus offline conflict reconciliation"},"total":26,"mean":3.25},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":4,"test":4,"migration":3,"deployment":3,"maintenance":4,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"GitHub REST API and repository-scoped authentication","implementation":"Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads","test":"Live repository, blob race, consistency, offline, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Repository-scoped credential, coordinates, and per-run branch","maintenance":"GitHub REST API, blob/ref semantics, and read-after-write consistency handling","diagnostics":"Provider responses, request telemetry, branch, blob, and generation state","recovery":"Commit history plus offline conflict reconciliation"},"total":26,"mean":3.25},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":4,"test":4,"migration":3,"deployment":3,"maintenance":4,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"GitHub REST API and repository-scoped authentication","implementation":"Contents blob-SHA CAS, branch lifecycle, and bounded consistency reads","test":"Live repository, blob race, consistency, offline, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Repository-scoped credential, coordinates, and per-run branch","maintenance":"GitHub REST API, blob/ref semantics, and read-after-write consistency handling","diagnostics":"Provider responses, request telemetry, branch, blob, and generation state","recovery":"Commit history plus offline conflict reconciliation"},"total":26,"mean":3.25},"measurements":{}}} | [JSON](raw-results.json) |

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
| `S0-COL-006` | collaboratorDiscoveryMs | 669.333 | ms |
| `S0-PER-004` | setupMs_small | 4031.606 | ms |
| `S0-PER-004` | warmupMs_small | 1293.895 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 992.116 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 1046.468 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 1207.750 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 1207.750 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 1077.732 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 75.293 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 424.427 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 451.888 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 696.223 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 696.223 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 490.341 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 96.322 | ms |
| `S0-PER-004` | cleanupMs_small | 0.058 | ms |
| `S0-PER-004` | setupMs_medium | 3969.966 | ms |
| `S0-PER-004` | warmupMs_medium | 1386.158 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 1066.497 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 1121.155 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 1256.909 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 1256.909 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 1149.795 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 72.944 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 444.379 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 449.929 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 491.956 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 491.956 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 466.605 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 20.266 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.039 | ms |
| `S0-PER-004` | setupMs_stress | 4815.973 | ms |
| `S0-PER-004` | warmupMs_stress | 1800.768 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 1402.984 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 1402.984 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 1549.454 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 1549.454 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 1476.219 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 73.235 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 506.176 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 506.176 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 558.559 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 558.559 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 532.367 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 26.192 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.013 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 842.896 | ms |

## Repeated live campaigns

| Campaign | Report | Raw evidence |
|---|---|---|
| campaign-1 | [report](campaign-1/outcome.md) | [JSON](campaign-1/raw-results.json) |
| campaign-2 | [report](campaign-2/outcome.md) | [JSON](campaign-2/raw-results.json) |
| campaign-3 | [report](campaign-3/outcome.md) | [JSON](campaign-3/raw-results.json) |

### Between-campaign variability

| Metric | Samples | Minimum | p50 | p95 | Maximum | Mean | Std. dev. |
|---|---:|---:|---:|---:|---:|---:|---:|
| setupMs_small | 3 | 3864.358 | 4017.743 | 4212.717 | 4212.717 | 4031.606 | 174.593 |
| warmupMs_small | 3 | 1288.715 | 1290.076 | 1302.894 | 1302.894 | 1293.895 | 7.823 |
| remoteCasMinMs_small | 3 | 969.832 | 988.029 | 1018.488 | 1018.488 | 992.116 | 24.584 |
| remoteCasP50Ms_small | 3 | 996.801 | 1053.328 | 1089.275 | 1089.275 | 1046.468 | 46.617 |
| remoteCasP95Ms_small | 3 | 1072.034 | 1178.071 | 1373.146 | 1373.146 | 1207.750 | 152.735 |
| remoteCasMaxMs_small | 3 | 1072.034 | 1178.071 | 1373.146 | 1373.146 | 1207.750 | 152.735 |
| remoteCasMeanMs_small | 3 | 1009.319 | 1092.490 | 1131.387 | 1131.387 | 1077.732 | 62.358 |
| remoteCasStdDevMs_small | 3 | 32.185 | 60.047 | 133.648 | 133.648 | 75.293 | 52.422 |
| collaboratorDiscoveryMinMs_small | 3 | 419.915 | 423.082 | 430.285 | 430.285 | 424.427 | 5.314 |
| collaboratorDiscoveryP50Ms_small | 3 | 439.349 | 442.681 | 473.633 | 473.633 | 451.888 | 18.906 |
| collaboratorDiscoveryP95Ms_small | 3 | 543.527 | 604.758 | 940.384 | 940.384 | 696.223 | 213.654 |
| collaboratorDiscoveryMaxMs_small | 3 | 543.527 | 604.758 | 940.384 | 940.384 | 696.223 | 213.654 |
| collaboratorDiscoveryMeanMs_small | 3 | 462.816 | 478.151 | 530.058 | 530.058 | 490.341 | 35.240 |
| collaboratorDiscoveryStdDevMs_small | 3 | 39.834 | 64.168 | 184.965 | 184.965 | 96.322 | 77.725 |
| cleanupMs_small | 3 | 0.049 | 0.057 | 0.068 | 0.068 | 0.058 | 0.010 |
| setupMs_medium | 3 | 3875.406 | 3885.747 | 4148.745 | 4148.745 | 3969.966 | 154.914 |
| warmupMs_medium | 3 | 1323.709 | 1410.935 | 1423.830 | 1423.830 | 1386.158 | 54.465 |
| remoteCasMinMs_medium | 3 | 1027.864 | 1070.487 | 1101.140 | 1101.140 | 1066.497 | 36.800 |
| remoteCasP50Ms_medium | 3 | 1068.961 | 1135.059 | 1159.446 | 1159.446 | 1121.155 | 46.818 |
| remoteCasP95Ms_medium | 3 | 1163.177 | 1225.648 | 1381.901 | 1381.901 | 1256.909 | 112.663 |
| remoteCasMaxMs_medium | 3 | 1163.177 | 1225.648 | 1381.901 | 1381.901 | 1256.909 | 112.663 |
| remoteCasMeanMs_medium | 3 | 1092.606 | 1175.490 | 1181.288 | 1181.288 | 1149.795 | 49.612 |
| remoteCasStdDevMs_medium | 3 | 49.800 | 50.120 | 118.910 | 118.910 | 72.944 | 39.809 |
| collaboratorDiscoveryMinMs_medium | 3 | 425.660 | 450.105 | 457.374 | 457.374 | 444.379 | 16.614 |
| collaboratorDiscoveryP50Ms_medium | 3 | 436.642 | 454.029 | 459.116 | 459.116 | 449.929 | 11.785 |
| collaboratorDiscoveryP95Ms_medium | 3 | 447.847 | 476.508 | 551.514 | 551.514 | 491.956 | 53.532 |
| collaboratorDiscoveryMaxMs_medium | 3 | 447.847 | 476.508 | 551.514 | 551.514 | 491.956 | 53.532 |
| collaboratorDiscoveryMeanMs_medium | 3 | 438.692 | 463.371 | 497.752 | 497.752 | 466.605 | 29.663 |
| collaboratorDiscoveryStdDevMs_medium | 3 | 8.559 | 11.463 | 40.778 | 40.778 | 20.266 | 17.823 |
| cleanupMs_medium | 3 | 0.010 | 0.029 | 0.078 | 0.078 | 0.039 | 0.035 |
| setupMs_stress | 3 | 4586.048 | 4883.539 | 4978.331 | 4978.331 | 4815.973 | 204.683 |
| warmupMs_stress | 3 | 1748.795 | 1793.372 | 1860.138 | 1860.138 | 1800.768 | 56.039 |
| remoteCasMinMs_stress | 3 | 1299.008 | 1403.489 | 1506.455 | 1506.455 | 1402.984 | 103.725 |
| remoteCasP50Ms_stress | 3 | 1299.008 | 1403.489 | 1506.455 | 1506.455 | 1402.984 | 103.725 |
| remoteCasP95Ms_stress | 3 | 1333.473 | 1514.915 | 1799.974 | 1799.974 | 1549.454 | 235.161 |
| remoteCasMaxMs_stress | 3 | 1333.473 | 1514.915 | 1799.974 | 1799.974 | 1549.454 | 235.161 |
| remoteCasMeanMs_stress | 3 | 1316.241 | 1459.202 | 1653.215 | 1653.215 | 1476.219 | 169.130 |
| remoteCasStdDevMs_stress | 3 | 17.232 | 55.713 | 146.760 | 146.760 | 73.235 | 66.518 |
| collaboratorDiscoveryMinMs_stress | 3 | 472.738 | 493.287 | 552.503 | 552.503 | 506.176 | 41.415 |
| collaboratorDiscoveryP50Ms_stress | 3 | 472.738 | 493.287 | 552.503 | 552.503 | 506.176 | 41.415 |
| collaboratorDiscoveryP95Ms_stress | 3 | 501.705 | 517.548 | 656.423 | 656.423 | 558.559 | 85.122 |
| collaboratorDiscoveryMaxMs_stress | 3 | 501.705 | 517.548 | 656.423 | 656.423 | 558.559 | 85.122 |
| collaboratorDiscoveryMeanMs_stress | 3 | 487.221 | 505.417 | 604.463 | 604.463 | 532.367 | 63.096 |
| collaboratorDiscoveryStdDevMs_stress | 3 | 12.131 | 14.484 | 51.960 | 51.960 | 26.192 | 22.347 |
| cleanupMs_stress | 3 | 0.007 | 0.011 | 0.020 | 0.020 | 0.013 | 0.007 |
| throttleFailureLatencyMs | 3 | 811.372 | 835.290 | 882.027 | 882.027 | 842.896 | 35.936 |

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
