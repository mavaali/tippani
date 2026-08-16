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
- Three adapters: a reference in-memory store (harness validation only) plus the
  two local candidates, `local-cas` and `local-sqlite`.
- Real cross-process evidence: writers run as separate OS processes released
  from a common barrier, and kill tests hard-exit a child mid-commit.
- Sandbox preflight checks that reject embedded credentials, corporate-account
  fallback, mismatched ownership markers, and incomplete provider safeguards.
- An ownership-checked cleanup manifest.
- Raw JSON results, a redacted preflight record, a Markdown outcome report that
  discloses unexecuted catalog coverage, and a candidate comparison report.

## Candidates

| Adapter | Design |
|---|---|
| `local-cas` | One atomic generation-CAS envelope per workspace (temp file + fsync + rename) with a per-workspace lock and a rebuildable alias index. The envelope is the only authority, so a crash between an envelope write and an index update cannot strand an alias. |
| `local-sqlite` | `node:sqlite` (built in, no native build step) in WAL mode. Workspace and alias rows are updated inside one `BEGIN IMMEDIATE` transaction. |

## Commands

```powershell
npm run spike:s0:test        # harness, detection-power, and durable-detection suites
npm run spike:s0:selftest    # reference adapter self-test
npm run spike:s0:compare     # run both candidates and emit the comparison report
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
