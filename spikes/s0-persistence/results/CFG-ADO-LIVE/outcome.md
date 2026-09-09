# S0 Outcome: CFG-ADO-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3-campaign-aggregate
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
| Temporary store root | tippani-s0-s0-ado-live-c1-1788212697875-P9vy9c |
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
| `S0-COL-002` | absolute | Pass | 3232.452 | accounts=1; clientProcesses=2; logicalActors=Synthetic Client 1,Synthetic Client 2; winners=1; staleConflicts=1; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"logicalActors":"Synthetic Client 1,Synthetic Client 2","winners":1,"staleConflicts":1,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Pass | 4168.712 | accounts=1; clientProcesses=2; staleGeneration=0; reloadedGeneration=1; reconciledGeneration=2; deterministicReconnect=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"staleGeneration":0,"reloadedGeneration":1,"reconciledGeneration":2,"deterministicReconnect":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Pass | 1762.099 | lostResponseDetected=true; noDuplicate=true; reconciledGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"lostResponseDetected":true,"noDuplicate":true,"reconciledGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Pass | 2619.794 | offlinePendingConflicted=true; noSilentOverwrite=true; authorityGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"offlinePendingConflicted":true,"noSilentOverwrite":true,"authorityGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Pass | 3225.754 | accounts=1; clientProcesses=2; changeMechanism=ADO branch/ref and item polling; observedGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"ADO branch/ref and item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":329}},"campaign-2":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"ADO branch/ref and item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":396}},"campaign-3":{"status":"Pass","evidence":{"accounts":1,"clientProcesses":2,"changeMechanism":"ADO branch/ref and item polling","observedGeneration":1},"measurements":{"collaboratorDiscoveryMs":438}}} | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Pass | 2216.894 | winners=1; staleConflicts=1; durableGeneration=2; campaigns={"campaign-1":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"winners":1,"staleConflicts":1,"durableGeneration":2},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Pass | 2026.190 | faultsRejected=3; generationUnchanged=true; throttleResponses=1; retries=0; transferredBytes=35900; campaigns={"campaign-1":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35900},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35900},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"faultsRejected":3,"generationUnchanged":true,"throttleResponses":1,"retries":0,"transferredBytes":35900},"measurements":{}}} | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Pass | 1050.019 | workspaceIdPreserved=true; generation=1; receipt=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"workspaceIdPreserved":true,"generation":1,"receipt":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Pass | 2293.824 | recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Pass | 3447.895 | restoredGeneration=2; oneHead=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"restoredGeneration":2,"oneHead":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Pass | 1706.934 | outageRejected=true; recoveredGeneration=1; campaigns={"campaign-1":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"outageRejected":true,"recoveredGeneration":1},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Pass | 2247.812 | discoveredNewerAuthority=true; noSilentOverwrite=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"discoveredNewerAuthority":true,"noSilentOverwrite":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Pass | 0.854 | providerPreflightRejected=true; errorCount=8; campaigns={"campaign-1":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"providerPreflightRejected":true,"errorCount":8},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Pass | 0.627 | corporateFallbackImpossible=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"corporateFallbackImpossible":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Pass | 1.082 | syntheticFixtureAccepted=true; actualDataRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"syntheticFixtureAccepted":true,"actualDataRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Pass | 1.410 | configSecretRejected=true; workspaceHasNoSecrets=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"configSecretRejected":true,"workspaceHasNoSecrets":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Pass | 0.592 | ownedAuthorized=true; foreignRefused=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"ownedAuthorized":true,"foreignRefused":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Pass | 0.784 | nonPositiveBudgetsRejected=true; campaigns={"campaign-1":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"nonPositiveBudgetsRejected":true},"measurements":{}}} | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Pass | 12485.416 | scales=small,medium,stress; warmupIterations=3; timingMethod=performance.now monotonic elapsed time; reportedStatistics=min,p50,p95,max,mean,stddev; byteMethod=UTF-8 application payload bytes submitted or consumed; repetitions_small=6; requestsPerMutation_small=4; bytesPerMutation_small=9513.167; throttleResponses_small=0; retries_small=0; retryAfterSeconds_small=[]; backoffMs_small=0; requestCount_small=24; requestBytes_small=19680; responseBytes_small=37399; repetitions_medium=4; requestsPerMutation_medium=4; bytesPerMutation_medium=78099.25; throttleResponses_medium=0; retries_medium=0; retryAfterSeconds_medium=[]; backoffMs_medium=0; requestCount_medium=16; requestBytes_medium=108896; responseBytes_medium=203501; repetitions_stress=2; requestsPerMutation_stress=4; bytesPerMutation_stress=1474522.5; throttleResponses_stress=0; retries_stress=0; retryAfterSeconds_stress=[]; backoffMs_stress=0; requestCount_stress=8; requestBytes_stress=1029086; responseBytes_stress=1919959; throttleResponses=1; throttleRetries=0; throttleRetryAfterSeconds=[1]; throttleBackoffMs=0; throttleBehavior=typed failure; no success-shaped state; campaigns={"campaign-1":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[590.5216,532.7466000000022,486.50640000000203,540.0548999999955,707.0645000000004,581.7793999999994],"collaboratorDiscoveryMs":[108.09869999999864,93.18380000000252,106.77720000000409,107.15400000000227,132.2161999999953,110.68999999999505],"requestsPerMutation":[4,4,4,4,4,4],"transferredBytesPerMutation":[9059,9240,9422,9604,9786,9968],"requestBytesPerMutation":[3115,3181,3247,3313,3379,3445],"responseBytesPerMutation":[5944,6059,6175,6291,6407,6523],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[585.6157999999996,487.02560000000085,493.96510000000126,473.87690000000293],"collaboratorDiscoveryMs":[107.44250000000466,112.69080000000395,107.08580000000075,118.62279999999737],"requestsPerMutation":[4,4,4,4],"transferredBytesPerMutation":[77827,78008,78190,78372],"requestBytesPerMutation":[27125,27191,27257,27323],"responseBytesPerMutation":[50702,50817,50933,51049],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[982.9493999999977,1021.1298000000024],"collaboratorDiscoveryMs":[198.2193000000043,181.76859999999579],"requestsPerMutation":[4,4],"transferredBytesPerMutation":[1474432,1474613],"requestBytesPerMutation":[514510,514576],"responseBytesPerMutation":[959922,960037],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":4,"bytesPerMutation_small":9513.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":24,"requestBytes_small":19680,"responseBytes_small":37399,"repetitions_medium":4,"requestsPerMutation_medium":4,"bytesPerMutation_medium":78099.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":16,"requestBytes_medium":108896,"responseBytes_medium":203501,"repetitions_stress":2,"requestsPerMutation_stress":4,"bytesPerMutation_stress":1474522.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":8,"requestBytes_stress":1029086,"responseBytes_stress":1919959,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":697.4435999999987,"warmupMs_small":275.690300000002,"remoteCasMinMs_small":486.50640000000203,"remoteCasP50Ms_small":540.0548999999955,"remoteCasP95Ms_small":707.0645000000004,"remoteCasMaxMs_small":707.0645000000004,"remoteCasMeanMs_small":573.1122333333333,"remoteCasStdDevMs_small":68.97361522081371,"collaboratorDiscoveryMinMs_small":93.18380000000252,"collaboratorDiscoveryP50Ms_small":107.15400000000227,"collaboratorDiscoveryP95Ms_small":132.2161999999953,"collaboratorDiscoveryMaxMs_small":132.2161999999953,"collaboratorDiscoveryMeanMs_small":109.68664999999964,"collaboratorDiscoveryStdDevMs_small":11.534962744302385,"cleanupMs_small":0.04579999999987194,"setupMs_medium":827.9639000000025,"warmupMs_medium":324.4493999999977,"remoteCasMinMs_medium":473.87690000000293,"remoteCasP50Ms_medium":487.02560000000085,"remoteCasP95Ms_medium":585.6157999999996,"remoteCasMaxMs_medium":585.6157999999996,"remoteCasMeanMs_medium":510.12085000000116,"remoteCasStdDevMs_medium":44.18005833441612,"collaboratorDiscoveryMinMs_medium":107.08580000000075,"collaboratorDiscoveryP50Ms_medium":107.44250000000466,"collaboratorDiscoveryP95Ms_medium":118.62279999999737,"collaboratorDiscoveryMaxMs_medium":118.62279999999737,"collaboratorDiscoveryMeanMs_medium":111.46047500000168,"collaboratorDiscoveryStdDevMs_medium":4.692933609892326,"cleanupMs_medium":0.008399999998800922,"setupMs_stress":1430.891499999998,"warmupMs_stress":797.4582999999984,"remoteCasMinMs_stress":982.9493999999977,"remoteCasP50Ms_stress":982.9493999999977,"remoteCasP95Ms_stress":1021.1298000000024,"remoteCasMaxMs_stress":1021.1298000000024,"remoteCasMeanMs_stress":1002.0396000000001,"remoteCasStdDevMs_stress":19.09020000000237,"collaboratorDiscoveryMinMs_stress":181.76859999999579,"collaboratorDiscoveryP50Ms_stress":181.76859999999579,"collaboratorDiscoveryP95Ms_stress":198.2193000000043,"collaboratorDiscoveryMaxMs_stress":198.2193000000043,"collaboratorDiscoveryMeanMs_stress":189.99395000000004,"collaboratorDiscoveryStdDevMs_stress":8.225350000004255,"cleanupMs_stress":0.024600000004284084,"throttleFailureLatencyMs":298.18390000000363}},"campaign-2":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[451.5076000000008,549.2138999999988,488.17059999999765,500.9066000000021,480.14840000000186,513.2587999999996],"collaboratorDiscoveryMs":[86.01829999999973,88.09150000000227,81.42250000000058,85.50720000000001,96.48199999999997,78.0505000000012],"requestsPerMutation":[4,4,4,4,4,4],"transferredBytesPerMutation":[9059,9240,9422,9604,9786,9968],"requestBytesPerMutation":[3115,3181,3247,3313,3379,3445],"responseBytesPerMutation":[5944,6059,6175,6291,6407,6523],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[550.5878000000012,524.0156999999999,511.0822999999982,564.056899999996],"collaboratorDiscoveryMs":[109.96609999999782,111.02560000000085,113.08299999999872,139.49150000000373],"requestsPerMutation":[4,4,4,4],"transferredBytesPerMutation":[77827,78008,78190,78372],"requestBytesPerMutation":[27125,27191,27257,27323],"responseBytesPerMutation":[50702,50817,50933,51049],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[733.8390999999974,721.0731000000014],"collaboratorDiscoveryMs":[190.45910000000003,157.01710000000458],"requestsPerMutation":[4,4],"transferredBytesPerMutation":[1474432,1474613],"requestBytesPerMutation":[514510,514576],"responseBytesPerMutation":[959922,960037],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":4,"bytesPerMutation_small":9513.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":24,"requestBytes_small":19680,"responseBytes_small":37399,"repetitions_medium":4,"requestsPerMutation_medium":4,"bytesPerMutation_medium":78099.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":16,"requestBytes_medium":108896,"responseBytes_medium":203501,"repetitions_stress":2,"requestsPerMutation_stress":4,"bytesPerMutation_stress":1474522.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":8,"requestBytes_stress":1029086,"responseBytes_stress":1919959,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":669.7360999999983,"warmupMs_small":269.8886999999995,"remoteCasMinMs_small":451.5076000000008,"remoteCasP50Ms_small":488.17059999999765,"remoteCasP95Ms_small":549.2138999999988,"remoteCasMaxMs_small":549.2138999999988,"remoteCasMeanMs_small":497.20098333333345,"remoteCasStdDevMs_small":30.103023859982677,"collaboratorDiscoveryMinMs_small":78.0505000000012,"collaboratorDiscoveryP50Ms_small":85.50720000000001,"collaboratorDiscoveryP95Ms_small":96.48199999999997,"collaboratorDiscoveryMaxMs_small":96.48199999999997,"collaboratorDiscoveryMeanMs_small":85.9286666666673,"collaboratorDiscoveryStdDevMs_small":5.75336725772132,"cleanupMs_small":0.04460000000108266,"setupMs_medium":866.392399999997,"warmupMs_medium":449.59530000000086,"remoteCasMinMs_medium":511.0822999999982,"remoteCasP50Ms_medium":524.0156999999999,"remoteCasP95Ms_medium":564.056899999996,"remoteCasMaxMs_medium":564.056899999996,"remoteCasMeanMs_medium":537.4356749999988,"remoteCasStdDevMs_medium":20.95390247309204,"collaboratorDiscoveryMinMs_medium":109.96609999999782,"collaboratorDiscoveryP50Ms_medium":111.02560000000085,"collaboratorDiscoveryP95Ms_medium":139.49150000000373,"collaboratorDiscoveryMaxMs_medium":139.49150000000373,"collaboratorDiscoveryMeanMs_medium":118.39155000000028,"collaboratorDiscoveryStdDevMs_medium":12.233499297116452,"cleanupMs_medium":0.006900000000314321,"setupMs_stress":1403.2223000000013,"warmupMs_stress":796.3066000000035,"remoteCasMinMs_stress":721.0731000000014,"remoteCasP50Ms_stress":721.0731000000014,"remoteCasP95Ms_stress":733.8390999999974,"remoteCasMaxMs_stress":733.8390999999974,"remoteCasMeanMs_stress":727.4560999999994,"remoteCasStdDevMs_stress":6.382999999997992,"collaboratorDiscoveryMinMs_stress":157.01710000000458,"collaboratorDiscoveryP50Ms_stress":157.01710000000458,"collaboratorDiscoveryP95Ms_stress":190.45910000000003,"collaboratorDiscoveryMaxMs_stress":190.45910000000003,"collaboratorDiscoveryMeanMs_stress":173.7381000000023,"collaboratorDiscoveryStdDevMs_stress":16.72099999999773,"cleanupMs_stress":0.013500000000931323,"throttleFailureLatencyMs":284.9089000000022}},"campaign-3":{"status":"Pass","evidence":{"scales":"small,medium,stress","warmupIterations":3,"timingMethod":"performance.now monotonic elapsed time","reportedStatistics":"min,p50,p95,max,mean,stddev","byteMethod":"UTF-8 application payload bytes submitted or consumed","rawSamples":{"small":{"remoteCasMs":[585.3109999999979,600.3283999999985,576.2695999999996,573.6425999999992,485.35589999999866,497.80669999999736],"collaboratorDiscoveryMs":[120.25049999999828,107.11189999999988,108.24020000000019,267.7811999999976,107.92919999999867,98.19950000000244],"requestsPerMutation":[4,4,4,4,4,4],"transferredBytesPerMutation":[9059,9240,9422,9604,9786,9968],"requestBytesPerMutation":[3115,3181,3247,3313,3379,3445],"responseBytesPerMutation":[5944,6059,6175,6291,6407,6523],"retriesPerMutation":[0,0,0,0,0,0]},"medium":{"remoteCasMs":[560.0630999999994,596.4000999999989,680.5298000000039,536.1191000000035],"collaboratorDiscoveryMs":[89.045100000003,119.15370000000257,119.1339999999982,88.6814000000013],"requestsPerMutation":[4,4,4,4],"transferredBytesPerMutation":[77827,78008,78190,78372],"requestBytesPerMutation":[27125,27191,27257,27323],"responseBytesPerMutation":[50702,50817,50933,51049],"retriesPerMutation":[0,0,0,0]},"stress":{"remoteCasMs":[914.6995000000024,745.7131000000008],"collaboratorDiscoveryMs":[266.84470000000147,265.50670000000537],"requestsPerMutation":[4,4],"transferredBytesPerMutation":[1474432,1474613],"requestBytesPerMutation":[514510,514576],"responseBytesPerMutation":[959922,960037],"retriesPerMutation":[0,0]}},"repetitions_small":6,"requestsPerMutation_small":4,"bytesPerMutation_small":9513.167,"throttleResponses_small":0,"retries_small":0,"retryAfterSeconds_small":[],"backoffMs_small":0,"requestCount_small":24,"requestBytes_small":19680,"responseBytes_small":37399,"repetitions_medium":4,"requestsPerMutation_medium":4,"bytesPerMutation_medium":78099.25,"throttleResponses_medium":0,"retries_medium":0,"retryAfterSeconds_medium":[],"backoffMs_medium":0,"requestCount_medium":16,"requestBytes_medium":108896,"responseBytes_medium":203501,"repetitions_stress":2,"requestsPerMutation_stress":4,"bytesPerMutation_stress":1474522.5,"throttleResponses_stress":0,"retries_stress":0,"retryAfterSeconds_stress":[],"backoffMs_stress":0,"requestCount_stress":8,"requestBytes_stress":1029086,"responseBytes_stress":1919959,"throttleResponses":1,"throttleRetries":0,"throttleRetryAfterSeconds":[1],"throttleBackoffMs":0,"throttleBehavior":"typed failure; no success-shaped state"},"measurements":{"setupMs_small":826.0914000000012,"warmupMs_small":299.2052999999978,"remoteCasMinMs_small":485.35589999999866,"remoteCasP50Ms_small":573.6425999999992,"remoteCasP95Ms_small":600.3283999999985,"remoteCasMaxMs_small":600.3283999999985,"remoteCasMeanMs_small":553.1190333333319,"remoteCasStdDevMs_small":44.48503306838806,"collaboratorDiscoveryMinMs_small":98.19950000000244,"collaboratorDiscoveryP50Ms_small":107.92919999999867,"collaboratorDiscoveryP95Ms_small":267.7811999999976,"collaboratorDiscoveryMaxMs_small":267.7811999999976,"collaboratorDiscoveryMeanMs_small":134.9187499999995,"collaboratorDiscoveryStdDevMs_small":59.762436982961,"cleanupMs_small":0.044799999999668216,"setupMs_medium":788.0506999999998,"warmupMs_medium":368.2410999999993,"remoteCasMinMs_medium":536.1191000000035,"remoteCasP50Ms_medium":560.0630999999994,"remoteCasP95Ms_medium":680.5298000000039,"remoteCasMaxMs_medium":680.5298000000039,"remoteCasMeanMs_medium":593.2780250000014,"remoteCasStdDevMs_medium":54.756263438230995,"collaboratorDiscoveryMinMs_medium":88.6814000000013,"collaboratorDiscoveryP50Ms_medium":89.045100000003,"collaboratorDiscoveryP95Ms_medium":119.15370000000257,"collaboratorDiscoveryMaxMs_medium":119.15370000000257,"collaboratorDiscoveryMeanMs_medium":104.00355000000127,"collaboratorDiscoveryStdDevMs_medium":15.140847641809009,"cleanupMs_medium":0.008000000001629815,"setupMs_stress":1566.779499999997,"warmupMs_stress":830.5152000000016,"remoteCasMinMs_stress":745.7131000000008,"remoteCasP50Ms_stress":745.7131000000008,"remoteCasP95Ms_stress":914.6995000000024,"remoteCasMaxMs_stress":914.6995000000024,"remoteCasMeanMs_stress":830.2063000000016,"remoteCasStdDevMs_stress":84.4932000000008,"collaboratorDiscoveryMinMs_stress":265.50670000000537,"collaboratorDiscoveryP50Ms_stress":265.50670000000537,"collaboratorDiscoveryP95Ms_stress":266.84470000000147,"collaboratorDiscoveryMaxMs_stress":266.84470000000147,"collaboratorDiscoveryMeanMs_stress":266.1757000000034,"collaboratorDiscoveryStdDevMs_stress":0.66899999999805,"cleanupMs_stress":0.011300000005576294,"throttleFailureLatencyMs":298.5503000000026}}} | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Pass | 0.363 | scale=1=trivial, 2=low, 3=moderate, 4=high, 5=very high; dependencies=2; implementation=3; test=4; migration=3; deployment=3; maintenance=3; diagnostics=3; recovery=3; rationale={"dependencies":"Azure DevOps Git REST API and scoped authentication","implementation":"Repository envelope with branch-tip oldObjectId CAS","test":"Live repository, ref race, offline, failure, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Scoped credential, repository coordinates, and per-run branch","maintenance":"ADO Git REST API and ref semantics","diagnostics":"Provider responses, request telemetry, branch, commit, and generation state","recovery":"Auditable commit history plus offline conflict reconciliation"}; total=24; mean=3; campaigns={"campaign-1":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Azure DevOps Git REST API and scoped authentication","implementation":"Repository envelope with branch-tip oldObjectId CAS","test":"Live repository, ref race, offline, failure, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Scoped credential, repository coordinates, and per-run branch","maintenance":"ADO Git REST API and ref semantics","diagnostics":"Provider responses, request telemetry, branch, commit, and generation state","recovery":"Auditable commit history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}},"campaign-2":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Azure DevOps Git REST API and scoped authentication","implementation":"Repository envelope with branch-tip oldObjectId CAS","test":"Live repository, ref race, offline, failure, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Scoped credential, repository coordinates, and per-run branch","maintenance":"ADO Git REST API and ref semantics","diagnostics":"Provider responses, request telemetry, branch, commit, and generation state","recovery":"Auditable commit history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}},"campaign-3":{"status":"Pass","evidence":{"scale":"1=trivial, 2=low, 3=moderate, 4=high, 5=very high","dependencies":2,"implementation":3,"test":4,"migration":3,"deployment":3,"maintenance":3,"diagnostics":3,"recovery":3,"rationale":{"dependencies":"Azure DevOps Git REST API and scoped authentication","implementation":"Repository envelope with branch-tip oldObjectId CAS","test":"Live repository, ref race, offline, failure, history, and cleanup coverage","migration":"Receipt-gated local-to-repository rehome","deployment":"Scoped credential, repository coordinates, and per-run branch","maintenance":"ADO Git REST API and ref semantics","diagnostics":"Provider responses, request telemetry, branch, commit, and generation state","recovery":"Auditable commit history plus offline conflict reconciliation"},"total":24,"mean":3},"measurements":{}}} | [JSON](raw-results.json) |

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
| `S0-COL-006` | collaboratorDiscoveryMs | 387.667 | ms |
| `S0-PER-004` | setupMs_small | 731.090 | ms |
| `S0-PER-004` | warmupMs_small | 281.595 | ms |
| `S0-PER-004` | remoteCasMinMs_small | 474.457 | ms |
| `S0-PER-004` | remoteCasP50Ms_small | 533.956 | ms |
| `S0-PER-004` | remoteCasP95Ms_small | 618.869 | ms |
| `S0-PER-004` | remoteCasMaxMs_small | 618.869 | ms |
| `S0-PER-004` | remoteCasMeanMs_small | 541.144 | ms |
| `S0-PER-004` | remoteCasStdDevMs_small | 47.854 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_small | 89.811 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_small | 100.197 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_small | 165.493 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_small | 165.493 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_small | 110.178 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_small | 25.684 | ms |
| `S0-PER-004` | cleanupMs_small | 0.045 | ms |
| `S0-PER-004` | setupMs_medium | 827.469 | ms |
| `S0-PER-004` | warmupMs_medium | 380.762 | ms |
| `S0-PER-004` | remoteCasMinMs_medium | 507.026 | ms |
| `S0-PER-004` | remoteCasP50Ms_medium | 523.701 | ms |
| `S0-PER-004` | remoteCasP95Ms_medium | 610.067 | ms |
| `S0-PER-004` | remoteCasMaxMs_medium | 610.067 | ms |
| `S0-PER-004` | remoteCasMeanMs_medium | 546.945 | ms |
| `S0-PER-004` | remoteCasStdDevMs_medium | 39.963 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_medium | 101.911 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_medium | 102.504 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_medium | 125.756 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_medium | 125.756 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_medium | 111.285 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_medium | 10.689 | ms |
| `S0-PER-004` | cleanupMs_medium | 0.008 | ms |
| `S0-PER-004` | setupMs_stress | 1466.964 | ms |
| `S0-PER-004` | warmupMs_stress | 808.093 | ms |
| `S0-PER-004` | remoteCasMinMs_stress | 816.579 | ms |
| `S0-PER-004` | remoteCasP50Ms_stress | 816.579 | ms |
| `S0-PER-004` | remoteCasP95Ms_stress | 889.889 | ms |
| `S0-PER-004` | remoteCasMaxMs_stress | 889.889 | ms |
| `S0-PER-004` | remoteCasMeanMs_stress | 853.234 | ms |
| `S0-PER-004` | remoteCasStdDevMs_stress | 36.655 | ms |
| `S0-PER-004` | collaboratorDiscoveryMinMs_stress | 201.431 | ms |
| `S0-PER-004` | collaboratorDiscoveryP50Ms_stress | 201.431 | ms |
| `S0-PER-004` | collaboratorDiscoveryP95Ms_stress | 218.508 | ms |
| `S0-PER-004` | collaboratorDiscoveryMaxMs_stress | 218.508 | ms |
| `S0-PER-004` | collaboratorDiscoveryMeanMs_stress | 209.969 | ms |
| `S0-PER-004` | collaboratorDiscoveryStdDevMs_stress | 8.538 | ms |
| `S0-PER-004` | cleanupMs_stress | 0.016 | ms |
| `S0-PER-004` | throttleFailureLatencyMs | 293.881 | ms |

