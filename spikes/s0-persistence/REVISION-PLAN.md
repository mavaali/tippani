# S0 Persistence Spike Revision Plan

**Status:** Planned revision for PR #91
**Purpose:** Turn the existing S0 harness evidence into an applicability-aware, decision-ready persistence architecture handoff.

## Problem

The current comparison evaluates adapters as if every catalog gate applied independently to every adapter. Local candidates are therefore penalized for provider-only gates, while provider transports are penalized for local-engine gates. This prevents any configuration from becoming eligible even though S0 explicitly permits an architecture mapping composed of one local engine and provider-native CAS transports behind `IWorkspaceStore`.

The comparison also omits the committed OneDrive, Azure DevOps, and GitHub live outcomes, presents single-run local measurements in a relative comparison before an eligible mapping exists, and does not yet provide the recommendation, conditions, owners, evidence links, or sign-off required for an ADR input.

## Revision outcome

The revision will produce:

1. An applicability model for every scenario and each of the five engine/backing-path configurations.
2. Five regenerated configuration outcomes using distinct evidence states.
3. Two candidate architecture mapping rollups.
4. Repeated, comparable local and provider performance evidence.
5. Complete multi-user evidence for every provider backing path.
6. A condition-and-owner table for every remaining blocked gate.
7. A decision handoff with a recommendation, evidence links, and sign-off.

## Branch isolation and evidence safety

The S0 branch and every committed artifact must contain only Tippani-specific, synthetic evidence. Secrets and non-Tippani details must not leak into the branch, commit metadata, reports, fixtures, screenshots, logs, or raw results.

The branch must not contain:

- Tokens, credentials, cookies, authorization headers, recovery data, private keys, connection strings, or environment-variable values.
- Real account names, email addresses, tenant details, organization/project/repository/drive identifiers, provider resource names, ownership coordinates, or private URLs.
- Actual documents, comments, metadata, screenshots, logs, or production-derived fixtures.
- Absolute local paths, machine names, shell history, unrelated repository details, or details about the client, host, role, panel, pipe, or other mechanism used to run Tippani.
- Unredacted request or response bodies, headers, query strings, provider error payloads, or diagnostic dumps.

Credentials remain runtime-supplied and brokered. Committed evidence uses synthetic labels, opaque run IDs, and redacted coordinates. Provider instrumentation may retain aggregate counts, byte sizes, status classes, retry counts, and timings, but not sensitive request content.

Before every push, scan the complete staged diff, generated artifacts, and commit message for credential patterns, real coordinates, absolute paths, and non-Tippani terms. A detected leak invalidates the artifact. Quarantine it, clean any run-owned provider resources through the ownership manifest, correct the generator, and rerun. Redacting an artifact only after it has been committed does not make that artifact valid evidence.

## Required configurations

The decision surface contains exactly these five authoritative engine/backing-path configurations:

| Configuration | Engine / transport | Authority |
|---|---|---|
| Local SQLite | SQLite transaction engine | Private local workspace |
| Local envelope | Generation-CAS envelope with atomic local replace | Private local workspace |
| OneDrive envelope | Generation-CAS envelope using item version/ETag preconditions | Shared OneDrive workspace |
| ADO envelope | Generation-CAS envelope using object/ref preconditions | Shared Azure DevOps repository |
| GitHub envelope | Generation-CAS envelope using blob/ref preconditions | Shared GitHub repository |

Reference-memory and provider dry-run configurations remain harness-validation evidence. They do not appear as decision candidates.

## Applicability model

Add explicit applicability metadata to the machine-readable scenario catalog. Applicability must be declared, not inferred from which scenario IDs a configuration happened to execute.

The model must distinguish:

- Common `IWorkspaceStore` behavior required of every selected implementation.
- Local-engine behavior required only of local SQLite and local envelope.
- Shared-provider behavior required of OneDrive, ADO, and GitHub.
- Provider-specific behavior required only of the named provider.
- OneDrive synced-folder compatibility, which is separate from OneDrive API CAS.
- Platform-relative and performance-relative evidence.

Each configuration report must distinguish these states:

| State | Meaning | Eligibility effect |
|---|---|---|
| Pass | The applicable scenario executed and satisfied its invariant. | Satisfies the gate. |
| Fail | The applicable scenario executed and violated its invariant. | Rejects the configuration. |
| Blocked | The scenario applies, but an external prerequisite prevents execution. | Blocks eligibility. |
| N/A | The invariant is satisfied through an independently reviewed equivalent mechanism, so the specific scenario form does not apply. | Does not block eligibility. |
| Not applicable | The scenario belongs to a different engine, backing path, provider, or compatibility surface. | Excluded from eligibility. |
| Not executed | The scenario applies, but no result exists. | Blocks eligibility. |

