# S0 persistence spike harness

This folder contains the S0 specification and an isolated, provider-neutral
test harness. It is not imported by Tippani's production runtime and is not
included in the npm package.

**Merge disposition:** PR #91 ships a hardened evaluation harness only. No
persistence mapping is selected, and no production runtime integration is
authorized. All checked-in local, cross-platform, synced-folder, and live
provider results are historical and invalid/incomplete for the repaired source.
Fresh campaigns plus independent review and ADR sign-off are follow-up work.

## Current scope

The harness provides:

- A machine-readable catalog matching every stable scenario ID in the S0 spec.
- A common Draft Workspace store contract with generation-CAS semantics.
- Deterministic, synthetic-only workspace fixtures at small, medium, and stress scales.
- Named fault injection for commit, migration, and restore boundaries.
- Five candidate engine/backing-path configurations plus a reference in-memory
  adapter for harness validation: local `local-cas`, local `local-sqlite`, and
  the `onedrive`, `ado`, and `github` provider transports.
- The provider transports run two modes on one code path: a preflight-gated
  dry-run that makes zero network calls and records the intended operation
  manifest, and a live mode (env-supplied identity and coordinates) that issues
  real provider-native CAS. Without an approved sandbox they still fail closed on
  any live call.
- Real cross-process evidence: writers run as separate OS processes released
  from a common barrier, and kill tests hard-exit a child mid-commit, mid
  alias-update, mid atomic-replace, and during an actual migration transaction.
- Sandbox preflight checks that reject embedded credentials, corporate-account
  fallback, mismatched ownership markers, and incomplete provider safeguards.
- An ownership-checked cleanup manifest.
- Raw JSON results, a redacted preflight record, a Markdown outcome report that
  discloses unexecuted catalog coverage, a candidate comparison report, and a
  non-secret provider preflight sheet listing the dry-run operation manifest and
  the prerequisites required before any live provider run.

## Testing methodology

Every adapter configuration is evaluated against the same machine-readable
scenario catalog and deterministic synthetic fixtures. Applicable absolute
scenarios are eligibility gates: failed, blocked, incomplete, or unexecuted
gates never count as passes. Relative measurements are used to compare
candidates only after all applicable absolute gates pass.

- **Applicability and mapping:** Eligibility is calculated separately for local
  SQLite, the local generation-CAS envelope, the OneDrive envelope, the ADO
  envelope, and the GitHub envelope. Results are then rolled up into candidate
  architecture mappings. A gate owned by another configuration is `Not
  applicable`; `N/A` is reserved for a contract exception with approver
  identity, approval date, and reference; `Blocked`, `Incomplete`, and `Not
  executed` remain distinct states.
- **Isolation and repeatability:** Each local scenario receives an isolated
  temporary store root. Fixtures are generated deterministically at the
  configured small, medium, or stress scale. Provider runs use a per-run
  namespace and ownership-checked cleanup.
- **Concurrency and recovery:** Contending writers run as separate OS child
  processes, wait at a common barrier, and then race the same generation.
  Named fault injection and hard process exits exercise commit, alias-update,
  atomic-replace, and migration boundaries.
- **Two-client collaboration:** Two client processes act as user 1 and user 2
  while authenticating through the same provider account. `COL-002` races the
  processes, `COL-003` reconnects a stale client after the other commits, and
  `COL-006` measures when the second client discovers the committed generation.
  The harness distinguishes the actors by client. Multiple accounts are not
  needed; requiring two actual provider identities is a **wrong assumption**,
  and the storage layer imposes no such requirement.
- **Provider safety:** Dry runs record the exact provider operations and
  concurrency preconditions while making zero network calls. Live runs use the
  same adapter path only after preflight validates the configured sandbox,
  identity, ownership marker, namespace, permissions, budgets, and cleanup
  controls. Credentials must remain external to configuration and reports.
- **Detection power:** Deliberately broken mutant stores must fail the scenario
  that owns the violated invariant. Mutants are enabled only for the dedicated
  detection-power suites and cannot produce reported candidate results.
