# S0: Cross-Platform Persistence Spike

**Status:** Scenario definition  
**Date:** 2026-08-14  
**Source:** `2026-08-13-target-architecture-conformance-analysis.md`  
**Fitness gate:** `FF-S0-01`

## Purpose

S0 will select the persistence architecture for Tippani's durable Draft Workspace before R1 begins. The architecture must support today's private/local workspace and the anticipated shared workspace in which multiple users collaborate through OneDrive, Azure DevOps, or GitHub. Although the source conformance analysis describes a Windows spike, Tippani also targets macOS and Linux. This scenario definition therefore expands the gate to cross-platform and collaborative backing-store behavior.

The spike compares and may select a mapping rather than one universal engine:

1. **SQLite transactions**, with workspace, alias-index, private-state, and journal records stored as related rows. This is primarily a local-store candidate unless fronted by a collaboration service.
2. **Generation-CAS envelope**, with each workspace stored as an atomic versioned envelope plus a durable workspace/alias index. The envelope may be persisted locally, as a OneDrive item, or as versioned content in an ADO/GitHub repository.
3. **Hybrid architecture**, if evidence shows that local SQLite and provider-native shared CAS are the correct implementations behind one `IWorkspaceStore` contract.

The decision must be based on measured local and provider-backed behavior, not implementation preference. Every selected implementation must preserve exact workspace state, detect stale writers, fail closed when state cannot be trusted, and support later R1-R3 workspace, staging, and publication-journal requirements.

## Supported configuration matrix

The spike separates three dimensions that may vary independently:

1. **Workspace backing path** determines where authoritative Draft Workspace state lives and how collaborators coordinate.
2. **Content source/publish provider** determines which identifiers, document metadata, and publishable intents the workspace represents.
3. **Client operating system/filesystem** determines local cache, offline, locking, and recovery behavior.

ADO and GitHub may be both content providers and authoritative shared-workspace backing paths. The common workspace contract must not assume that authoritative state always resides on the local filesystem.

### Authoritative workspace-backing configurations

| Backing path | Required behavior |
|---|---|
| Local filesystem | Private local authority with multiple independent clients and writers: user actions through the portal, Copilot/MCP commands, headless automation, and external file/Git processes. Requires atomic transactions, optimistic concurrency, change notification, crash recovery, backup, and optional offline cache for a shared workspace |
| OneDrive | Shared workspace item/folder with provider-native version/ETag CAS, permissions, change discovery, offline/reconnect behavior, and conflict recovery across users and devices |
| Azure DevOps repository | Shared workspace envelope and index stored at an explicit repository/ref/path, updated through object/ref preconditions, with auditable commits and conflict detection |
| GitHub repository | Shared workspace envelope and index stored at an explicit repository/ref/path, updated through object/ref preconditions, with auditable commits and conflict detection |

OneDrive should be evaluated through its provider API as the authoritative collaboration path; a locally synced OneDrive folder is a separate compatibility scenario and must not be assumed to provide safe multi-writer coordination. ADO and GitHub must use provider-native object/ref concurrency rather than treating a checked-out clone as the shared store.

No additional collaboration provider is required for S0. SharePoint document-library storage uses the same drive/item concurrency family as OneDrive and can be recorded as a future adapter variant. The contract must remain provider-neutral.

### Content source/publish configurations

| Configuration | State the Draft Workspace must represent |
|---|---|
| Curated Local Markdown / Reading List | Local file identity, approved root, annotations, viewed/progress state, selection, and recovery metadata |
| Local Git clone or linked worktree | Repository identity, branch, baseline and observed-upstream commits, owned-path hashes, outgoing-commit recognition, private state, and journals |
| ADO repository, branch, or PR | Canonical account/project/repository/ref/PR aliases, Remote Markdown, provider-visible pending intents, private state, and publication journals |
| GitHub repository, branch, or PR | Canonical account/repository/ref/PR aliases, Remote Markdown, provider-visible pending intents, private state, and publication journals |
| Provider-independent pre-PR authoring | Branch/folder/file/PR intents before a PR exists, followed by an alias transition into the created PR without forking the workspace |

The spike must include same-provider and cross-provider cases. For example, an ADO-backed shared Draft Workspace may coordinate work targeting ADO, while a OneDrive-backed shared Draft Workspace may contain intent targeting either ADO or GitHub.

### Prerequisites Kay must provide

The ADO and GitHub provider-backed spike cannot begin until Kay supplies or confirms the following. Do not place credentials, tokens, recovery codes, or other secrets in this document or any spike report.

#### Synthetic-data-only rule

All S0 sandbox accounts, organizations, projects, repositories, drives, document libraries, local fixtures, and test reports may contain **synthetic data only**.

- Do not store, copy, transform, upload, mirror, cache, or derive test fixtures from actual Microsoft, customer, partner, employee, production, telemetry, support, or personal data.
- Do not copy real repository files, specifications, comments, work items, identities, email addresses, organization/project/repository names, branch names, URLs, screenshots, logs, or metadata into a sandbox.
- Synthetic people, organizations, repositories, documents, comments, histories, timestamps, and identifiers must be obviously fictional and generated for S0.
- Logs, traces, crash dumps, backups, exports, screenshots, reports, cleanup manifests, and retained diagnostic artifacts must contain only synthetic content and redacted credentials.
- Test generators must start from approved synthetic seeds; they must not sanitize or anonymize actual data for reuse.
- If actual or production-derived data is detected, stop the run, prevent further upload or propagation, quarantine the affected artifacts, notify Kay, and delete them under the approved incident/cleanup procedure. The affected result is invalid and must be rerun with synthetic data.