`N/A` requires a recorded rationale and independent-review approval. `Not applicable` follows catalog metadata and must not require a waiver.

## Eligibility and architecture mappings

Evaluate eligibility in two stages.

### Configuration eligibility

A configuration is eligible only when every applicable absolute gate is `Pass` or approved `N/A`. Any `Fail`, `Blocked`, or `Not executed` applicable absolute gate prevents eligibility. `Not applicable` gates are excluded.

### Mapping eligibility

Roll configuration evidence into these candidate mappings:

| Mapping | Constituent configurations |
|---|---|
| Hybrid SQLite | Local SQLite + OneDrive envelope + ADO envelope + GitHub envelope |
| Envelope throughout | Local envelope + OneDrive envelope + ADO envelope + GitHub envelope |

A mapping is eligible only when every constituent configuration is eligible. Shared provider results may be referenced by both mappings, but must not be copied or counted as local-engine evidence.

The report must not recommend a mapping while no mapping is eligible. Once eligibility exists, relative criteria may select among eligible mappings. If only one mapping is eligible, the recommendation follows the absolute gates rather than provisional performance differences.

## Existing evidence to preserve

Regenerate the reviewer entry point from all five committed outcome reports and their raw evidence.

Current evidence to carry forward includes:

- Local envelope: 38 applicable absolute passes in the current Windows run.
- Local SQLite: 37 applicable absolute passes plus approved `N/A` for the external stale-lock-file form of `S0-REC-002`.
- OneDrive: nine live single-identity provider gates passed.
- Azure DevOps: nine live single-identity provider gates passed.
- GitHub: nine live single-identity provider gates passed.

For each provider, the nine live results comprise its provider-specific backing gate (`S0-BCK-002`, `S0-BCK-003`, or `S0-BCK-004`) plus `S0-BCK-005`, `S0-COL-004`, `S0-COL-005`, `S0-REC-003`, `S0-REC-004`, `S0-MIG-004`, `S0-BKP-003`, and `S0-BKP-004`.

The regenerated reports must verify compatible catalog and harness revisions before combining evidence. A stale or incompatible outcome is `Not executed` for the current comparison until regenerated.

## Entire surface requirements

### Common workspace contract

Every selected configuration must:

- Implement the same `IWorkspaceStore` operation model.
- Preserve stable workspace identity, aliases, generation, documents, intents, private state, journals, and audit metadata.
- Apply expected-generation or provider-native CAS to every mutation.
- Return typed stale-writer conflicts with enough information to reload or reconcile.
- Fail closed for corrupt, unreadable, unsupported, inconsistent, or permission-denied state.
- Expose intentional differences as typed capabilities or policies rather than hidden adapter behavior.
- Keep credentials out of workspace state and retained evidence.

### Atomicity, concurrency, and journals

The applicable configurations must prove:

- Multi-field workspace mutation commits completely or not at all.
- Alias transitions, indexes, state, intent revisions, and journal records cannot become partially visible.
- Independent workspaces progress without global serialization.
- Concurrent staging preserves newer intent revisions.
- Publication intent tuples and planned journals become durable before provider publication begins.
- No journal references a missing workspace, generation, or intent revision.

### Crash, corruption, migration, and recovery

The applicable configurations must prove:

- Kill points recover only the complete previous or complete committed generation.
- Alias/index updates, backups, restores, and migrations do not expose torn state.
- Damaged, truncated, checksum-failing, duplicate, unreadable, or unsupported state is preserved or quarantined and fails closed.
- Startup validates all workspace and alias state before mutation APIs open.
- Forward migration is transactional or resumable, idempotent, and auditable.
- Interrupted migration resumes or rolls back unambiguously.
- Legacy import validates before commit and leaves no partial destination on failure.
- Backup and restore reproduce one internally consistent known generation.
- Recovery diagnostics identify affected state without exposing document content or credentials.

### Local-engine requirements

Both local engines must be exercised with independent OS processes and prove:

- One winner and typed stale conflicts for competing expected-generation writes.
- Durable restart and exact rehydration in a separate process.
- Supported-filesystem atomicity and durability behavior.
- Permission, path, temporary-unavailability, quota, and contention behavior.
- Lock or journal recovery according to the engine's actual ownership model.
- No unreviewed provider-only gate is used to disqualify a local engine.

Windows/NTFS evidence may select the Windows local implementation. macOS/APFS and Linux/filesystem coverage remains separately reported as `Blocked` until runners exist and cannot be represented as a pass.

### Provider requirements

OneDrive, ADO, and GitHub must each prove, independently:

- Provider-native preconditions reject stale updates and preserve one auditable generation.
- A provider outage, throttle, authentication expiry, quota failure, or permission loss never creates success-shaped state.
- A remotely committed write with a lost response is reconciled without duplicate generation or false failure.
- Offline work remains pending until authoritative CAS confirmation.
- Reconnect discovers newer authority before another write is accepted.
- History/export recovers a known generation without overwriting newer valid history.
- Restore establishes one explicit authoritative head.
- Local-to-provider rehome preserves `WorkspaceId` and switches authority only after a durable receipt.
- Branch, namespace, ownership, cleanup, request, object, time, and byte budgets remain enforced.

### Multi-user testing

Run the multi-user suite separately on OneDrive, ADO, and GitHub. Passing one provider does not satisfy another provider's collaboration gates.

Each provider run must:

- Use at least two independent synthetic sandbox identities with separately brokered credentials and no identity fallback.
- Use independent processes and credential contexts. Reconnect coverage must also use distinct client profiles or devices.
- Have both users open the same `WorkspaceId` at the same authoritative generation.
- Release simultaneous writes from a common barrier and observe exactly one committed next generation and one typed stale conflict.
- Verify that the stale user reloads or reconciles without silent overwrite.
- Create divergent offline work, advance authority from the other user, reconnect, and observe deterministic pending/conflict behavior.
- Verify `S0-COL-002`, `S0-COL-003`, and `S0-COL-006` with raw per-user, per-client, and authoritative final-state evidence.
- Measure acknowledgement-to-discovery latency when the second collaborator observes the committed generation through the provider's change mechanism.
- Exercise delayed notification and lost-response behavior without duplicating a generation or fabricating success or failure.
- Exercise permission removal or loss and prove inaccessible state is not treated as absent.
- Preserve only synthetic actor labels and opaque identity IDs in retained evidence.
- Clean all run-owned resources and verify that no branches, items, folders, or refs remain outside the cleanup manifest.

### OneDrive synced-folder compatibility

Test a locally synced OneDrive folder separately from the OneDrive API-CAS configuration. Record conflict artifacts, ordering, recovery, and user-visible behavior. `S0-BCK-006` is compatibility evidence and must not be used as proof of provider-API multi-writer safety.

### Security and operational safety

Every local and provider run must prove:

- Synthetic-only inputs and outputs.
- No embedded or retained credentials.
- No corporate or unintended identity fallback.
- Approved, non-production provider coordinates.
- Ownership-checked cleanup.
- Enforced operation, request, object, time, and storage budgets.
- Sanitized diagnostics and reports.

## Performance and operability investigation

Existing local measurements remain provisional diagnostics because they are single-run and no architecture mapping is eligible.

Use one common method across every applicable configuration:

- Three discarded warm-up repetitions followed by 20 measured repetitions.
- Identical small, medium, and stress fixtures and workload ordering.
- Monotonic timing around fully awaited operations.
- Fresh-process measurement for cold startup and complete enumeration.
- Explicit timing boundaries for create, alias open, mutation, conflict detection, journal update, backup, restore, remote CAS, and collaborator discovery.
- Report sample count, p50, p95, mean, standard deviation, minimum, and maximum.
- Record OS/build, CPU, memory, storage/filesystem, Node version, power mode, temporary-store location, network path/region, and provider environment without retaining sensitive coordinates.

Provider instrumentation must report:

- Request count by operation and status class.
- Request and response byte counts.
- Remote CAS latency.
- Retry and backoff count.
- Throttling count and honored `Retry-After` behavior.
- Lost-response reconciliation cost.
- Collaborator discovery latency.

Apply one anchored complexity and operability rubric to all five configurations. Score and explain dependency burden, implementation surface, testing burden, migration, deployment, diagnostics, recovery effort, ongoing maintenance, provider limits, and support burden.

Until a mapping is eligible, render all measurements under `Provisional diagnostics`. Do not emit a winner, rank, score-based recommendation, or language that treats SQLite speed versus envelope footprint as decisive.

## Report and generator changes

### Scenario catalog

Add applicability metadata and validation that every catalog entry declares its scope. Tests must reject missing, contradictory, or unknown applicability values.

### Eligibility

Update `gateSummary()` to iterate only applicable absolute gates for the current configuration. Preserve separate collections for pass, fail, blocked, N/A, not applicable, and not executed.

### Outcome reports

Regenerate all five outcome reports with:

- Environment and method.
- Applicability-aware scenario coverage.
- Correctness summary.
- Measurements and method metadata.
- Failures and recovery.
- Operational assessment.
- Contract deviations.
- Risks, owners, and required follow-up.
- Configuration recommendation and conditions.
- Implementer and independent-review sign-off.