- **Performance method:** The intended protocol uses populated stores, fresh
  processes, repeated raw samples, memory measurement, and storage-layer bytes
  written. The checked-in `PER-001` and `PER-003` evidence did not meet that
  protocol and is now `Incomplete`; it is excluded from architecture rationale
  until rerun correctly.
- **Evidence and reporting:** Each scenario records its status, duration,
  evidence, optional measurements, and raw samples. Reports expose missing
  absolute-gate evidence rather than presenting unexecuted coverage as a pass.
  The comparison links each summary cell to its configuration report and raw
  JSON, lists exact open gates with owners and evidence requirements, rolls up
  candidate mappings, and provides sign-off fields. Relative metrics remain
  explicitly provisional and unranked until an architecture mapping is
  eligible.

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
still fail closed and only dry-run.

## Comparison and decision handoff

`spike:s0:compare` can execute configurations, while `compare.mjs
--use-existing` only validates retained artifacts and never silently reruns a
provider. The current [architecture-mapping handoff](results/comparison/comparison.md)
rejects the checked-in campaigns as stale/incomplete after the review fixes.
It is the only source of current result counts and contains:

- The applicability-aware five-configuration matrix.
- Per-configuration correctness, collaboration, recovery, performance, and
  complexity outcomes.
- Candidate mapping definitions used only for future evidence rollup; neither
  mapping is selected.
- Exact failed, blocked, incomplete, and unexecuted gates, with owners and the
  evidence required to close each condition.
- Provisional diagnostics or, once a complete mapping is eligible, comparable
  relative evidence for ADR selection.
- Links to each outcome report, redacted preflight, and raw JSON evidence.
- Cross-platform, synced-folder, ADR-approval, and sign-off conditions.

The README intentionally makes no historical live-result claim. Wiping or
regenerating `results/` cannot leave a contradictory summary here.

## Superseded campaign checklist

The checked boxes below describe the pre-review campaign and are retained only
as history. They are not current evidence and do not make either architecture
mapping eligible.

### Pull-request review acceptance

- [x] **Eligibility level:** Evaluate applicability per engine/backing-path
  configuration instead of treating each adapter as responsible for the full
  catalog. Roll the five component results into candidate architecture
  mappings only after component eligibility is known.
- [x] **Fresh five-configuration evidence:** Produce current reports for local
  SQLite, local generation-CAS, OneDrive generation-CAS, ADO generation-CAS,
  and GitHub generation-CAS. Do not reuse the wiped provider outcomes or state
  that a provider passed based on stale evidence.
- [x] **Outcome vocabulary:** Report `Pass`, `Fail`, `Blocked`, `Incomplete`,
  `N/A`, `Not applicable`, and `Not executed` separately. `N/A` requires a
  contract explanation and reviewer approval; missing applicable evidence is
  never `N/A` or a pass.
- [x] **No premature ranking:** Suppress relative ranking while every candidate
  architecture mapping is incomplete. Show any available measurements as
  provisional diagnostics only.
- [x] **Decision-grade performance:** Complete the warm-up, repetition,
  variability, environment, provider-cost, throttling, discovery-latency, and
  complexity protocol below for every configuration before performance affects
  the ADR.
- [ ] **Decision-ready handoff:** Publish the recommended mapping, exact
  conditions, named owners, required closing evidence, raw-evidence links, and
  sign-off table after the applicable gates close.
- [ ] **Human approval:** Record the ADR approver's acceptance of the selected
  architecture mapping in the handoff and ADR.

### Harness and decision model

- [x] Keep one immutable scenario catalog and classify every scenario by the
  engine/backing-path configurations to which it applies.
- [x] Evaluate local SQLite, local generation-CAS, OneDrive, ADO, and GitHub
  separately before rolling them into candidate architecture mappings.
- [x] Preserve `Pass`, `Fail`, `Blocked`, `Incomplete`, `N/A`, `Not
  applicable`, and `Not executed` as distinct outcomes.
- [x] Implement `COL-002`, `COL-003`, and `COL-006` with two independent client
  processes. Both clients may use the same provider account and are identified
  by their logical client actor.
- [x] Implement the measurement and reporting hooks required by the detailed
  performance protocol below.
- [x] Run the full harness, detection-power suites, and report-integrity tests
  immediately before each evidence campaign.