This rule applies even when a sandbox account is private, disposable, or accessible only to Kay. Access isolation does not make actual data acceptable.

#### Sandbox identity and authentication

- A dedicated non-corporate sandbox identity funded or entitled through Kay's Visual Studio subscription.
- Confirmation of the exact signed-in identity expected for each sandbox, using a non-secret account label or email only.
- An explicit statement that Kay's Microsoft corporate account has no access to these sandboxes and must not be used as an authentication fallback.
- A clean authentication context for the harness, separate from corporate Azure CLI, GitHub CLI, browser, Git credential-manager, and environment-variable sessions.
- The approved authentication method for each provider:
  - ADO: Visual Studio subscription sandbox identity plus a least-privilege sandbox token/service identity.
  - GitHub: sandbox account/organization plus a repository-scoped GitHub App installation or fine-grained token.
- A way to verify the effective identity and target tenant/organization before provisioning, with secret values redacted.

The harness must fail closed if the effective identity, tenant/organization, or repository differs from the supplied sandbox configuration. It must never search other cached accounts or silently fall back to Kay's Microsoft corporate identity.

#### Azure DevOps sandbox

Kay must provide:

- Sandbox ADO organization URL created or accessed through the Visual Studio subscription identity.
- Sandbox project name or immutable project ID.
- Permission either to create a disposable S0 repository or the coordinates of an empty disposable repository.
- Confirmation that the identity may create/delete per-run branches and synthetic files within that repository.
- Confirmation that no production pipelines, service hooks, policies, work items, or external integrations will run from the test namespace.
- The approved repository and request/storage budgets, diagnostic-retention period, and cleanup deadline.

#### GitHub sandbox

Kay must provide:

- Sandbox GitHub account or organization name.
- Permission either to create a disposable private S0 repository or the coordinates of an empty disposable repository.
- A repository-scoped test identity with only the permissions required by the selected scenarios.
- Confirmation that Actions, webhooks, rulesets, apps, and other integrations are absent or safely disabled for the test repository.
- The approved repository and API budgets, diagnostic-retention period, and cleanup deadline.

#### OneDrive collaboration sandbox

Kay must provide:

- A non-production OneDrive or SharePoint document-library location accessible to at least two test identities when multi-user collaboration is exercised.
- Confirmation that the location contains no production or personal content.
- Permission to create, version, restore, and delete synthetic S0 files.
- The approved quota, retention, sharing, and cleanup settings.

If the Visual Studio subscription does not provide the required OneDrive entitlement, this configuration is `Blocked` until a separate approved non-production Microsoft 365 sandbox is available; it must not fall back to Kay's corporate OneDrive.

#### Local and cross-platform test capacity

Kay must provide or approve:

- Windows/NTFS, macOS/APFS, and Linux test runners or machines.
- Permission to create disposable local stores, processes, and fault-injection fixtures.
- A OneDrive sync-client test profile on Windows if synced-folder compatibility is tested.
- Representative resource limits and dataset sizes.

#### Approval checkpoint

Before execution, Kay reviews a generated preflight sheet containing only:

- Effective non-secret identity labels.
- Sandbox organization/project/repository or drive/item coordinates.
- Ownership markers and per-run namespaces.
- Effective permission summaries.
- Default/protected branch exclusions.
- Operation, request, object, time, and storage budgets.
- Cleanup manifests, retention holds, and expiry dates.

Execution requires Kay's explicit approval of that preflight sheet. Any missing prerequisite remains `Blocked`; the harness must not compensate by using an accessible corporate or production resource.

### ADO and GitHub test-safety contract

S0 must never run fault injection, concurrency races, migration, corruption, cleanup, or performance tests against a production repository, branch, organization/project, or user workspace.

#### Required test resources

| Resource | Azure DevOps | GitHub |
|---|---|---|
| Isolation boundary | Dedicated non-production organization or explicitly approved sandbox project | Dedicated test organization or isolated test account |
| Repository | Disposable repository created only for S0 | Disposable private repository created only for S0 |
| Branch namespace | `refs/heads/tippani-s0/<run-id>/...` | `tippani-s0/<run-id>/...` |
| Identity | Dedicated test service principal/user with access only to the sandbox project/repository | Dedicated GitHub App installation or fine-grained token scoped only to the test repository |
| Permissions | Minimum repository read/write needed for refs, commits, and test cleanup; no org/project administration | Contents read/write and metadata read only unless a scenario explicitly requires more |
| Secrets | Supplied by the test environment/credential broker; never committed, logged, embedded in reports, or stored in workspace data | Same |

The harness must require explicit sandbox coordinates and reject defaults. It must fail before the first provider call when:

- Repository or project/organization allow-list validation fails.
- The repository lacks an S0 ownership marker created during provisioning.
- The branch is outside the per-run `tippani-s0/<run-id>` namespace.
- The credential has broader scope than the approved test identity policy.
- A destructive scenario targets a pre-existing ref, object path, or workspace not created by that run.

