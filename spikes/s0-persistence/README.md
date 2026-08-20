# S0 persistence spike harness

This folder contains the S0 specification and an isolated, provider-neutral
test harness. It is not imported by Tippani's production runtime and is not
included in the npm package.

## Current scope

The harness provides:

- A machine-readable catalog matching every stable scenario ID in the S0 spec.
- A common Draft Workspace store contract with generation-CAS semantics.
- Deterministic, synthetic-only workspace fixtures at small, medium, and stress scales.
- Named fault injection for commit and restore boundaries.
- Five adapters: a reference in-memory store (harness validation only), the two
  local candidates `local-cas` and `local-sqlite`, and three provider transports
  `onedrive`, `ado`, and `github`.
- The provider transports run two modes on one code path: a preflight-gated
  dry-run that makes zero network calls and records the intended operation
  manifest, and a live mode (env-supplied identity and coordinates) that issues
  real provider-native CAS. Without an approved sandbox they still fail closed on
  any live call.
- Real cross-process evidence: writers run as separate OS processes released
  from a common barrier, and kill tests hard-exit a child mid-commit, mid
  alias-update, mid atomic-replace, and mid-restore.
- Sandbox preflight checks that reject embedded credentials, corporate-account
  fallback, mismatched ownership markers, and incomplete provider safeguards.
- An ownership-checked cleanup manifest.
- Raw JSON results, a redacted preflight record, a Markdown outcome report that
  discloses unexecuted catalog coverage, a candidate comparison report, and a
  non-secret provider preflight sheet listing the dry-run operation manifest and
  the prerequisites required before any live provider run.

## Candidates

| Adapter | Design |
|---|---|
| `local-cas` | One atomic generation-CAS envelope per workspace (temp file + fsync + rename) with a per-workspace lock and a rebuildable alias index. The envelope is the only authority, so a crash between an envelope write and an index update cannot strand an alias. |
| `local-sqlite` | `node:sqlite` (built in, no native build step) in WAL mode. Workspace and alias rows are updated inside one `BEGIN IMMEDIATE` transaction. |

The `onedrive`/`ado`/`github` transports are implemented behind the same
`IWorkspaceStore` contract, each using provider-native concurrency (OneDrive
version/ETag, ADO object/ref preconditions, GitHub Contents blob-sha) on a
per-run branch/namespace that never touches a default or protected branch. They
are transports, not local-store candidates: without an approved sandbox they
still fail closed and only dry-run. The nine single-identity provider gates now
pass live (see below). The two-user collaboration gates (`COL-002/003/006`), the
synced-folder probe (`BCK-006`), and provider performance (`PER-004`) remain
`Blocked`/deferred pending a second identity and a performance pass.

## Provider live results

Each provider transport was executed live against an approved, synthetic-only
sandbox (coordinates redacted here per the spec's synthetic-data and secret
rules). The nine single-identity provider gates passed on every provider:

| Gate | Invariant |
|---|---|
| `BCK-002/003/004` | Provider-native precondition rejects a stale writer and preserves one auditable generation (OneDrive ETag / ADO object-ref / GitHub blob-sha) |
| `BCK-005` | Outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state |
| `COL-004` | A remote success with a lost response reconciles without a duplicate generation or false failure |
| `COL-005` | Offline work stays pending until authoritative CAS confirmation and reconciles without silent overwrite |
| `REC-003` | Outage/auth/throttle/lost-response recovery reconciles authoritative state |
| `REC-004` | A local offline cache reconciles against newer authority without silent overwrite |
| `MIG-004` | Local-to-provider rehome preserves `WorkspaceId` and establishes one authority only after receipt |
| `BKP-003` | History/export recovers a known generation without rewriting newer valid history |
| `BKP-004` | A restored shared workspace establishes one explicit authoritative head |

| Provider | Result | Notes |
|---|---|---|
| OneDrive (Graph) | 9/9 | Version/ETag `If-Match` CAS on drive items; per-run folder cleaned up |
| Azure DevOps | 9/9 | Push `oldObjectId` ref precondition; per-run branch; default branch untouched, zero leftover branches |
| GitHub | 9/9 | Contents blob-sha CAS; per-run branch; deterministic across two runs; branch cleaned up, default branch untouched |

GitHub's live run also surfaced two provider-specific issues the strongly
consistent providers had masked: read-after-write replication lag (handled with
monotonic observed-generation reads and treating a `409` blob-sha precondition
failure as the authoritative conflict signal), and a latent `workspaceId`
slug-truncation collision in the shared gate seeds (the distinguishing tag now
leads the seed). Raw per-run outcomes are written under `results/CFG-*-LIVE/` and
are Git-ignored.

## Commands

```powershell
npm run spike:s0:test        # harness, detection-power, durable-detection, provider-dryrun, onedrive, and provider-gate (onedrive/ado/github) suites
npm run spike:s0:selftest    # reference adapter self-test
npm run spike:s0:compare     # run both local candidates and emit the comparison report
npm run spike:s0:preflight   # emit the provider preflight sheet + dry-run manifest
node spikes\s0-persistence\src\cli.mjs --list
node spikes\s0-persistence\src\cli.mjs --config spikes\s0-persistence\config\local-cas.json --dry-run
```

Generated results go under `spikes\s0-persistence\results\` and are ignored by
Git. Publish reviewed outcome reports separately only after confirming that
they contain synthetic data and no credentials.

## Detection power

Passing scenarios only mean something if they can fail. `test\detection-power.test.mjs`
and `test\durable-detection.test.mjs` run deliberately broken stores and require
the owning scenario to fail each one: no generation CAS, partial commit,
empty-on-corrupt, lost acknowledged commit, lossy restore, dangling journal
tuple, alias leak, cleared newer intent revision, unlocked cross-process write,
torn in-place write, and a commit that is acknowledged but never persisted.

Broken adapters are registered only when `S0_ENABLE_TEST_MUTANTS=1`, so no
reported S0 result can be produced by one.

## Windows findings so far

- **A live lock must never be stolen.** Four-way contention initially produced
  two winners for `local-cas`: the lock file was created before its owner record
  was written, so a competitor could read an empty file, judge it abandoned, and
  steal it. The lock now publishes a fully written record with an atomic
  `link`, and an unreadable record is only reclaimed after the stale window.
- **Concurrent atomic replace is not silently lossy on NTFS.** Two processes
  renaming over the same target tend to fail with `EPERM` rather than losing an
  update, so an unsynchronised store surfaces untyped I/O errors instead of the
  typed stale-generation conflict callers need.
- **Durability limit.** Windows has no portable directory fsync, so file-content
  fsync plus rename is the strongest barrier available here. S0 records that
  rather than claiming a stronger guarantee.

Measurements in the comparison report are single-run and indicative only. Disk
footprint at `small` scale is dominated by SQLite's fixed page and WAL overhead,
so write amplification must be re-measured at `medium` and `stress` before it
carries any weight in the ADR.

## Adding an adapter

An adapter must implement the methods validated by `assertWorkspaceStore()`:

- `initialize`
- `createWorkspace`
- `readWorkspace`
- `resolveAlias`
- `listWorkspaces`
- `compareAndSwap`
- `backup`
- `restore`
- `close`

Register the adapter in `src\runner.mjs`, add a credential-free config, and
implement each applicable scenario in `src\scenario-implementations.mjs`.
Provider adapters must pass preflight before their first provider call.