### Live-campaign preflight

- [x] Allocate a fresh run ID, ownership marker, provider namespace, cleanup
  manifest, and unexpired cleanup deadline for each live provider run.
- [x] Externally supply identity tokens and sandbox coordinates at runtime;
  confirm that none are written to configuration, logs, reports, or workspace
  state.
- [x] Verify the effective non-production identity and exact drive,
  organization/project/repository, default branch, and per-run namespace before
  the first provider call.
- [x] Confirm OneDrive file/version/delete access, ADO branch/content
  write/delete access, and GitHub private-repository contents/ref write/delete
  access against disposable synthetic-only resources.
- [x] Confirm the sandbox has no production data and that pipelines, Actions,
  webhooks, service hooks, and other integrations cannot run from the test
  namespace.
- [x] Record client OS/filesystem, runtime, CPU/memory, network characteristics,
  provider region, dataset scale, workload mix, and process topology.
- [x] Generate and review each provider preflight sheet and zero-network dry-run
  operation manifest before live execution.

### Decision-grade performance protocol

- [x] **Fixtures and workload:** Use the same deterministic small, medium, and
  stress fixtures and the same operation mix for every configuration being
  compared. Record fixture revision, scale, actor count, and operation count.
- [x] **Cold-start warm-up and repetitions:** For `PER-001`, backup/restore,
  footprint, and write-amplification measurements, run one complete discarded
  warm-up per scale, then collect five measured runs per scale from fresh store
  roots. Never include the warm-up in reported statistics.
- [x] **Local-operation warm-up and repetitions:** For `PER-002`, perform three
  discarded warm-up operations, then collect 40 small, 20 medium, and 8 stress
  samples for alias-open, mutation, and conflict detection for each local
  candidate.
- [x] **Provider-operation warm-up and repetitions:** For `PER-004`, perform
  three discarded provider reads, then collect 6 small, 4 medium, and 2 stress
  samples per provider for remote CAS and collaborator discovery.
- [x] **Campaign repetition:** Run the complete provider performance campaign
  at least three times per provider under the recorded environment. Retain each
  campaign separately so between-run variation is visible rather than merged
  into one sample set.
- [x] **Timing method:** Measure elapsed time with the monotonic
  `performance.now()` clock around only the operation under test; exclude setup,
  warm-up, and cleanup from operation latency.
- [x] **Non-operation timing:** Record setup, warm-up, cleanup, retry-backoff,
  and injected-delay time separately where those durations affect campaign
  interpretation.
- [x] **Reported statistics:** Retain every raw sample and report sample count,
  minimum, p50, p95, maximum, mean, and standard deviation for each metric and
  scale. Never report a percentile without its sample count.
- [x] **Environment record:** Capture hardware/VM type, storage characteristics,
  OS/filesystem, runtime and dependency versions, network path/region, provider
  API version, sync-client state where applicable, repository protections and
  permissions, process topology, and known environmental limitations for every
  measured campaign.
- [x] **Provider requests and bytes:** Record total requests, requests per
  mutation, application payload bytes sent and received, retries, and operation
  manifests. State explicitly that HTTP/TLS headers are excluded from the
  application-payload byte count.
- [x] **Throttling:** Exercise injected throttling for correctness and record
  any live `429`, `Retry-After`, retry count, backoff time, terminal status, and
  confirmation that throttling never produces success-shaped state.
- [x] **Collaboration discovery:** Report p50/p95 and variability for the second
  client to observe a committed generation. Record whether discovery used
  provider notification, delta/change feed, ref polling, or contents polling.
- [x] **Common complexity rubric:** Score every candidate from 1 (trivial) to 5
  (very high) for dependencies, implementation, testing, migration, deployment,
  maintenance, diagnostics, and recovery. Preserve the rationale for every
  score and report the total out of 40.
- [x] **Performance gate:** Review the complete measurements only after all
  applicable absolute gates for a full architecture mapping pass. Document any
  product-usability or provider-limit threshold before using it to reject an
  otherwise correct mapping.

### OneDrive provider run

- [x] Run `BCK-002` to prove ETag/version CAS, typed stale-writer rejection,
  version recovery, and one durable generation.