#### Provisioning and cleanup

1. Provision a fresh repository or a fresh isolated namespace for each test campaign.
2. Write a machine-readable ownership marker containing the campaign/run ID, creator, creation time, expiry, and cleanup policy.
3. Seed only synthetic Markdown, workspace envelopes, identities, and histories. Never copy production documents, comments, names, repository coordinates, or credentials.
4. Record every created repository, ref, path, commit, and workspace in a cleanup manifest before mutating it.
5. Delete only resources present in that manifest and still carrying the matching ownership marker.
6. Run cleanup after success and failure; retain failed-run resources only under an explicit diagnostic hold with an expiry.
7. Run a scheduled reaper that reports and removes expired S0 resources using the same ownership checks.

#### Provider-safe fault injection

- Inject lost responses, timeouts, throttling, authentication expiry, and process crashes in the client/harness whenever possible; do not impair provider services.
- Create concurrency with bounded test clients and per-run refs rather than shared or default branches.
- Simulate branch protection and permission loss inside the sandbox only.
- Enforce request, object, repository-size, and run-duration budgets. Stop before provider abuse/rate-limit thresholds.
- Never force-push, delete, rewrite, or migrate `main`, `master`, a default branch, a protected production-like branch, or any ref not created by the run.
- Corruption tests modify synthetic envelope content in the test namespace; they do not corrupt repository administration data or unrelated Git objects.

#### Required preflight evidence

Before the ADO or GitHub harness can run, its report must capture:

- Approved sandbox organization/project/repository URL or immutable IDs.
- Verified ownership marker and per-run namespace.
- Test identity and effective repository permissions, with secret values redacted.
- Default/protected branch identification and proof it is excluded.
- Planned request/object/time budgets.
- Cleanup manifest location and expiry.
- A dry-run listing every provider operation without executing it.

Any missing preflight item is `Blocked`. Convenience, existing access, or a successful dry run against production-like coordinates is not approval.

### Client operating-system and local-cache configurations

| Platform | Minimum coverage | Status |
|---|---|---|
| Windows | Supported Windows release on NTFS; local private workspace, shared-workspace cache, and OneDrive synced-folder compatibility probe | **Executable now** |
| macOS | Supported macOS release on APFS; local private workspace and shared-workspace cache | **Deferred — no runner available** |
| Linux | Supported Linux distribution on ext4 or the CI/runtime default filesystem; local private workspace and shared-workspace cache | **Deferred — no runner available** |

macOS and Linux runners do not exist in the current environment, so S0 executes on Windows/NTFS first. This is a deferral, not a reduction in scope: the store contract and scenario catalog stay platform-neutral, the harness must run unchanged once runners exist, and the ADR records macOS and Linux as `Blocked — no runner` rather than as passes. A Windows-only result may select the local implementation for Windows delivery, but it cannot close the cross-platform portability criterion.

WSL is not a separate product target for S0. If tested, it is recorded as a Linux compatibility result rather than evidence for native Windows behavior.

### Multi-client and shared collaboration invariants

Every backing path, including the local filesystem, must prove:

- Two independent actors or clients can read the same stable `WorkspaceId` and generation. Locally, this includes the user/portal and Copilot/MCP operating concurrently; remotely, it also includes multiple users and devices.
- A write carries an expected provider version/object/ref and cannot silently overwrite a newer generation.
- One winning mutation advances the generation; stale writers receive a typed conflict with enough state to reload or reconcile.
- Independent workspaces can progress concurrently.
- Provider outage, throttling, expired authentication, lost responses, and delayed change notification never produce success-shaped local state.
- Reconnect discovers every committed remote generation before accepting another write.
- Offline work remains explicitly pending and is never labeled shared until provider CAS confirms it.
- Provider permissions control access without embedding provider credentials in workspace data.
- History identifies the actor/client and preserves an auditable generation chain without storing secrets.

Local authority is private, not single-writer. The store must not serialize all behavior by assumption or grant either the portal/user path or Copilot/MCP path implicit priority. Both mutate through the same expected-generation contract, receive the same typed conflicts, and observe committed changes through one notification/reload mechanism. External Local file or Git changes remain source observations that can invalidate a pending operation even when they do not directly write the Draft Workspace store.

## State the spike must represent

The test model should be smaller than the eventual R1 schema while retaining the relationships that drive the storage decision:

- Stable `WorkspaceId`.
- Multiple canonical aliases resolving to one workspace.
- Multiple documents within one workspace.
- Monotonic workspace generation.
- Remote pushable intents with stable IDs, revisions, content hashes, and ordering.
- Workspace-private state such as annotations, viewed/progress state, pending proposals, selection, and recovery metadata.
- Publication journal records linked to the workspace and publication target.
- Schema and provider-operation versions.
- Audit and lifecycle metadata.

For today's Local mode, Markdown remains in the working tree or curated file and the workspace persists only identity, ownership, and hash metadata. A future shared workspace may persist collaborative draft content in its authoritative OneDrive/ADO/GitHub backing path. The spike must preserve that distinction rather than forcing Local working-tree Markdown into a shadow copy.

## Scenarios

### Stable scenario ID convention

