# ADR: Draft Workspace persistence architecture

**Status:** Harness accepted for merge; persistence decision pending corrected evidence
**Original decision date:** 2026-08-31
**Reopened:** 2026-09-03

## Context

S0 evaluates local SQLite, a local generation-CAS envelope, and provider-native
OneDrive, Azure DevOps, and GitHub transports behind `IWorkspaceStore`.

Review of the architecture-spike evidence found that the retained campaigns
were not bound to the current source/catalog/configuration, accepted
unstructured `N/A`, omitted required faults and durable offline replay, did not
authorize real teardown, did not enforce all safety budgets, and used invalid
startup/memory/write-amplification methods. The generated comparison now rejects
all checked-in configuration results as stale or incomplete.

SQLite also cannot satisfy the current absolute `S0-CON-003` wording:
`BEGIN IMMEDIATE` serializes writers database-wide even when they update
independent workspaces. This is a structural failure, not missing evidence; a
rerun alone cannot close it. Closure requires revising the criterion or an
independently approved, scenario-specific rationale-backed `N/A`.

## Decision

No persistence mapping is selected.

PR #91 ships only the hardened S0 evaluation harness and its fail-closed
classification semantics. It does not integrate a persistence implementation
into the production runtime and does not authorize R1 to adopt SQLite, a local
CAS envelope, a hybrid mapping, or any provider mapping.

The previous hybrid SQLite + provider-native CAS acceptance is withdrawn for
the current evidence revision. It must not guide R1 until a newly generated
comparison identifies an eligible mapping and an independent reviewer and ADR
approver record a dated decision.

## Evidence status

- [Architecture-mapping handoff](results/comparison/comparison.md): incomplete;
  retained inputs rejected by revision and completeness validation.
- Local results: require regeneration under checksum, journal, lock,
  migration-kill, budget, and corrected eligibility semantics.
- Provider results: require three new complete campaigns per provider with
  effective target identity/coordinates bound to an approved hash, persistent
  pending queues, all required injected faults, and manifest-authorized
  conditional teardown.
- Performance: `S0-PER-001` and `S0-PER-003` remain incomplete until populated
  fresh-process startup/enumeration, memory, and storage-layer bytes-written
  measurements exist.
- Cross-platform results: require rerun because shared contract and harness
  semantics changed.

## Conditions and owners

| Condition | Owner | Required evidence | Status |
|---|---|---|---|
| Local CAS evidence | S0 implementation owner | Current complete local campaign | Pending |
| SQLite disposition | S0 decision owner | Reject it for `S0-CON-003`, revise the absolute criterion, or record an independently approved structured exception | Pending |
| Provider collaboration/recovery/safety | S0 provider test owner | Three current live campaigns per provider | Pending credentials and approved sandboxes |
| Correct performance protocol | Performance investigator | Fresh-process, memory, and true write-amplification results | Pending |
| Native portability | Cross-platform test owner | Current Windows, macOS, and Linux results | Pending |
| Architecture selection | Independent reviewer / ADR approver | Eligible mapping plus dated sign-off | Pending |

## Consequences

- Existing outcome files remain historical artifacts only.
- The harness repair can merge independently of the architecture decision.
- Relative performance numbers are excluded from architecture rationale.
- `compare.mjs --use-existing` exits nonzero while no selected mapping is
  eligible.
- Production implementation work must not assume SQLite or the former hybrid
  mapping has been accepted.

## Sign-off

| Role | Person | Date | Decision / comments |
|---|---|---|---|
| S0 implementation owner | | | |
| Provider test owner | | | |
| Cross-platform test owner | | | |
| Independent reviewer | | | |
| ADR approver | | | Pending |