- [x] Run `COL-002` with two racing client processes and prove exactly one
  winner, one conflict, and no silent overwrite.
- [x] Run `COL-003` from divergent generations and prove deterministic reload,
  conflict, and reconciled commit behavior.
- [x] Run `COL-004` and `COL-005` for lost responses, offline pending state,
  authoritative confirmation, and conflict reconciliation.
- [x] Run `COL-006` and measure when a second client discovers the committed
  generation through the backing-path change mechanism.
- [x] Run `BCK-005`, `REC-003`, and `REC-004` for throttling, outage,
  authentication expiry, quota/permission failure, retry, and cache recovery.
- [x] Run `MIG-004`, `BKP-003`, and `BKP-004` for receipt-gated rehome, history
  recovery, and one explicit restored authoritative head.
- [x] Run `PER-004` at small, medium, and stress scales and retain CAS latency,
  discovery latency, requests, bytes, retries, and throttle results.
- [ ] Run `BCK-006` separately with a Windows OneDrive sync-client profile;
  never substitute provider-API CAS evidence for synced-folder behavior. A
  same-device handle probe only measures local compatibility and cannot pass:
  `S0-BCK-006` stays `Incomplete` until two independent OneDrive sync clients on
  separate devices produce a signed cross-client evidence artifact (bound to the
  approved `syncTargetHash` and config revision) with distinct immutable client
  IDs, observed timestamps/operations, a conflict/recovery outcome, and a
  detached signature from the trusted pinned signer.

### Azure DevOps provider run

- [x] Run `BCK-003` against a disposable per-run branch and prove
  `oldObjectId` ref preconditions, typed stale-writer rejection, and one
  auditable generation commit.
- [x] Run `COL-002`, `COL-003`, and `COL-006` with two client processes using
  one account, including race, divergent-generation reconnect, and discovery
  timing.
- [x] Run `COL-004`, `COL-005`, `BCK-005`, `REC-003`, and `REC-004` for lost
  responses, offline work, provider failures, and authoritative recovery.
- [x] Run `MIG-004`, `BKP-003`, and `BKP-004` for rehome receipt, commit-history
  recovery, and restored-head authority.
- [x] Run `PER-004` at all three scales and retain CAS latency, discovery
  latency, request/byte counts, retries, and throttling behavior.
- [x] Verify the default/protected branch is unchanged and delete every
  run-owned branch and synthetic object recorded in the cleanup manifest.

### GitHub provider run

- [x] Prepare a disposable private repository and externally supplied identity
  with private-repository contents and ref write/delete permission.
- [x] Run `BCK-004` and prove blob-SHA/ref preconditions, typed stale-writer
  rejection, one durable generation, and auditable commits.
- [x] Run `COL-002`, `COL-003`, and `COL-006` with two client processes using
  one account, including race, divergent-generation reconnect, and discovery
  timing.
- [x] Run `COL-004`, `COL-005`, `BCK-005`, `REC-003`, and `REC-004`, including
  lost-response recovery and bounded read-after-write reconciliation.
- [x] Run `MIG-004`, `BKP-003`, and `BKP-004` for receipt-gated rehome, history
  recovery, and restored-head authority.
- [x] Run `PER-004` at all three scales and retain CAS latency, discovery
  latency, request/byte counts, retries, throttling, and consistency retries.
- [x] Verify the default/protected branch is unchanged and delete every
  run-owned branch, file, and repository resource recorded for cleanup.

### Local and cross-platform evidence

- [x] Run both local candidates on Windows/NTFS through all applicable absolute
  gates, process-kill scenarios, repeated scale measurements, and the common
  complexity rubric.
- [x] Run the unchanged local/cache harness on macOS/APFS and record unsupported
  behavior as `Blocked` or `N/A`, never as a pass.
- [x] Run the unchanged local/cache harness on Linux and record the actual
  filesystem and runtime used.
- [x] Re-run Windows local evidence if any shared contract, fixture, scenario,
  or reporting logic changes during provider testing.

### Evidence publication and decision

- [x] Remove stale outcome artifacts and regenerate reports from the current
  applicability-aware harness.