Every requirement, automated test, raw result, report row, defect, and ADR finding uses an immutable ID:

```text
S0-<CATEGORY>-<NNN>
```

Rules:

- IDs describe the invariant being tested, not one implementation.
- Once published, an ID is never renamed or reused. A retired scenario remains in the registry as `Retired` with its replacement.
- Engine, backing path, operating system, filesystem, dataset scale, actor topology, and fault point are result dimensions; they are not encoded in the scenario ID.
- Repeated fault points use a `variant` field, such as `before-commit`, `after-provider-success-response-lost`, or `writer=user-vs-mcp`.
- A configuration may mark an ID `N/A` only with a contract-based explanation and reviewer approval.
- Each required configuration must publish one result for every applicable ID. Missing results are `Incomplete`.

Categories:

| Prefix | Area |
|---|---|
| `ATM` | Atomic logical mutation |
| `CON` | Concurrency and stale-writer/CAS behavior |
| `JRN` | Publication-journal preparation |
| `CRS` | Kill-point and crash consistency |
| `COL` | Multi-client, multi-user, and multi-device collaboration |
| `BCK` | Backing-path commit, replace, and conflict behavior |
| `COR` | Corruption and fail-closed behavior |
| `HYD` | Enumeration and rehydration |
| `MIG` | Schema migration and rehome |
| `IMP` | Legacy import |
| `BKP` | Backup, snapshot, and restore |
| `REC` | Operational recovery |
| `SEC` | Sandbox, identity, synthetic-data, and secret safety |
| `PER` | Performance, scale, and cost |

### Stable scenario registry

| ID | Required invariant | Primary section |
|---|---|---|
| `S0-ATM-001` | A multi-field workspace mutation commits completely or not at all | 1 |
| `S0-ATM-002` | Branch-to-PR alias transition preserves one workspace and commits alias/index/state atomically | 1 |
| `S0-ATM-003` | Failed mutation exposes no empty-body intent, mixed generation, or dangling alias | 1 |
| `S0-CON-001` | Portal/user and Copilot/MCP writers from generation `g` produce one winner and one typed stale conflict | 2 |
| `S0-CON-002` | Multiple headless/automation clients cannot overwrite a newer generation | 2 |
| `S0-CON-003` | Independent workspaces progress concurrently without global serialization | 2 |
| `S0-CON-004` | Concurrent staging during publication preserves the newer intent revision | 2 |
| `S0-CON-005` | Lock/CAS contention is bounded, observable, and retryable | 2 |
| `S0-JRN-001` | Frozen intent tuples and `planned` journal become durable atomically before any provider operation | 3 |
| `S0-JRN-002` | No journal references a missing workspace, generation, or intent revision | 3 |
| `S0-CRS-001` | Kill before/during/after commit recovers only the complete previous or committed generation | 4 |
| `S0-CRS-002` | Kill during alias/index update never exposes a partially updated index | 4 |
| `S0-CRS-003` | Kill during backup or migration leaves an unambiguous recoverable state | 4 |
| `S0-COL-001` | Independent local actors observe one stable workspace/generation and equal concurrency rules | 5 |
| `S0-COL-002` | Two users on a shared backing path cannot silently overwrite each other | 5 |
| `S0-COL-003` | Two devices reconnecting from different generations receive deterministic conflict/reload behavior | 5 |
| `S0-COL-004` | Remote success with a lost response is reconciled without duplicate generation or false failure | 5 |
| `S0-COL-005` | Offline work remains pending until authoritative CAS confirmation and reconciles without silent overwrite | 5 |
| `S0-COL-006` | Another collaborator discovers a committed generation through the backing path's change mechanism | 5 |
| `S0-BCK-001` | Local flush and atomic replace preserve file and index durability under supported filesystems | 6 |
| `S0-BCK-002` | OneDrive ETag/version preconditions reject stale updates and support version recovery | 6 |
| `S0-BCK-003` | ADO object/ref preconditions reject stale updates and preserve one auditable generation commit | 6 |
| `S0-BCK-004` | GitHub object/ref preconditions reject stale updates and preserve one auditable generation commit | 6 |
| `S0-BCK-005` | Provider outage, throttling, auth expiry, quota, or permission loss never produces success-shaped state | 6 |
| `S0-BCK-006` | Synced-folder conflict behavior is measured separately from provider-API CAS | 6 |
| `S0-COR-001` | Truncated, invalid, checksum-failing, or damaged primary state is detected and preserved/quarantined | 7 |
| `S0-COR-002` | Missing/dangling aliases and duplicate identities fail closed | 7 |
| `S0-COR-003` | Unsupported schema/provider-operation version fails closed with a typed state | 7 |
| `S0-COR-004` | Permission-denied or unreadable existing state is never treated as an absent/new store | 7 |
| `S0-HYD-001` | Startup enumerates and validates all workspaces/aliases before APIs open | 8 |
| `S0-HYD-002` | Rehydration restores exact generation, intent order, private state, journal state, and last selection | 8 |
| `S0-HYD-003` | Incomplete/indeterminate journals are surfaced for reconciliation before mutation is accepted | 8 |
| `S0-MIG-001` | Forward migration is transactional or resumable, idempotent, and preserves originals/audit | 9 |
| `S0-MIG-002` | Interrupted migration resumes or rolls back without ambiguity | 9 |
| `S0-MIG-003` | Unsupported source version and downgrade policy are explicit and fail closed | 9 |
| `S0-MIG-004` | Local-to-OneDrive/ADO/GitHub rehome preserves `WorkspaceId` and establishes one authority only after receipt | 9 |
| `S0-IMP-001` | Complete checksummed legacy envelope validates before atomic import | 10 |
| `S0-IMP-002` | Failed/corrupt/duplicate legacy import preserves source and creates no partial destination | 10 |
| `S0-BKP-001` | Active-store backup is internally consistent at one logical generation | 11 |
| `S0-BKP-002` | Restore reproduces exact workspace/journal state and rejects incomplete/corrupt backup | 11 |
| `S0-BKP-003` | Shared-backing history/export recovers a known generation without rewriting newer valid history | 11 |
| `S0-BKP-004` | Restored shared workspace establishes one explicit authoritative head | 11 |
| `S0-REC-001` | Clean and forced shutdown restart recover exact durable state | 12 |
| `S0-REC-002` | Stale lock recovery removes only provably owned stale state | 12 |
| `S0-REC-003` | Provider outage/auth/throttle/lost-response recovery reconciles authoritative state | 12 |
| `S0-REC-004` | Local offline cache reconciles against newer authority without silent overwrite | 12 |
| `S0-REC-005` | Diagnostics identify recovery state without exposing content or credentials | 12 |
| `S0-SEC-001` | Preflight rejects non-allow-listed, unmarked, default/protected, or production coordinates before provider calls | Safety contract |
| `S0-SEC-002` | Effective sandbox identity is verified and corporate-account fallback is impossible | Prerequisites |
| `S0-SEC-003` | Only synthetic data appears in stores, fixtures, logs, backups, screenshots, dumps, and reports | Prerequisites |
| `S0-SEC-004` | Credentials remain brokered/redacted and absent from workspace state and evidence | Safety contract |
| `S0-SEC-005` | Cleanup/reaper deletes only run-owned resources recorded in the manifest | Safety contract |
| `S0-SEC-006` | Provider request/object/time/storage budgets stop unsafe or abusive runs | Safety contract |
| `S0-PER-001` | Cold startup and enumeration are measured at small, medium, and stress scale | 13 |
| `S0-PER-002` | Alias-open, mutation, conflict, and journal p50/p95 are measured comparably | 13 |
| `S0-PER-003` | Backup/restore time, store size, memory, and write amplification are measured comparably | 13 |
| `S0-PER-004` | Provider requests, bytes, throttling, CAS latency, and collaborator discovery are measured comparably | 13 |
| `S0-PER-005` | Operational and implementation complexity is recorded using the same rubric | Decision criteria |

