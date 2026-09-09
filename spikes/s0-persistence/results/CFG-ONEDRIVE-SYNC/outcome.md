# S0 Outcome: CFG-ONEDRIVE-LIVE

> **Historical evidence notice:** This retained report predates the merge-readiness repairs. Its statuses and recommendation are invalid for the current source and must not be used to select a persistence mapping. Fresh campaigns and independent sign-off are required.

**Report date:** 2026-08-31
**Harness revision:** s0-harness-v3
**Configuration ID:** CFG-ONEDRIVE-LIVE
**Adapter:** onedrive
**Authoritative backing path:** onedrive
**Dataset scale:** small
**Recommendation:** Incomplete
**Applicable absolute gates:** 18
**Eligibility:** Incomplete

## Coverage

Executed 1 of 58 catalog scenarios. 21 apply to this configuration; 18 applicable absolute gates were not executed.

| Outcome class | Count | Meaning |
|---|---:|---|
| Pass | 1 | Executed and satisfied |
| Fail | 0 | Executed and violated |
| Blocked | 0 | Applicable, but a prerequisite is unavailable |
| Incomplete | 0 | Applicable implementation or evidence is incomplete |
| N/A | 0 | Applicable family, contract-level exception approved by review |
| Not applicable | 37 | Assigned to another configuration by design |
| Not executed | 20 | Applicable, but no result exists |

Applicable absolute gates not executed:

- `S0-COL-002` — Two users on a shared backing path cannot silently overwrite each other
- `S0-COL-003` — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- `S0-COL-004` — Remote success with a lost response is reconciled without duplicate generation or false failure
- `S0-COL-005` — Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite
- `S0-COL-006` — Another collaborator discovers a committed generation through the backing path change mechanism
- `S0-BCK-002` — OneDrive ETag/version preconditions reject stale updates and support version recovery
- `S0-BCK-005` — Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state
- `S0-MIG-004` — Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt
- `S0-BKP-003` — Shared-backing history/export recovers a known generation without rewriting newer valid history
- `S0-BKP-004` — Restored shared workspace establishes one explicit authoritative head
- `S0-REC-003` — Provider outage/auth/throttle/lost-response recovery reconciles authoritative state
- `S0-REC-004` — Local offline cache reconciles against newer authority without silent overwrite
- `S0-SEC-001` — Preflight rejects non-allow-listed, unmarked, default/protected, or production coordinates before provider calls
- `S0-SEC-002` — Effective sandbox identity is verified and corporate-account fallback is impossible
- `S0-SEC-003` — Only synthetic data appears in stores, fixtures, logs, backups, screenshots, dumps, and reports
- `S0-SEC-004` — Credentials remain brokered/redacted and absent from workspace state and evidence
- `S0-SEC-005` — Cleanup/reaper deletes only run-owned resources recorded in the manifest
- `S0-SEC-006` — Provider request/object/time/storage budgets stop unsafe or abusive runs

An unexecuted absolute gate is missing evidence, not a pass.

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
| Temporary store root | tippani-s0-s0-onedrive-live-aKQL1B |
| Network characteristics | Not recorded |
| Provider region | Not recorded |
| Storage characteristics | Not recorded |
| Sync-client state | Personal OneDrive sync client running; same-device compatibility probe |
| Repository protections | Not recorded |
| Dependency versions | node=24.14.0; sqlite=3.51.2 |
| Workload mix | scenario-defined deterministic small/medium/stress fixtures |
| Known limitations | None recorded |
| Process topology | Independent OS child processes sharing one provider account for collaboration gates |
| Dataset scale | small |
| Applicability profile | onedrive |
| Store namespace | tippani-s0/s0-onedrive-live |
| Authentication setup | Live delegated identity (supplied at runtime) |
| Cleanup manifest | syn-cleanup-s0-onedrive-live |
| Cleanup expiry | 2026-09-01T22:24:49.056Z |

## Method and preflight

