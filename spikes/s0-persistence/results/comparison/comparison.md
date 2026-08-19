# S0 candidate comparison

**Generated:** 2026-08-16T06:14:57.478Z
**Host:** win32 x64 node 24.14.0

Absolute gates decide eligibility. Relative metrics rank only the
configurations that already pass every executed absolute gate, and an
unexecuted gate counts as missing evidence rather than a pass.

## Absolute gates

| Configuration | Adapter | Passed | Failed | Unresolved | Not executed | Eligible |
|---|---|---:|---:|---:|---:|---|
| CFG-LOCAL-CAS | local-cas | 38 | 0 | 0 | 14 | Incomplete |
| CFG-LOCAL-SQLITE | local-sqlite | 37 | 0 | 1 | 14 | Incomplete |

## Relative metrics

| Metric | CFG-LOCAL-CAS | CFG-LOCAL-SQLITE |
|---|---:|---:|
| **small scale** |  |  |
| Cold initialize (ms) | 1.453 | 8.988 |
| Create workspace (ms) | 4.291 | 0.870 |
| Open by alias p50 (ms) | 1.993 | 0.069 |
| Mutation p50 (ms) | 6.405 | 0.848 |
| Mutation p95 (ms) | 8.198 | 1.307 |
| Conflict detect p50 (ms) | 4.229 | 0.139 |
| Backup (ms) | 2.127 | 0.088 |
| Restore (ms) | 3.960 | 0.628 |
| Store bytes | 3827 | 411816 |
| Write amplification | 1.01 | 106.58 |
| **medium scale** |  |  |
| Cold initialize (ms) | 1.830 | 7.638 |
| Create workspace (ms) | 2.235 | 1.084 |
| Open by alias p50 (ms) | 2.191 | 0.123 |
| Mutation p50 (ms) | 6.850 | 1.133 |
| Mutation p95 (ms) | 9.353 | 1.448 |
| Conflict detect p50 (ms) | 4.344 | 0.190 |
| Backup (ms) | 2.002 | 0.152 |
| Restore (ms) | 5.697 | 0.604 |
| Store bytes | 25064 | 584856 |
| Write amplification | 1 | 22.97 |
| **stress scale** |  |  |
| Cold initialize (ms) | 1.441 | 8.417 |
| Create workspace (ms) | 10.952 | 10.221 |
| Open by alias p50 (ms) | 10.338 | 1.296 |
| Mutation p50 (ms) | 17.266 | 8.532 |
| Mutation p95 (ms) | 24.739 | 12.908 |
| Conflict detect p50 (ms) | 8.621 | 1.513 |
| Backup (ms) | 4.897 | 1.336 |
| Restore (ms) | 13.952 | 4.176 |
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

- **Incomplete** `S0-REC-002` — No external lock file: SQLite owns locking internally and recovers a killed writer through its own journal on open.
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