### 1. Atomic workspace mutation

Persist one logical mutation that changes several related values together:

- Add or update a document and its complete Remote Markdown body.
- Add an immutable intent revision and update intent ordering.
- Increment the workspace generation.
- Update the live selected document and private recovery state.
- Update the alias index when a branch workspace gains a PR alias.

After success, every value must be visible. After failure, none of the mutation may be visible. The store must never expose an empty-body intent, a new generation with old state, or an alias that points to a missing workspace.

### 2. Optimistic concurrency and stale writers

Exercise two clients reading generation `g` and attempting conflicting updates:

- Exactly one update from expected generation `g` succeeds.
- The stale writer receives a typed conflict and cannot overwrite generation `g+1`.
- Explicitly race a portal/user mutation against a Copilot/MCP mutation in both orders.
- Race multiple Copilot/headless clients and a reconnecting portal against one local workspace.
- Non-conflicting writes to independent workspaces may proceed concurrently.
- Concurrent staging during publication preserves the newer intent revision.
- Lock contention has bounded, observable behavior rather than indefinite blocking.

Run the stale-writer scenario against local SQLite/envelope concurrency and provider-native OneDrive ETags, ADO object/ref preconditions, and GitHub object/ref preconditions. A local file lock is not evidence that distributed collaboration is safe.

### 3. Multi-record publication preparation

Atomically freeze a publication unit containing:

- Workspace and publication-target identity.
- Source workspace generation.
- Multiple document and review-intent revision tuples.
- Deterministic provider-operation identities and versions.
- A `planned` journal state.

The journal must be durable before any simulated provider call. A workspace may never claim publication started without the corresponding recoverable journal, and a journal may never reference missing intent revisions.

### 4. Kill-point crash consistency

Terminate the writer process before, during, and after each commit boundary:

- Before any durable write.
- After temporary/WAL bytes are written but before commit.
- During flush, rename, journal, or transaction commit.
- Immediately after commit returns.
- During index or alias update.
- During backup or migration.

On restart, the result must be either the complete previous generation or the complete committed generation. Recovery must not fabricate an empty workspace, silently omit a journal, or accept a partially updated alias index.

### 5. Concurrent clients, users, and processes

Use separate Node.js processes, not only promises in one process, to cover:

- Two portal or headless clients opening the same workspace.
- A portal/user edit and Copilot/MCP command targeting the same generation.
- Multiple Copilot or automation clients targeting the same workspace.
- Simultaneous readers and one writer.
- Two competing writers.
- Independent writers targeting different workspaces.
- A process dying while holding a database, file, or lock handle.
- Retry after a stale or abandoned lock.
- Two authenticated users updating one OneDrive-, ADO-, or GitHub-backed workspace.
- Two devices for one user reconnecting with different observed generations.
- A remote write succeeding while its client loses the response.