| Check | Result |
|---|---|
| Synthetic data only | Pass |
| Corporate-account fallback disabled | Pass |
| Ownership marker | `tippani-s0:s0-onedrive-live` |
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
| `S0-COL-002` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-COL-003` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-COL-004` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-COL-005` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-COL-006` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-BCK-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-002` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-BCK-003` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-004` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BCK-005` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-BCK-006` | relative | Pass | 42.907 | syncClientState=Personal OneDrive sync client running; same-device compatibility probe; probe=same-device simultaneous file handles in a synced folder; observedActor=client-2; conflictFilesCreated=0; providerApiCasUsed=false; limitation=Compatibility probe only; a second synced device is required for true sync-conflict evidence. | [JSON](raw-results.json) |
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
| `S0-MIG-004` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-IMP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-IMP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-BKP-003` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-BKP-004` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-REC-001` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-002` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-REC-003` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-REC-004` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-REC-005` | absolute | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-SEC-001` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-SEC-002` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-SEC-003` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-SEC-004` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-SEC-005` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-SEC-006` | absolute | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-PER-001` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-002` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-003` | relative | Not applicable |  | Assigned to another engine/backing-path configuration by the applicability matrix. | [JSON](raw-results.json) |
| `S0-PER-004` | relative | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |
| `S0-PER-005` | relative | Not executed |  | Applicable scenario has no result. | [JSON](raw-results.json) |

## Correctness summary

| Criterion | Outcome |
|---|---|
| Atomicity and concurrency | Not applicable |
| Collaboration | Incomplete |
| Crash and operational recovery | Incomplete |
| Corruption and rehydration | Not applicable |
| Migration and import | Incomplete |
| Backup and restore | Incomplete |
| Safety and security | Incomplete |

## Measurements

| Scenario ID | Metric | Value | Unit |
|---|---|---:|---|
| `S0-BCK-006` | syncedFolderCreateMs | 12.617 | ms |

## Failures and recovery

No scenario failures.

## Risks and required follow-up

| Gate | State | Owner | Evidence required |
|---|---|---|---|
| `S0-COL-002` | Not executed | S0 provider test owner | Two users on a shared backing path cannot silently overwrite each other |
| `S0-COL-003` | Not executed | S0 provider test owner | Two devices reconnecting from different generations receive deterministic conflict/reload behavior |
| `S0-COL-004` | Not executed | S0 provider test owner | Remote success with a lost response is reconciled without duplicate generation or false failure |
| `S0-COL-005` | Not executed | S0 provider test owner | Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite |
| `S0-COL-006` | Not executed | S0 provider test owner | Another collaborator discovers a committed generation through the backing path change mechanism |
| `S0-BCK-002` | Not executed | S0 provider test owner | OneDrive ETag/version preconditions reject stale updates and support version recovery |
| `S0-BCK-005` | Not executed | S0 provider test owner | Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state |
| `S0-MIG-004` | Not executed | S0 provider test owner | Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt |
| `S0-BKP-003` | Not executed | S0 provider test owner | Shared-backing history/export recovers a known generation without rewriting newer valid history |
| `S0-BKP-004` | Not executed | S0 provider test owner | Restored shared workspace establishes one explicit authoritative head |
| `S0-REC-003` | Not executed | S0 provider test owner | Provider outage/auth/throttle/lost-response recovery reconciles authoritative state |
| `S0-REC-004` | Not executed | S0 provider test owner | Local offline cache reconciles against newer authority without silent overwrite |
| `S0-SEC-001` | Not executed | S0 implementation owner | Preflight rejects non-allow-listed, unmarked, default/protected, or production coordinates before provider calls |
| `S0-SEC-002` | Not executed | S0 implementation owner | Effective sandbox identity is verified and corporate-account fallback is impossible |
| `S0-SEC-003` | Not executed | S0 implementation owner | Only synthetic data appears in stores, fixtures, logs, backups, screenshots, dumps, and reports |
| `S0-SEC-004` | Not executed | S0 implementation owner | Credentials remain brokered/redacted and absent from workspace state and evidence |
| `S0-SEC-005` | Not executed | S0 implementation owner | Cleanup/reaper deletes only run-owned resources recorded in the manifest |
| `S0-SEC-006` | Not executed | S0 implementation owner | Provider request/object/time/storage budgets stop unsafe or abusive runs |

## Configuration recommendation

Do not treat this component as selected. Close every applicable failed, blocked, incomplete, or unexecuted absolute gate first.

## Evidence

- [Raw machine-readable results](raw-results.json)
- [Redacted preflight](preflight.json)

## Sign-off

| Role | Person | Date | Decision / comments |
|---|---|---|---|
| Implementer | | | |
| Independent reviewer | | | |