Every summary row must link to sanitized raw evidence.

### Comparison

Change the default comparison input from two newly executed local configs to the five reviewed outcome/raw-result pairs. Keep execution and aggregation as separate commands so a comparison cannot silently overwrite reviewed live evidence.

The comparison must contain:

1. A five-row applicability-aware configuration matrix.
2. The two mapping rollups and mapping eligibility.
3. Exact blocked or missing applicable gates.
4. A provisional-diagnostics section while no mapping is eligible.
5. A conditions table with owner and closure evidence.
6. One recommendation only after eligibility permits it.
7. Links from every summary cell to the configuration outcome and raw evidence.

## Conditions, owners, and closure evidence

| Condition | Owner | Evidence required to close |
|---|---|---|
| Applicability and report-generator correction | Spike implementer | Unit tests plus regenerated five-row matrix with all six states represented correctly |
| `S0-COL-002` on OneDrive, ADO, and GitHub | Provider test operator | Two-identity simultaneous-write runs showing one winner, one typed conflict, and one authoritative generation per provider |
| `S0-COL-003` on OneDrive, ADO, and GitHub | Provider test operator | Two-profile/device divergent-generation reconnect runs with deterministic reload or conflict per provider |
| `S0-COL-006` on OneDrive, ADO, and GitHub | Provider test operator | Second-collaborator change discovery evidence and latency distribution per provider |
| `S0-BCK-006` | Windows OneDrive test operator | Separate synced-folder compatibility outcome and raw evidence |
| `S0-PER-001` through `S0-PER-004` | Performance investigator | Repeated samples, statistics, environment record, and provider request/byte/throttle/discovery telemetry |
| `S0-PER-005` | Spike implementer | Completed common complexity and operability rubric with explanations |
| macOS and Linux portability | Runner owner | Unchanged harness runs on supported native runners; remains relative and blocked until available |
| Evidence isolation | Spike implementer | Clean staged-diff and artifact scan with no secrets, real coordinates, local paths, or non-Tippani details |
| Applicability waivers and final recommendation | Independent reviewer | Recorded approval of every `N/A`, mapping decision, conditions, and sign-off |

## Automated coverage

Add tests that prove:

- Every scenario has valid applicability metadata.
- The expected applicable gate set is stable for each of the five configurations.
- Provider-only gates do not block local configurations.
- Local-only gates do not block provider configurations.
- Provider-specific gates apply only to their provider.
- `Pass`, `Fail`, `Blocked`, `N/A`, `Not applicable`, and `Not executed` remain distinct in JSON and Markdown.
- Approved `N/A` and catalog-driven `Not applicable` do not block eligibility.
- `Blocked` and `Not executed` applicable absolute gates block eligibility.
- Mapping eligibility is the conjunction of constituent configuration eligibility.
- Relative ranking is absent while no mapping is eligible.
- All five reviewed reports are consumed and stale catalog/harness revisions are rejected.
- Provider instrumentation never persists authorization data, URLs, request bodies, response bodies, or real coordinates.
- Generated and staged artifacts fail the isolation scan when seeded with credential patterns, absolute paths, or non-Tippani markers.
- Multi-user gate implementations fail against deliberately broken conflict, reconnect, and discovery behavior.

## Validation sequence

1. Run catalog, eligibility, result-writer, comparison, and isolation unit tests.
2. Run the full credential-free harness and detection-power suites.
3. Regenerate local outcomes with the repeated performance method.
4. Import and validate the existing three live provider outcomes into the new applicability model.
5. Run the new provider performance suite.
6. Run the two-identity multi-user suite on OneDrive, ADO, and GitHub.
7. Run the separate OneDrive synced-folder compatibility probe.
8. Regenerate all five outcomes and the mapping comparison from reviewed raw evidence.
9. Scan every staged artifact and commit message for prohibited material.
10. Obtain implementer and independent-review sign-off.

## Done when

S0 is decision-ready when:

- The comparison includes all five configurations and both candidate mappings.
- Every absolute gate is correctly classified by applicability.
- Every applicable absolute gate is `Pass` or approved `N/A` for at least one complete mapping.
- Multi-user collaboration evidence exists independently for OneDrive, ADO, and GitHub.
- Performance and operability evidence follows one repeated, documented method.
- Relative evidence is used only after mapping eligibility exists.
- Every condition has an owner and linked closure evidence.
- Every retained artifact is synthetic, sanitized, Tippani-specific, and free of secrets or environment leakage.
- The comparison records one recommendation, conditions, implementer sign-off, and independent-review sign-off suitable for the persistence ADR before R1.