Measure lock/CAS acquisition latency, retry behavior, propagation delay, and whether recovery requires manual cleanup. Record local Windows sharing violations, Unix advisory-lock behavior, OneDrive ETag conflicts, and ADO/GitHub ref conflicts separately rather than assuming they are equivalent.

### 6. Backend commit, replace, and conflict behavior

For a local backing path, run the full correctness harness in each platform-local application-data directory:

- File and containing-directory durability expectations.
- Atomic replacement behavior when the destination exists.
- Antivirus/indexer contention where applicable.
- Read-only files, denied permissions, and temporarily unavailable paths.
- Disk-full or quota failure.
- Long paths and Unicode workspace coordinates.

For a OneDrive backing path, test:

- ETag/version preconditions and atomic replacement of the authoritative item or manifest.
- Simultaneous updates from different users.
- Delta/change discovery, delayed notification, and client reconnect.
- Throttling, quota, permission changes, offline writes, lost responses, and version restore.
- The synced-folder path separately, including sync conflict artifacts; do not treat it as equivalent to provider-API CAS.

For ADO and GitHub backing paths, test:

- Expected object/ref/commit preconditions for every generation update.
- Simultaneous non-fast-forward updates.
- Multi-file envelope/index updates represented as one auditable commit.
- Branch protection, permissions, throttling, provider outage, lost responses, and retry lookup.
- Change discovery after another collaborator commits.

The ADR must state what durability and collaboration guarantees each backing path provides and where behavior intentionally differs behind the common contract.

### 7. Corruption and fail-closed startup

Inject:

- Truncated primary data.
- Invalid JSON/envelope bytes.
- Damaged SQLite pages or WAL files.
- Checksum mismatch.
- Missing workspace referenced by the alias index.
- Duplicate aliases or workspace IDs.
- Unsupported schema or provider-operation version.
- Permission-denied and unreadable store files.

Startup must distinguish a truly absent/new store from an unreadable or corrupt existing store. Untrusted state is quarantined or preserved for diagnosis, APIs remain closed, and no failure is converted to an empty successful workspace.

### 8. Boot-time enumeration and rehydration

Restart with many workspaces and verify:

- Every workspace and alias is enumerated before APIs open.
- Alias lookup resolves the same stable `WorkspaceId`.
- Exact generation, intent IDs/revisions/order, private state, journal state, and last selection are recovered.
- An incomplete or indeterminate journal is surfaced for reconciliation.
- Startup time and memory remain acceptable at representative and stress-scale counts.

### 9. Schema migration and interruption

Migrate from a prior supported schema while preserving the original:

- Successful forward migration.
- Crash at every migration boundary.
- Restart and resume or roll back without ambiguity.
- Unsupported source version fails closed.
- Repeated migration is idempotent.
- Alias, identity, intent, audit, and journal histories remain traceable.
- Downgrade/rollback behavior is explicit.

S0 need not implement the full legacy bridge, but the selected store must prove that transactional or resumable migration is practical.

Also prove a workspace can be rehomed from a private local backing path to OneDrive, ADO, or GitHub without changing `WorkspaceId`, losing history, or allowing both copies to remain authoritative. The destination becomes authoritative only after validation and a durable handoff receipt.

### 10. Legacy import transaction

Model the later R2 handoff by importing a complete checksummed envelope:

- Validate all records before accepting any.
- Import workspace state, aliases, documents, and pending intents atomically.
- Produce an import receipt only after durable commit.
- Preserve the source envelope on failure.
- Reject corrupt, incomplete, duplicate, or mismatched records without partial import.

### 11. Backup, snapshot, and restore

Create a backup while the store is active and prove:

- The backup is internally consistent at one logical generation.
- Backup does not require unsafe copying of partially written files.
- Restore into a clean location reproduces exact workspace and journal state.
- Corrupt or incomplete backups are rejected.
- Backup and restore do not expose provider credentials because the workspace store contains identity references only.
- OneDrive version history or export, and ADO/GitHub commit history or export, can recover a known generation without rewriting newer valid history.
- A restored shared workspace has one explicit authoritative head; recovery never forks collaborators onto two heads silently.

### 12. Operational recovery

Exercise realistic recovery workflows:

- Restart after clean shutdown.
- Restart after forced process termination.
- Recover after machine reboot simulation.
- Recover after failed migration.
- Recover or diagnose a stale lock.
- Quarantine corrupt state while retaining evidence.
- Restore from the latest valid backup.
- Recover a shared workspace after provider outage, authentication expiry, throttling, permission removal, or a lost write response.
- Reconcile a local offline cache against a newer authoritative OneDrive/ADO/GitHub generation without silent overwrite.

Diagnostics must identify the affected store/workspace and recovery state without logging Markdown bodies, provider credentials, bootstrap tokens, or app-session bearers.

### 13. Performance and scale

Use representative small, medium, and stress datasets and measure:

- Cold startup and complete enumeration.
- Open-by-alias latency.
- Single mutation latency.
- Concurrent writer latency and conflict rate.
- Journal append/update latency.
- Backup and restore time.
- Database/envelope size and write amplification.
- Provider request count, bytes transferred, throttling behavior, and remote CAS latency.
- Time for another collaborator to discover a committed generation.

The purpose is not to choose the fastest option in isolation. Performance is acceptable only after correctness, recoverability, and operational simplicity are satisfied.

## Decision criteria

S0 uses two kinds of acceptance criteria:

1. **Absolute gates** are non-negotiable correctness, safety, and recoverability requirements. A configuration that fails any applicable absolute gate is rejected regardless of how well it performs relative to another candidate.
2. **Relative criteria** compare only the configurations that pass every applicable absolute gate. These results determine the preferred implementation or implementation mapping in the ADR.

### Absolute disqualifying gates

Every applicable configuration must prove:

- Atomic logical mutations with no partial generation, intent, alias, journal, or index state.
- No silent data loss, duplication, fabricated success, or overwrite of a newer generation.
- Typed stale-writer/CAS rejection for concurrent portal/user, Copilot/MCP, automation, device, and collaborator writes.
- Crash recovery to either the complete previous generation or the complete committed generation.
- Corrupt, unreadable, unsupported, or inconsistent state is preserved/quarantined and fails closed; it never becomes an empty successful workspace.
- Migration and interruption are transactional or resumable, idempotent, and auditable.
- Backup/restore produces an internally consistent known generation with one explicit authoritative head.
- Provider outage, throttling, auth expiry, lost responses, and offline/reconnect never create success-shaped shared state before authoritative CAS confirmation.
- Secrets are excluded from workspace data and evidence; only synthetic data is used in every sandbox and artifact.
- ADO/GitHub/OneDrive tests remain inside approved non-production coordinates and ownership-checked namespaces.
- The implementation conforms to the common `IWorkspaceStore` contract or exposes an approved typed capability/policy difference.

`Blocked`, `Incomplete`, or untested required gates do not count as passes.

### Relative comparison criteria

Among configurations that pass the absolute gates, compare:

- Cold startup and enumeration latency.
- Open-by-alias, mutation, conflict-detection, journal, backup, restore, and collaborator-discovery latency.
- Concurrent throughput and contention behavior.
- Store size, memory use, write amplification, and provider requests/bytes.
- Throttling sensitivity, offline usability, diagnostics, and recovery effort.
- Cross-platform consistency and provider-specific caveats.
- Dependency, implementation, test, migration, deployment, and ongoing maintenance complexity.
- Operational cost and support burden.

Relative metrics should use the same fixtures, workload mix, timing method, repetitions, and reported statistics. No arbitrary performance threshold should disqualify a correct candidate unless testing reveals a concrete product-usability or provider-limit failure; such a threshold must then be documented with evidence before the ADR decision.

### Evidence matrix

The ADR should report each viable engine/backing-path combination against:

| Criterion | Type | Required evidence |
|---|---|---|
| Atomicity | Absolute | No partial logical mutation across all injected failures |
| Concurrency | Absolute | Typed stale-writer conflicts and no silent overwrite |
| Collaboration | Absolute | Multi-user/device CAS, change discovery, offline/reconnect, and no fabricated shared state |
| Crash recovery | Absolute | Previous or committed generation only |
| Corruption handling | Absolute | Quarantine/preservation and fail-closed startup |
| Migration | Absolute | Transactional or resumable, idempotent, auditable |
| Backup/restore | Absolute | Consistent known-generation snapshot and exact restore |
| Safety/security | Absolute | Synthetic-only data, production isolation, and secret exclusion |
| Contract portability | Absolute | One logical `IWorkspaceStore` contract or approved typed capability difference |
| Platform behavior | Relative | Measured Windows/NTFS, macOS/APFS, and Linux/local-filesystem results |
| Backing-path behavior | Relative | Measured local filesystem, OneDrive API, ADO repository, and GitHub repository results |
| Synced-folder behavior | Relative | OneDrive synced-folder compatibility result, distinguished from provider-API collaboration |
| Scale/performance | Relative | Comparable startup, mutation, concurrency, provider, and storage measurements |
| Operability | Relative | Diagnostics and recovery procedures/effort |
| Complexity | Relative | Implementation and maintenance burden for R1-R3 |

## Spike outcome report template

Create one completed report for every tested engine/backing-path configuration. Use the same scenario IDs, dataset definitions, timing method, and pass/fail semantics so results remain comparable.

