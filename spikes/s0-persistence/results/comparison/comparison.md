# S0 candidate comparison

**Generated:** 2026-08-19T13:38:29.212Z
**Host:** win32 x64 node 24.14.0

Absolute gates decide eligibility. Relative metrics rank only the
configurations that already pass every executed absolute gate, and an
unexecuted gate counts as missing evidence rather than a pass.

## Absolute gates

| Configuration | Adapter | Passed | Failed | Unresolved | N/A | Not executed | Eligible |
|---|---|---:|---:|---:|---:|---:|---|
| CFG-LOCAL-CAS | local-cas | 38 | 0 | 0 | 0 | 14 | Incomplete |
| CFG-LOCAL-SQLITE | local-sqlite | 37 | 0 | 0 | 1 | 14 | Incomplete |

## Relative metrics

| Metric | CFG-LOCAL-CAS | CFG-LOCAL-SQLITE |
|---|---:|---:|
| **small scale** |  |  |
| Cold initialize (ms) | 1.269 | 12.965 |
| Create workspace (ms) | 2.289 | 0.883 |
| Open by alias p50 (ms) | 2.434 | 0.042 |
| Mutation p50 (ms) | 6.555 | 0.538 |
| Mutation p95 (ms) | 9.069 | 0.994 |
| Conflict detect p50 (ms) | 4.316 | 0.103 |
| Backup (ms) | 2.425 | 0.111 |
| Restore (ms) | 3.846 | 0.643 |
| Store bytes | 3827 | 411816 |
| Write amplification | 1.01 | 106.58 |
| **medium scale** |  |  |
| Cold initialize (ms) | 3.114 | 12.540 |
| Create workspace (ms) | 2.906 | 0.903 |
| Open by alias p50 (ms) | 2.734 | 0.084 |
| Mutation p50 (ms) | 7.086 | 0.959 |
| Mutation p95 (ms) | 11.721 | 1.617 |
| Conflict detect p50 (ms) | 4.969 | 0.159 |
| Backup (ms) | 1.918 | 0.173 |
| Restore (ms) | 4.071 | 1.136 |
| Store bytes | 25064 | 584856 |
| Write amplification | 1 | 22.97 |
| **stress scale** |  |  |
| Cold initialize (ms) | 1.457 | 14.061 |
| Create workspace (ms) | 11.773 | 10.261 |
| Open by alias p50 (ms) | 13.997 | 1.477 |
| Mutation p50 (ms) | 28.669 | 9.962 |
| Mutation p95 (ms) | 31.770 | 11.687 |
| Conflict detect p50 (ms) | 13.460 | 1.831 |
| Backup (ms) | 6.167 | 1.700 |
| Restore (ms) | 18.900 | 4.931 |
| Store bytes | 471767 | 2599536 |
| Write amplification | 1 | 5.42 |

## Absolute gates not passed

### CFG-LOCAL-CAS

- **Not executed** `S0-COL-002` — Two users on a shared backing path cannot silently overwrite each other
- **Not executed** `S0-COL-003` — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- **Not executed** `S0-COL-004` — Remote success with a lost response is reconciled without duplicate generation or false failure
- **Not executed** `S0-COL-005` — Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite
- **Not executed** `S0-COL-006` — Another collaborator discovers a committed generation through the backing path change mechanism
- **Not executed** `S0-BCK-002` — OneDrive ETag/version preconditions reject stale updates and support version recovery
- **Not executed** `S0-BCK-003` — ADO object/ref preconditions reject stale updates and preserve one auditable generation commit
- **Not executed** `S0-BCK-004` — GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit
- **Not executed** `S0-BCK-005` — Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state
- **Not executed** `S0-MIG-004` — Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt
- **Not executed** `S0-BKP-003` — Shared-backing history/export recovers a known generation without rewriting newer valid history
- **Not executed** `S0-BKP-004` — Restored shared workspace establishes one explicit authoritative head
- **Not executed** `S0-REC-003` — Provider outage/auth/throttle/lost-response recovery reconciles authoritative state
- **Not executed** `S0-REC-004` — Local offline cache reconciles against newer authority without silent overwrite

### CFG-LOCAL-SQLITE

- **N/A** `S0-REC-002` — SQLite owns locking internally and recovers a killed writer through its own journal on open, so the external stale-lock-file recovery scenario does not apply to its contract (reviewer-approved).
- **Not executed** `S0-COL-002` — Two users on a shared backing path cannot silently overwrite each other
- **Not executed** `S0-COL-003` — Two devices reconnecting from different generations receive deterministic conflict/reload behavior
- **Not executed** `S0-COL-004` — Remote success with a lost response is reconciled without duplicate generation or false failure
- **Not executed** `S0-COL-005` — Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite
- **Not executed** `S0-COL-006` — Another collaborator discovers a committed generation through the backing path change mechanism
- **Not executed** `S0-BCK-002` — OneDrive ETag/version preconditions reject stale updates and support version recovery
- **Not executed** `S0-BCK-003` — ADO object/ref preconditions reject stale updates and preserve one auditable generation commit
- **Not executed** `S0-BCK-004` — GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit
- **Not executed** `S0-BCK-005` — Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state
- **Not executed** `S0-MIG-004` — Local-to-OneDrive/ADO/GitHub rehome preserves WorkspaceId and establishes one authority only after receipt
- **Not executed** `S0-BKP-003` — Shared-backing history/export recovers a known generation without rewriting newer valid history
- **Not executed** `S0-BKP-004` — Restored shared workspace establishes one explicit authoritative head
- **Not executed** `S0-REC-003` — Provider outage/auth/throttle/lost-response recovery reconciles authoritative state
- **Not executed** `S0-REC-004` — Local offline cache reconciles against newer authority without silent overwrite

## Scope

- Platform: Windows/NTFS only. macOS and Linux are `Blocked — no runner`.
- Backing path: local filesystem only. OneDrive, ADO, and GitHub remain unexecuted.
- These results cannot close the cross-platform or collaboration criteria.