- [x] Regenerate all five configuration reports and the architecture-mapping
  handoff from one reviewed campaign revision.
- [x] Verify every applicable scenario has a result and every summary cell
  links to its configuration report and raw JSON evidence.
- [x] Keep relative measurements provisional and unranked until at least one
  complete architecture mapping passes every applicable absolute gate.
- [x] Scan reports, raw results, preflight records, and cleanup manifests for
  credentials, actual data, unredacted coordinates, and absolute user paths.
- [x] Verify cleanup after success and failure: no run-owned branches, folders,
  files, repositories, locks, or temporary stores remain outside an approved
  diagnostic hold.
- [ ] Select the local-engine/provider-transport mapping in the ADR, list every
  remaining condition and owner, and prepare implementer, independent-reviewer,
  cross-platform, provider-test, and ADR-approver sign-off.

## Current rerun checklist

- [x] Implement the source-level review fixes and deterministic negative tests.
- [x] Regenerate the comparison in fail-closed mode so stale evidence is
  explicitly rejected and no mapping is selected.
- [ ] Regenerate local CAS and SQLite results from the current source. SQLite is
  not eligible under the current absolute `S0-CON-003` criterion because
  `BEGIN IMMEDIATE` serializes writers database-wide. This is a known structural
  failure: a rerun alone cannot close it. Closure requires revising the criterion
  or an independently approved, scenario-specific rationale-backed `N/A`.
- [ ] Run three new live campaigns for OneDrive, ADO, and GitHub with effective
  identity and coordinates bound to a dated approved target hash.
- [ ] Rerun native cross-platform evidence because the shared contract,
  checksum, locking, migration, and result schema changed.
- [ ] Implement the corrected fresh-process startup/enumeration, memory, and
  storage-layer write-amplification protocol.
- [ ] Select an eligible mapping and obtain independent-review and ADR approval.

## Commands

```powershell
npm run spike:s0:test        # harness, detection-power, durable-detection, provider-dryrun, onedrive, and provider-gate (onedrive/ado/github) suites
npm run spike:s0:selftest    # reference adapter self-test
npm run spike:s0:compare     # run all five configurations and emit the mapping handoff
npm run spike:s0:aggregate   # combine only three complete, revision-compatible campaigns
node spikes\s0-persistence\src\compare.mjs --use-existing  # validate retained evidence; currently exits nonzero/incomplete
node spikes\s0-persistence\src\compare.mjs --use-existing --mapping=MAP-ENVELOPE  # only after this mapping is eligible
npm run spike:s0:preflight   # emit the provider preflight sheet + dry-run manifest
node spikes\s0-persistence\src\cli.mjs --list
node spikes\s0-persistence\src\cli.mjs --config spikes\s0-persistence\config\local-cas.json --dry-run
```