```markdown
# S0 Outcome: <engine> on <backing path>

**Report date:** YYYY-MM-DD
**Implementer:**
**Reviewer:**
**Code/fixture revision:**
**Harness revision:**
**Configuration ID:** <stable short ID>
**Recommendation:** Proceed | Proceed with conditions | Do not proceed | Incomplete

## 1. Configuration

| Dimension | Value |
|---|---|
| Engine | SQLite | generation-CAS envelope | hybrid component |
| Authoritative backing path | Local filesystem | OneDrive | ADO | GitHub |
| Client OS/filesystem | Windows/NTFS | macOS/APFS | Linux/<filesystem> |
| Provider/API version | |
| Runtime and dependency versions | |
| Store/cache location | |
| Sync/offline mode | |
| Authentication/permission setup | |
| Sandbox ownership marker | |
| Per-run namespace and cleanup expiry | |
| Provider operation/request budget | |
| Dataset scale | Small | Medium | Stress |
| Concurrent actors | |

## 2. Environment and method

- Hardware/VM and storage characteristics:
- Network characteristics and region:
- OneDrive sync-client state, when applicable:
- ADO/GitHub repository, branch protection, and permission setup:
- Sandbox allow-list, ownership-marker, and default-branch exclusion evidence:
- Dry-run operation manifest:
- Cleanup manifest and expiry:
- Provider request/object/time budgets:
- Process/user/device topology:
- Fault-injection mechanism and kill points:
- Timing method, warm-up, repetitions, and reported statistic:
- Known environmental limitations:

## 3. Scenario results

| Scenario ID | Variant / fault point | Expected invariant | Result | Evidence link | Duration / retries | Notes |
|---|---|---|---|---|---|---|
| S0-01 | | | Pass / Fail / Blocked / N/A | | | |

Every `Fail`, `Blocked`, or `N/A` entry requires an explanation. Do not collapse repeated fault points into one row unless the raw per-run evidence remains linked.

## 4. Correctness summary

| Criterion | Outcome | Evidence and deviations |
|---|---|---|
| Atomicity | |
| Stale-writer/CAS behavior | |
| Multi-client or multi-user collaboration | |
| Crash recovery | |
| Corruption handling | |
| Migration/interruption | |
| Backup/restore | |
| Offline/reconnect | |
| Local-to-shared rehome | |
| Security and secret exclusion | |

## 5. Measurements

| Relative metric | Small | Medium | Stress | Comparative result / product-limit finding | Outcome |
|---|---:|---:|---:|---:|---|
| Cold startup/enumeration | | | | | |
| Open by alias p50/p95 | | | | | |
| Mutation commit p50/p95 | | | | | |
| Conflict detection p50/p95 | | | | | |
| Journal update p50/p95 | | | | | |
| Collaborator change discovery p50/p95 | | | | | |
| Backup / restore | | | | | |
| Provider requests and bytes per mutation | | | | | |
| Store size / write amplification | | | | | |

Attach raw machine-readable results; this table is a summary, not the evidence source.

## 6. Failures and recovery

| Failure ID | Trigger | Observed state | User-visible behavior | Automatic recovery | Manual recovery | Data loss/duplication |
|---|---|---|---|---|---|---|
| | | | | | | |

## 7. Operational assessment

- Diagnostics quality:
- Quarantine and evidence preservation:
- Backup/restore usability:
- Lock/CAS conflict usability:
- Provider throttling/outage behavior:
- Maintenance and dependency burden:
- Platform-specific caveats:
- Unsupported or degraded configurations:

## 8. Contract deviations

List every behavior that differs from the common `IWorkspaceStore` contract, why it differs, and whether the difference is exposed as a typed capability/policy rather than hidden adapter behavior.

## 9. Risks and required follow-up

| Risk / follow-up | Severity | Owner | Required before | Tracking link |
|---|---|---|---|---|
| | | | | |

## 10. Configuration recommendation

State whether this configuration should proceed, proceed with conditions, or be rejected. Tie the recommendation to measured evidence, list all conditions, and identify any scenario that must be rerun.

## 11. Sign-off

| Role | Person | Date | Decision / comments |
|---|---|---|---|
| Implementer | | | |
| Independent reviewer | | | |
```

After completing the individual configuration reports, create one comparison summary for the ADR:

| Configuration | Correctness gate | Collaboration gate | Recovery gate | Performance gate | Complexity | Recommendation | Conditions |
|---|---|---|---|---|---|---|---|
| Local SQLite | | | | | | | |
| Local generation-CAS envelope | | | | | | | |
| OneDrive generation-CAS envelope | | | | | | | |
| ADO generation-CAS envelope | | | | | | | |
| GitHub generation-CAS envelope | | | | | | | |

The ADR must link every summary cell to a completed configuration report and raw evidence. Missing evidence is `Incomplete`, not a pass.

## Out of scope

- Final R1 production schema and repository interfaces.
- Publication-provider reconciliation and idempotency for comments, PRs, votes, and repository content. Workspace-backing CAS/retry/recovery is in scope.
- Any S0 operation against production ADO/GitHub resources or production-derived content.
- Local Git working-tree, commit, and push safety.
- Retention duration and tombstone policy.
- Migrating production users during the spike.
- Selecting a store solely from a synthetic throughput benchmark.

## Exit condition

S0 is complete only when the viable local SQLite, local envelope, OneDrive envelope, ADO envelope, and GitHub envelope configurations run the applicable automated correctness and collaboration harnesses; cross-platform local/cache results are recorded; measured results and failures are published; and an approved ADR selects the persistence architecture and implementation mapping behind one workspace-store contract. The ADR must also record authoritative-head, offline, rehome, and support policies. R1 design must not begin before that approval.

Windows/NTFS is the first executable platform. macOS and Linux are deferred until runners exist and are recorded as `Blocked — no runner`. R1 may begin on an approved Windows-scoped ADR provided the ADR states that the cross-platform portability criterion remains open, no macOS or Linux result is represented as a pass, and the harness is rerun unchanged on those platforms before the store is declared cross-platform.
