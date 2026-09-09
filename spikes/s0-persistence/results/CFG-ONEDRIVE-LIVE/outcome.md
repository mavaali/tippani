# S0 Outcome: CFG-ONEDRIVE-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3-campaign-aggregate
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
| Pass | 21 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 0 | Applicable, but a prerequisite is unavailable |
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
| Temporary store root | tippani-s0-s0-onedrive-live-c1-1788212697875-v0tuCn |
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
| `S0-COL-002` | absolute | Pass | 10344.829 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 14018.217 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 6143.723 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 8228.166 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 9499.537 | accounts=1; clientProcesses=2; changeMechanism=Graph drive-item polling; observedGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"Graph drive-item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":1360}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"Graph drive-item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":1047}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"Graph drive-item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":919}}} | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Pass | 9418.085 | winners=1; staleConflicts=1; durableGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 10500.300 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=35137; campaigns={"campaign-1":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35137},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35137},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35137},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Pass | 42.907 | syncClientState=Personal OneDrive sync client running; same-device compatibility probe; probe=same-device simultaneous file handles in a synced folder; observedActor=client-2; conflictFilesCreated=0; providerApiCasUsed=false; limitation=Compatibility probe only; a second synced device is required for true sync-conflict evidence.; separateCompatibilityReport=../CFG-ONEDRIVE-SYNC/outcome.md; providerCampaigns=Not part of provider-API CAS campaigns | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Pass | 3573.799 | workspaceIdPreserved=true; generation=1; receipt=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 7229.890 | recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 11454.594 | restoredGeneration=2; oneHead=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 5299.142 | outageRejected=true; recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 8506.556 | discoveredNewerAuthority=true; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 1.200 | providerPreflightRejected=true; errorCount=8; campaigns={"campaign-1":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.963 | corporateFallbackImpossible=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 1.286 | syntheticFixtureAccepted=true; actualDataRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 0.737 | configSecretRejected=true; workspaceHasNoSecrets=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.834 | ownedAuthorized=true; foreignRefused=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 1.023 | nonPositiveBudgetsRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 52347.915 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=5; bytesPerMutation_small=11546.167; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=30; requestBytes_small=16098; responseBytes_small=53179; repetitions_medium=4; requestsPerMutation_medium=5; bytesPerMutation_medium=78510.25; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=20; requestBytes_medium=100016; responseBytes_medium=214025; repetitions_stress=2; requestsPerMutation_stress=5; bytesPerMutation_stress=1442167.5; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=10; requestBytes_stress=959112; responseBytes_stress=1925223; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state; campaigns={"campaign-1":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[1578.6331000000064,1388.987300000008,1340.4600999999966,1573.8515000000043,1601.1493000000046,1347.063799999989],"collaboratorDiscoveryMs":[979.5963000000047,964.6277999999875,863.5829999999987,987.4146999999939,806.6912999999913,1144.5792000000074],"requestsPerMutation":[5,5,5,5,5,5],"transferredBytesPerMutation":[11112,11285,11459,11633,11807,11981],"requestBytesPerMutation":[2538,2596,2654,2712,2770,2828],"responseBytesPerMutation":[8574,8689,8805,8921,9037,9153],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1606.9068000000116,1386.122199999998,1825.8312999999907,2220.9389000000083],"collaboratorDiscoveryMs":[886.0834000000032,1693.9140999999945,969.8904000000039,925.194599999988],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[78250,78423,78597,78771],"requestBytesPerMutation":[24917,24975,25033,25091],"responseBytesPerMutation":[53333,53448,53564,53680],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1512.2682000000204,1539.3804999999993],"collaboratorDiscoveryMs":[943.8048000000126,917.693500000023],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1442081,1442254],"requestBytesPerMutation":[479527,479585],"responseBytesPerMutation":[962554,962669],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5,"bytesPerMutation_small":11546.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":30,"requestBytes_small":16098,"responseBytes_small":53179,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":78510.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":100016,"responseBytes_medium":214025,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1442167.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":959112,"responseBytes_stress":1925223,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":6202.1919999999955,"warmupMs_small":3054.543000000005,"remoteCasMinMs_small":1340.4600999999966,"remoteCasP50Ms_small":1388.987300000008,"remoteCasP95Ms_small":1601.1493000000046,"remoteCasMaxMs_small":1601.1493000000046,"remoteCasMeanMs_small":1471.6908500000015,"remoteCasStdDevMs_small":114.18276434424531,"collaboratorDiscoveryMinMs_small":806.6912999999913,"collaboratorDiscoveryP50Ms_small":964.6277999999875,"collaboratorDiscoveryP95Ms_small":1144.5792000000074,"collaboratorDiscoveryMaxMs_small":1144.5792000000074,"collaboratorDiscoveryMeanMs_small":957.7487166666639,"collaboratorDiscoveryStdDevMs_small":106.45489191834072,"cleanupMs_small":0.09260000000358559,"setupMs_medium":5289.165500000003,"warmupMs_medium":2584.309799999988,"remoteCasMinMs_medium":1386.122199999998,"remoteCasP50Ms_medium":1606.9068000000116,"remoteCasP95Ms_medium":2220.9389000000083,"remoteCasMaxMs_medium":2220.9389000000083,"remoteCasMeanMs_medium":1759.9498000000021,"remoteCasStdDevMs_medium":308.22903689132875,"collaboratorDiscoveryMinMs_medium":886.0834000000032,"collaboratorDiscoveryP50Ms_medium":925.194599999988,"collaboratorDiscoveryP95Ms_medium":1693.9140999999945,"collaboratorDiscoveryMaxMs_medium":1693.9140999999945,"collaboratorDiscoveryMeanMs_medium":1118.7706249999974,"collaboratorDiscoveryStdDevMs_medium":333.38054845931066,"cleanupMs_medium":0.007499999977881089,"setupMs_stress":7051.2602999999945,"warmupMs_stress":3737.6594999999797,"remoteCasMinMs_stress":1512.2682000000204,"remoteCasP50Ms_stress":1512.2682000000204,"remoteCasP95Ms_stress":1539.3804999999993,"remoteCasMaxMs_stress":1539.3804999999993,"remoteCasMeanMs_stress":1525.8243500000099,"remoteCasStdDevMs_stress":13.55614999998943,"collaboratorDiscoveryMinMs_stress":917.693500000023,"collaboratorDiscoveryP50Ms_stress":917.693500000023,"collaboratorDiscoveryP95Ms_stress":943.8048000000126,"collaboratorDiscoveryMaxMs_stress":943.8048000000126,"collaboratorDiscoveryMeanMs_stress":930.7491500000178,"collaboratorDiscoveryStdDevMs_stress":13.055649999994785,"cleanupMs_stress":0.006400000012945384,"throttleFailureLatencyMs":2161.9349999999977}},"campaign-2":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[1701.257099999988,1614.3782999999967,1590.6173000000126,1637.5721000000049,1476.2553000000044,1419.330799999996],"collaboratorDiscoveryMs":[864.4817000000039,795.5810999999958,1014.0578000000096,1043.467399999994,1992.8633999999875,839.3191999999981],"requestsPerMutation":[5,5,5,5,5,5],"transferredBytesPerMutation":[11112,11285,11459,11633,11807,11981],"requestBytesPerMutation":[2538,2596,2654,2712,2770,2828],"responseBytesPerMutation":[8574,8689,8805,8921,9037,9153],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1576.058600000004,1495.5557000000117,1560.3021000000008,1928.6772999999957],"collaboratorDiscoveryMs":[1034.73520000001,1033.6340999999957,1151.6285000000062,906.2906999999977],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[78250,78423,78597,78771],"requestBytesPerMutation":[24917,24975,25033,25091],"responseBytesPerMutation":[53333,53448,53564,53680],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1973.8359000000055,1765.7431999999972],"collaboratorDiscoveryMs":[1064.4158999999927,878.2580000000016],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1442081,1442254],"requestBytesPerMutation":[479527,479585],"responseBytesPerMutation":[962554,962669],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5,"bytesPerMutation_small":11546.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":30,"requestBytes_small":16098,"responseBytes_small":53179,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":78510.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":100016,"responseBytes_medium":214025,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1442167.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":959112,"responseBytes_stress":1925223,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":5336.143800000005,"warmupMs_small":2845.396000000008,"remoteCasMinMs_small":1419.330799999996,"remoteCasP50Ms_small":1590.6173000000126,"remoteCasP95Ms_small":1701.257099999988,"remoteCasMaxMs_small":1701.257099999988,"remoteCasMeanMs_small":1573.2351500000004,"remoteCasStdDevMs_small":96.27685859245813,"collaboratorDiscoveryMinMs_small":795.5810999999958,"collaboratorDiscoveryP50Ms_small":864.4817000000039,"collaboratorDiscoveryP95Ms_small":1992.8633999999875,"collaboratorDiscoveryMaxMs_small":1992.8633999999875,"collaboratorDiscoveryMeanMs_small":1091.6284333333315,"collaboratorDiscoveryStdDevMs_small":413.00943586742085,"cleanupMs_small":0.03509999999369029,"setupMs_medium":5711.18710000001,"warmupMs_medium":2593.735799999995,"remoteCasMinMs_medium":1495.5557000000117,"remoteCasP50Ms_medium":1560.3021000000008,"remoteCasP95Ms_medium":1928.6772999999957,"remoteCasMaxMs_medium":1928.6772999999957,"remoteCasMeanMs_medium":1640.148425000003,"remoteCasStdDevMs_medium":169.2918405566413,"collaboratorDiscoveryMinMs_medium":906.2906999999977,"collaboratorDiscoveryP50Ms_medium":1033.6340999999957,"collaboratorDiscoveryP95Ms_medium":1151.6285000000062,"collaboratorDiscoveryMaxMs_medium":1151.6285000000062,"collaboratorDiscoveryMeanMs_medium":1031.5721250000024,"collaboratorDiscoveryStdDevMs_medium":86.78021867414485,"cleanupMs_medium":0.006399999983841553,"setupMs_stress":5637.116899999994,"warmupMs_stress":2733.342499999999,"remoteCasMinMs_stress":1765.7431999999972,"remoteCasP50Ms_stress":1765.7431999999972,"remoteCasP95Ms_stress":1973.8359000000055,"remoteCasMaxMs_stress":1973.8359000000055,"remoteCasMeanMs_stress":1869.7895500000013,"remoteCasStdDevMs_stress":104.04635000000417,"collaboratorDiscoveryMinMs_stress":878.2580000000016,"collaboratorDiscoveryP50Ms_stress":878.2580000000016,"collaboratorDiscoveryP95Ms_stress":1064.4158999999927,"collaboratorDiscoveryMaxMs_stress":1064.4158999999927,"collaboratorDiscoveryMeanMs_stress":971.3369499999972,"collaboratorDiscoveryStdDevMs_stress":93.07894999999553,"cleanupMs_stress":0.005999999993946403,"throttleFailureLatencyMs":1828.5909000000102}},"campaign-3":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[1622.2817000000068,1343.7946999999986,1541.392200000002,1300.1265999999887,1417.3847999999998,1454.8241000000125],"collaboratorDiscoveryMs":[1032.3129000000044,734.4682999999932,1070.1742999999988,928.1358999999939,763.9735999999975,929.8687000000064],"requestsPerMutation":[5,5,5,5,5,5],"transferredBytesPerMutation":[11112,11285,11459,11633,11807,11981],"requestBytesPerMutation":[2538,2596,2654,2712,2770,2828],"responseBytesPerMutation":[8574,8689,8805,8921,9037,9153],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[1734.3046999999933,1507.3865000000078,1453.7997000000032,1494.790399999998],"collaboratorDiscoveryMs":[835.5786999999982,794.114699999991,890.7397000000055,753.3338999999978],"requestsPerMutation":[5,5,5,5],"transferredBytesPerMutation":[78250,78423,78597,78771],"requestBytesPerMutation":[24917,24975,25033,25091],"responseBytesPerMutation":[53333,53448,53564,53680],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[1790.833100000018,1827.5319000000018],"collaboratorDiscoveryMs":[873.9076999999816,955.6105999999854],"requestsPerMutation":[5,5],"transferredBytesPerMutation":[1442081,1442254],"requestBytesPerMutation":[479527,479585],"responseBytesPerMutation":[962554,962669],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":5,"bytesPerMutation_small":11546.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":30,"requestBytes_small":16098,"responseBytes_small":53179,"repetitions_medium":4,"requestsPerMutation_medium":5,"bytesPerMutation_medium":78510.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":20,"requestBytes_medium":100016,"responseBytes_medium":214025,"repetitions_stress":2,"requestsPerMutation_stress":5,"bytesPerMutation_stress":1442167.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":10,"requestBytes_stress":959112,"responseBytes_stress":1925223,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":5924.705799999996,"warmupMs_small":2969.3917999999976,"remoteCasMinMs_small":1300.1265999999887,"remoteCasP50Ms_small":1417.3847999999998,"remoteCasP95Ms_small":1622.2817000000068,"remoteCasMaxMs_small":1622.2817000000068,"remoteCasMeanMs_small":1446.634016666668,"remoteCasStdDevMs_small":110.14699594968152,"collaboratorDiscoveryMinMs_small":734.4682999999932,"collaboratorDiscoveryP50Ms_small":928.1358999999939,"collaboratorDiscoveryP95Ms_small":1070.1742999999988,"collaboratorDiscoveryMaxMs_small":1070.1742999999988,"collaboratorDiscoveryMeanMs_small":909.8222833333324,"collaboratorDiscoveryStdDevMs_small":124.81641565246413,"cleanupMs_small":0.02749999999650754,"setupMs_medium":5318.579500000007,"warmupMs_medium":2353.6600000000035,"remoteCasMinMs_medium":1453.7997000000032,"remoteCasP50Ms_medium":1494.790399999998,"remoteCasP95Ms_medium":1734.3046999999933,"remoteCasMaxMs_medium":1734.3046999999933,"remoteCasMeanMs_medium":1547.5703250000006,"remoteCasStdDevMs_medium":109.61651015490776,"collaboratorDiscoveryMinMs_medium":753.3338999999978,"collaboratorDiscoveryP50Ms_medium":794.114699999991,"collaboratorDiscoveryP95Ms_medium":890.7397000000055,"collaboratorDiscoveryMaxMs_medium":890.7397000000055,"collaboratorDiscoveryMeanMs_medium":818.4417499999981,"collaboratorDiscoveryStdDevMs_medium":50.87117583374563,"cleanupMs_medium":0.014200000005075708,"setupMs_stress":6094.9214000000065,"warmupMs_stress":2760.171199999997,"remoteCasMinMs_stress":1790.833100000018,"remoteCasP50Ms_stress":1790.833100000018,"remoteCasP95Ms_stress":1827.5319000000018,"remoteCasMaxMs_stress":1827.5319000000018,"remoteCasMeanMs_stress":1809.18250000001,"remoteCasStdDevMs_stress":18.349399999991874,"collaboratorDiscoveryMinMs_stress":873.9076999999816,"collaboratorDiscoveryP50Ms_stress":873.9076999999816,"collaboratorDiscoveryP95Ms_stress":955.6105999999854,"collaboratorDiscoveryMaxMs_stress":955.6105999999854,"collaboratorDiscoveryMeanMs_stress":914.7591499999835,"collaboratorDiscoveryStdDevMs_stress":40.85145000000193,"cleanupMs_stress":0.007400000002235174,"throttleFailureLatencyMs":1978.8341000000073}}} | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.493 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=3; test=4; migration=3; deployment=3; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Microsoft Graph drive API and delegated authentication","implementation":"Graph drive-item envelope with ETag CAS and version history","test":"Live sandbox, concurrency, offline, failure, version, and cleanup coverage","migration":"Receipt-gated local-to-drive rehome","deployment":"Delegated credential, drive coordinates, and approved namespace","maintenance":"Graph API and OneDrive consistency behavior","diagnostics":"Provider responses, request telemetry, and authoritative generation state","recovery":"Version history plus offline conflict reconciliation"}; total=24; mean=3; campaigns={"campaign-1":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Microsoft Graph drive API and delegated authentication","implementation":"Graph drive-item envelope with ETag CAS and version history","test":"Live sandbox, concurrency, offline, failure, version, and cleanup coverage","migration":"Receipt-gated local-to-drive rehome","deployment":"Delegated credential, drive coordinates, and approved namespace","maintenance":"Graph API and OneDrive consistency behavior","diagnostics":"Provider responses, request telemetry, and authoritative generation state","recovery":"Version history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Microsoft Graph drive API and delegated authentication","implementation":"Graph drive-item envelope with ETag CAS and version history","test":"Live sandbox, concurrency, offline, failure, version, and cleanup coverage","migration":"Receipt-gated local-to-drive rehome","deployment":"Delegated credential, drive coordinates, and approved namespace","maintenance":"Graph API and OneDrive consistency behavior","diagnostics":"Provider responses, request telemetry, and authoritative generation state","recovery":"Version history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Microsoft Graph drive API and delegated authentication","implementation":"Graph drive-item envelope with ETag CAS and version history","test":"Live sandbox, concurrency, offline, failure, version, and cleanup coverage","migration":"Receipt-gated local-to-drive rehome","deployment":"Delegated credential, drive coordinates, and approved namespace","maintenance":"Graph API and OneDrive consistency behavior","diagnostics":"Provider responses, request telemetry, and authoritative generation state","recovery":"Version history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}}} | [JSON](raw-results.json) |

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
| `S0-COL-006` | collaboratorDiscoveryMs | 1108.667 | ms |
| `S0-BCK-006` | syncedFolderCreateMs | 12.617 | ms |
| `S0-PER-004` | setupMs_small | 5821.014 | ms |
| `S0-PER-004` | warmupMs_small | 2956.444 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 1353.306 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 1465.663 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 1641.563 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 1641.563 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 1497.187 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 106.869 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 778.914 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 919.082 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 1402.539 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 1402.539 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 986.400 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 214.760 | ms |
| `S0-PER-004` | cleanupMs_small | 0.052 | ms |
| `S0-PER-004` | setupMs_medium | 5439.644 | ms |
| `S0-PER-004` | warmupMs_medium | 2510.569 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 1445.159 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 1554.000 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 1961.307 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 1961.307 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 1649.223 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 195.712 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 848.569 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 917.648 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 1245.427 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 1245.427 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 989.595 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 157.011 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.009 | ms |
| `S0-PER-004` | setupMs_stress | 6261.100 | ms |
| `S0-PER-004` | warmupMs_stress | 3077.058 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 1689.615 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 1689.615 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 1780.249 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 1780.249 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 1734.932 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 45.317 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 889.953 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 889.953 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 987.944 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 987.944 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 938.948 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 48.995 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.007 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 1989.787 | ms |