Generated results go under `spikes\s0-persistence\results\`. The checked-in
provider campaigns are historical and currently rejected by the comparison
validator. Publish replacements only after confirming that they are complete,
synthetic, credential-free, revision-compatible, and produced under an approved
effective-target receipt.

Identity tokens for live provider runs are supplied externally at runtime and
never stored in configuration or reports. Other runtime inputs, including
provider coordinates and optional performance-environment details, follow the
same external-supply rule. Missing runtime inputs produce `Blocked` evidence
when a campaign can be recorded safely; an unresolved or mismatched approved
target prevents the live run before any provider call.

The live environment is:

| Scope | Required variables |
|---|---|
| Every provider | `S0_PREFLIGHT_APPROVER`, `S0_PREFLIGHT_APPROVED_AT`, `S0_PREFLIGHT_APPROVAL_REFERENCE`, `S0_PREFLIGHT_TARGET_HASH` |
| OneDrive | `S0_ONEDRIVE_TOKEN`, `S0_ONEDRIVE_DRIVE_ID`, `S0_ONEDRIVE_FOLDER` |
| OneDrive synced-folder sync run (`S0-BCK-006`, separate) | `S0_ONEDRIVE_SYNC_ROOT` (path to the approved running Windows OneDrive sync-client folder), `S0_SYNC_CLIENT_IDENTITY`, `S0_SYNC_CLIENT_STATE` (must equal the approved `verified-signed-in` state), `S0_SYNC_CONFLICT_EVIDENCE` (path to a signed cross-client evidence artifact), `S0_SYNC_SIGNER_PUBLIC_KEY` (PEM/path of the trusted signer whose SPKI fingerprint is pinned in `syncProfile.trustedSignerFingerprint`), the distinct sync-approval record `S0_SYNC_APPROVER`, `S0_SYNC_APPROVED_AT`, `S0_SYNC_APPROVAL_REFERENCE`, `S0_SYNC_TARGET_HASH`, and `S0_RUN_ID` |
| Azure DevOps | `S0_ADO_TOKEN`, `S0_ADO_ORG`, `S0_ADO_PROJECT`, `S0_ADO_REPO` |
| GitHub | `S0_GITHUB_TOKEN`, `S0_GITHUB_OWNER`, `S0_GITHUB_REPO` |

The provider identity is resolved from the supplied credential; there is no
caller-provided identity variable, including for the separate OneDrive
synced-folder run. Generate the target hash from the live preflight sheet, then
supply the four shared approval variables. Changing the credential identity, any
coordinate, run ID, or namespace requires a new approval. `onedrive-live-smoke.mjs`
additionally requires `S0_RUN_ID`.

The synced-folder `S0-BCK-006` case runs separately on a Windows host with a
running OneDrive sync client; it does not use the provider-API CAS token,
drive, or folder coordinates and never substitutes provider-API CAS evidence
for synced-folder behavior. It carries a **distinct sync-approval record** whose
`S0_SYNC_TARGET_HASH` must equal the computed sync target hash and must never be
the provider-API approval hash. That approval and the sync-root/identity/state
binding are validated **before** any probe or filesystem write. Its
`S0_ONEDRIVE_SYNC_ROOT` folder, retained raw and report artifacts, and evidence
identity are stored on the OneDrive aggregate and independently re-verified during
comparison.

A synced-folder **Pass cannot come from an environment client count or an
arbitrary/self-signed JSON self-report.** The only credible closure is a retained
cross-client evidence artifact whose **detached Ed25519 signature covers the whole
authorization context** — `syncTargetHash`, config revision, signer fingerprint,
the sync approval (`targetHash`/approver/date/reference), the `validatedAt` time,
and the clients/outcomes — verified by Node's `crypto` against the trusted signer
whose SPKI fingerprint is pinned into `syncProfile` (and therefore the config
revision). The signed proof approval must canonically equal the runtime sync
approval (approver/date/reference/targetHash) validated before the probe/write, so
a proof approved for a different approval is rejected before any mutation. RSA/EC
keys are rejected before verification, and an unkeyed SHA is forgeable and is not
accepted. If no trusted key is configured, `Pass` is
unreachable and the result is `Incomplete`. The signed authorization is retained
**canonically identically** on both the raw run and the aggregate `separateSync`
record; comparison requires the two copies to match, requires the retained
authorization to be derived from (bound to) the signed proof, requires a valid
finite linked-run `completedAt` for every retained Pass, and rejects any
`validatedAt` after that `completedAt` or the current time. Because the
temporal bounds use the signed `validatedAt` capped by the current clock, waiting
can never make future-dated (e.g. a 2099 proof with a fabricated 2100 receipt)
evidence valid. Until credible automatic proof exists, the **required future
probe** is two independent OneDrive sync clients on separate devices that produce
and sign such an artifact; a same-device handle probe only measures local
compatibility and cannot close the gate.

## Detection power

Passing scenarios only mean something if they can fail. `test\detection-power.test.mjs`
and `test\durable-detection.test.mjs` run deliberately broken stores and require
the owning scenario to fail each one: no generation CAS, partial commit,
empty-on-corrupt, lost acknowledged commit, lossy restore, dangling journal
tuple, alias leak, cleared newer intent revision, unlocked cross-process write,
torn in-place write, and a commit that is acknowledged but never persisted.
`S0-CRS-003` now kills a real migration rather than relabeling restore evidence.

Broken adapters are registered only when `S0_ENABLE_TEST_MUTANTS=1`, so no
reported S0 result can be produced by one.

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