## Repeated live campaigns

| Campaign | Report | Raw evidence |
|---|---|---|
| campaign-1 | [report](campaign-1/outcome.md) | [JSON](campaign-1/raw-results.json) |
| campaign-2 | [report](campaign-2/outcome.md) | [JSON](campaign-2/raw-results.json) |
| campaign-3 | [report](campaign-3/outcome.md) | [JSON](campaign-3/raw-results.json) |

### Between-campaign variability

| Metric | Samples | Minimum | p50 | p95 | Maximum | Mean | Std. dev. |
|---|---:|---:|---:|---:|---:|---:|---:|
| setupMs_small | 3 | 669.736 | 697.444 | 826.091 | 826.091 | 731.090 | 83.432 |
| warmupMs_small | 3 | 269.889 | 275.690 | 299.205 | 299.205 | 281.595 | 15.525 |
| remoteCasMinMs_small | 3 | 451.508 | 485.356 | 486.506 | 486.506 | 474.457 | 19.883 |
| remoteCasP50Ms_small | 3 | 488.171 | 540.055 | 573.643 | 573.643 | 533.956 | 43.061 |
| remoteCasP95Ms_small | 3 | 549.214 | 600.328 | 707.065 | 707.065 | 618.869 | 80.542 |
| remoteCasMaxMs_small | 3 | 549.214 | 600.328 | 707.065 | 707.065 | 618.869 | 80.542 |
| remoteCasMeanMs_small | 3 | 497.201 | 553.119 | 573.112 | 573.112 | 541.144 | 39.347 |
| remoteCasStdDevMs_small | 3 | 30.103 | 44.485 | 68.974 | 68.974 | 47.854 | 19.653 |
| collaboratorDiscoveryMinMs_small | 3 | 78.051 | 93.184 | 98.200 | 98.200 | 89.811 | 10.489 |
| collaboratorDiscoveryP50Ms_small | 3 | 85.507 | 107.154 | 107.929 | 107.929 | 100.197 | 12.727 |
| collaboratorDiscoveryP95Ms_small | 3 | 96.482 | 132.216 | 267.781 | 267.781 | 165.493 | 90.368 |
| collaboratorDiscoveryMaxMs_small | 3 | 96.482 | 132.216 | 267.781 | 267.781 | 165.493 | 90.368 |
| collaboratorDiscoveryMeanMs_small | 3 | 85.929 | 109.687 | 134.919 | 134.919 | 110.178 | 24.499 |
| collaboratorDiscoveryStdDevMs_small | 3 | 5.753 | 11.535 | 59.762 | 59.762 | 25.684 | 29.654 |
| cleanupMs_small | 3 | 0.045 | 0.045 | 0.046 | 0.046 | 0.045 | 0.001 |
| setupMs_medium | 3 | 788.051 | 827.964 | 866.392 | 866.392 | 827.469 | 39.173 |
| warmupMs_medium | 3 | 324.449 | 368.241 | 449.595 | 449.595 | 380.762 | 63.506 |
| remoteCasMinMs_medium | 3 | 473.877 | 511.082 | 536.119 | 536.119 | 507.026 | 31.319 |
| remoteCasP50Ms_medium | 3 | 487.026 | 524.016 | 560.063 | 560.063 | 523.701 | 36.520 |
| remoteCasP95Ms_medium | 3 | 564.057 | 585.616 | 680.530 | 680.530 | 610.067 | 61.967 |
| remoteCasMaxMs_medium | 3 | 564.057 | 585.616 | 680.530 | 680.530 | 610.067 | 61.967 |
| remoteCasMeanMs_medium | 3 | 510.121 | 537.436 | 593.278 | 593.278 | 546.945 | 42.386 |
| remoteCasStdDevMs_medium | 3 | 20.954 | 44.180 | 54.756 | 54.756 | 39.963 | 17.291 |
| collaboratorDiscoveryMinMs_medium | 3 | 88.681 | 107.086 | 109.966 | 109.966 | 101.911 | 11.547 |
| collaboratorDiscoveryP50Ms_medium | 3 | 89.045 | 107.443 | 111.026 | 111.026 | 102.504 | 11.793 |
| collaboratorDiscoveryP95Ms_medium | 3 | 118.623 | 119.154 | 139.492 | 139.492 | 125.756 | 11.898 |
| collaboratorDiscoveryMaxMs_medium | 3 | 118.623 | 119.154 | 139.492 | 139.492 | 125.756 | 11.898 |
| collaboratorDiscoveryMeanMs_medium | 3 | 104.004 | 111.460 | 118.392 | 118.392 | 111.285 | 7.196 |
| collaboratorDiscoveryStdDevMs_medium | 3 | 4.693 | 12.233 | 15.141 | 15.141 | 10.689 | 5.392 |
| cleanupMs_medium | 3 | 0.007 | 0.008 | 0.008 | 0.008 | 0.008 | 0.001 |
| setupMs_stress | 3 | 1403.222 | 1430.891 | 1566.779 | 1566.779 | 1466.964 | 87.542 |
| warmupMs_stress | 3 | 796.307 | 797.458 | 830.515 | 830.515 | 808.093 | 19.426 |
| remoteCasMinMs_stress | 3 | 721.073 | 745.713 | 982.949 | 982.949 | 816.579 | 144.607 |
| remoteCasP50Ms_stress | 3 | 721.073 | 745.713 | 982.949 | 982.949 | 816.579 | 144.607 |
| remoteCasP95Ms_stress | 3 | 733.839 | 914.700 | 1021.130 | 1021.130 | 889.889 | 145.243 |
| remoteCasMaxMs_stress | 3 | 733.839 | 914.700 | 1021.130 | 1021.130 | 889.889 | 145.243 |
| remoteCasMeanMs_stress | 3 | 727.456 | 830.206 | 1002.040 | 1002.040 | 853.234 | 138.733 |
| remoteCasStdDevMs_stress | 3 | 6.383 | 19.090 | 84.493 | 84.493 | 36.655 | 41.913 |
| collaboratorDiscoveryMinMs_stress | 3 | 157.017 | 181.769 | 265.507 | 265.507 | 201.431 | 56.855 |
| collaboratorDiscoveryP50Ms_stress | 3 | 157.017 | 181.769 | 265.507 | 265.507 | 201.431 | 56.855 |
| collaboratorDiscoveryP95Ms_stress | 3 | 190.459 | 198.219 | 266.845 | 266.845 | 218.508 | 42.041 |
| collaboratorDiscoveryMaxMs_stress | 3 | 190.459 | 198.219 | 266.845 | 266.845 | 218.508 | 42.041 |
| collaboratorDiscoveryMeanMs_stress | 3 | 173.738 | 189.994 | 266.176 | 266.176 | 209.969 | 49.350 |
| collaboratorDiscoveryStdDevMs_stress | 3 | 0.669 | 8.225 | 16.721 | 16.721 | 8.538 | 8.031 |
| cleanupMs_stress | 3 | 0.011 | 0.014 | 0.025 | 0.025 | 0.016 | 0.007 |
| throttleFailureLatencyMs | 3 | 284.909 | 298.184 | 298.550 | 298.550 | 293.881 | 7.772 |

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