## Repeated live campaigns

| Campaign | Report | Raw evidence |
|---|---|---|
| campaign-1 | [report](campaign-1/outcome.md) | [JSON](campaign-1/raw-results.json) |
| campaign-2 | [report](campaign-2/outcome.md) | [JSON](campaign-2/raw-results.json) |
| campaign-3 | [report](campaign-3/outcome.md) | [JSON](campaign-3/raw-results.json) |

### Between-campaign variability

| Metric | Samples | Minimum | p50 | p95 | Maximum | Mean | Std. dev. |
|---|---:|---:|---:|---:|---:|---:|---:|
| setupMs_small | 3 | 5336.144 | 5924.706 | 6202.192 | 6202.192 | 5821.014 | 442.237 |
| warmupMs_small | 3 | 2845.396 | 2969.392 | 3054.543 | 3054.543 | 2956.444 | 105.173 |
| remoteCasMinMs_small | 3 | 1300.127 | 1340.460 | 1419.331 | 1419.331 | 1353.306 | 60.631 |
| remoteCasP50Ms_small | 3 | 1388.987 | 1417.385 | 1590.617 | 1590.617 | 1465.663 | 109.141 |
| remoteCasP95Ms_small | 3 | 1601.149 | 1622.282 | 1701.257 | 1701.257 | 1641.563 | 52.766 |
| remoteCasMaxMs_small | 3 | 1601.149 | 1622.282 | 1701.257 | 1701.257 | 1641.563 | 52.766 |
| remoteCasMeanMs_small | 3 | 1446.634 | 1471.691 | 1573.235 | 1573.235 | 1497.187 | 67.041 |
| remoteCasStdDevMs_small | 3 | 96.277 | 110.147 | 114.183 | 114.183 | 106.869 | 9.392 |
| collaboratorDiscoveryMinMs_small | 3 | 734.468 | 795.581 | 806.691 | 806.691 | 778.914 | 38.890 |
| collaboratorDiscoveryP50Ms_small | 3 | 864.482 | 928.136 | 964.628 | 964.628 | 919.082 | 50.683 |
| collaboratorDiscoveryP95Ms_small | 3 | 1070.174 | 1144.579 | 1992.863 | 1992.863 | 1402.539 | 512.588 |
| collaboratorDiscoveryMaxMs_small | 3 | 1070.174 | 1144.579 | 1992.863 | 1992.863 | 1402.539 | 512.588 |
| collaboratorDiscoveryMeanMs_small | 3 | 909.822 | 957.749 | 1091.628 | 1091.628 | 986.400 | 94.229 |
| collaboratorDiscoveryStdDevMs_small | 3 | 106.455 | 124.816 | 413.009 | 413.009 | 214.760 | 171.934 |
| cleanupMs_small | 3 | 0.027 | 0.035 | 0.093 | 0.093 | 0.052 | 0.036 |
| setupMs_medium | 3 | 5289.166 | 5318.580 | 5711.187 | 5711.187 | 5439.644 | 235.623 |
| warmupMs_medium | 3 | 2353.660 | 2584.310 | 2593.736 | 2593.736 | 2510.569 | 135.968 |
| remoteCasMinMs_medium | 3 | 1386.122 | 1453.800 | 1495.556 | 1495.556 | 1445.159 | 55.226 |
| remoteCasP50Ms_medium | 3 | 1494.790 | 1560.302 | 1606.907 | 1606.907 | 1554.000 | 56.323 |
| remoteCasP95Ms_medium | 3 | 1734.305 | 1928.677 | 2220.939 | 2220.939 | 1961.307 | 244.953 |
| remoteCasMaxMs_medium | 3 | 1734.305 | 1928.677 | 2220.939 | 2220.939 | 1961.307 | 244.953 |
| remoteCasMeanMs_medium | 3 | 1547.570 | 1640.148 | 1759.950 | 1759.950 | 1649.223 | 106.480 |
| remoteCasStdDevMs_medium | 3 | 109.617 | 169.292 | 308.229 | 308.229 | 195.712 | 101.908 |
| collaboratorDiscoveryMinMs_medium | 3 | 753.334 | 886.083 | 906.291 | 906.291 | 848.569 | 83.093 |
| collaboratorDiscoveryP50Ms_medium | 3 | 794.115 | 925.195 | 1033.634 | 1033.634 | 917.648 | 119.938 |
| collaboratorDiscoveryP95Ms_medium | 3 | 890.740 | 1151.629 | 1693.914 | 1693.914 | 1245.427 | 409.721 |
| collaboratorDiscoveryMaxMs_medium | 3 | 890.740 | 1151.629 | 1693.914 | 1693.914 | 1245.427 | 409.721 |
| collaboratorDiscoveryMeanMs_medium | 3 | 818.442 | 1031.572 | 1118.771 | 1118.771 | 989.595 | 154.502 |
| collaboratorDiscoveryStdDevMs_medium | 3 | 50.871 | 86.780 | 333.381 | 333.381 | 157.011 | 153.792 |
| cleanupMs_medium | 3 | 0.006 | 0.007 | 0.014 | 0.014 | 0.009 | 0.004 |
| setupMs_stress | 3 | 5637.117 | 6094.921 | 7051.260 | 7051.260 | 6261.100 | 721.569 |
| warmupMs_stress | 3 | 2733.342 | 2760.171 | 3737.659 | 3737.659 | 3077.058 | 572.255 |
| remoteCasMinMs_stress | 3 | 1512.268 | 1765.743 | 1790.833 | 1790.833 | 1689.615 | 154.098 |
| remoteCasP50Ms_stress | 3 | 1512.268 | 1765.743 | 1790.833 | 1790.833 | 1689.615 | 154.098 |
| remoteCasP95Ms_stress | 3 | 1539.380 | 1827.532 | 1973.836 | 1973.836 | 1780.249 | 221.053 |
| remoteCasMaxMs_stress | 3 | 1539.380 | 1827.532 | 1973.836 | 1973.836 | 1780.249 | 221.053 |
| remoteCasMeanMs_stress | 3 | 1525.824 | 1809.183 | 1869.790 | 1869.790 | 1734.932 | 183.611 |
| remoteCasStdDevMs_stress | 3 | 13.556 | 18.349 | 104.046 | 104.046 | 45.317 | 50.917 |
| collaboratorDiscoveryMinMs_stress | 3 | 873.908 | 878.258 | 917.694 | 917.694 | 889.953 | 24.122 |
| collaboratorDiscoveryP50Ms_stress | 3 | 873.908 | 878.258 | 917.694 | 917.694 | 889.953 | 24.122 |
| collaboratorDiscoveryP95Ms_stress | 3 | 943.805 | 955.611 | 1064.416 | 1064.416 | 987.944 | 66.489 |
| collaboratorDiscoveryMaxMs_stress | 3 | 943.805 | 955.611 | 1064.416 | 1064.416 | 987.944 | 66.489 |
| collaboratorDiscoveryMeanMs_stress | 3 | 914.759 | 930.749 | 971.337 | 971.337 | 938.948 | 29.166 |
| collaboratorDiscoveryStdDevMs_stress | 3 | 13.056 | 40.851 | 93.079 | 93.079 | 48.995 | 40.628 |
| cleanupMs_stress | 3 | 0.006 | 0.006 | 0.007 | 0.007 | 0.007 | 0.001 |
| throttleFailureLatencyMs | 3 | 1828.591 | 1978.834 | 2161.935 | 2161.935 | 1989.787 | 166.942 |

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
