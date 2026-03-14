# Provider Collection Refactor Plan

Date: 2026-03-14
Status: Approved for implementation

## Intent Summary

Refactor the provider collection/runtime layer so source resolution, collection, parsing, normalization, snapshot assembly, and enrichment are separated into clearer modules without inventing a large cross-provider framework.

This plan is intentionally scoped to the runtime collection layer and its immediate shared contracts. Internal behavior corrections are allowed as part of the refactor, and the metric-contract cleanup that removes the current percent-string roundtrip is in scope.

The architectural shapes below are approved implementation decisions from the current discussion unless repo evidence during execution forces a targeted amendment.

## Clarified Scope

User-confirmed decisions:

- The refactor may include behavior corrections; it is not limited to file movement.
- Phase 1 is scoped to the collection/runtime layer under `src/runtime/providers/` plus immediate shared helpers and any minimal downstream contract changes required by that refactor.
- The plan should include the later metric-contract cleanup instead of deferring it.

Accepted practical boundary:

- TUI and stats consumers may be updated where required by the metric-contract change, but this plan does not broaden into TUI feature work or unrelated provider-parity work.

Planner-proposed architecture commitments to confirm in review before implementation:

- rich resolved source handles instead of bare source enums
- a shared normalized pre-snapshot contract
- shared enricher plumbing
- typed usage-window inputs that eliminate the percent-string roundtrip

## Saved Reference

- Oracle note: [ai_docs/2026-03-14-provider-collection-refactor-oracle.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/ai_docs/2026-03-14-provider-collection-refactor-oracle.md)
- Current architecture note: [ai_docs/2026-03-13-provider-refresh-collection-architecture.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/ai_docs/2026-03-13-provider-refresh-collection-architecture.md)

## Verified Repo Facts

- The current provider runtime entrypoint is [src/runtime/provider-adapters.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/provider-adapters.ts), which wires three provider adapters:
  - [src/runtime/providers/claude.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/claude.ts)
  - [src/runtime/providers/codex.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/codex.ts)
  - [src/runtime/providers/gemini.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/gemini.ts)
- The provider files are large and each currently mixes source resolution, collection, parsing, normalization, snapshot construction, and enrichment:
  - [src/runtime/providers/claude.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/claude.ts) is about 1.8k lines and contains OAuth, CLI, web/session, normalization, and enrichers.
  - [src/runtime/providers/codex.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/codex.ts) is about 1k lines and contains OAuth, CLI RPC, usage URL resolution, dashboard enrichment, and token refresh.
  - [src/runtime/providers/gemini.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/gemini.ts) is about 680 lines and contains API collection, OAuth refresh, project/tier discovery, quota aggregation, and workspace-status enrichment.
- [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts) currently mixes:
  - JSON/file helpers
  - JWT decoding helpers
  - refresh orchestration via `runResolvedRefresh()`
  - snapshot construction via `createSnapshot()` and `createUsageSnapshot()`
- The current shared metric input type is `ProviderMetricInput` in [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts), and the canonical runtime snapshot types are in [src/core/store/runtime-state.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/runtime-state.ts).
- `createUsageSnapshot()` currently derives `rateWindows` by parsing display strings such as `"42%"` back into numbers, which couples normalization to presentation formatting.
- Current enrichers are provider-local and order-sensitive:
  - Claude: service status and token cost
  - Codex: web dashboard details, token cost, service status
  - Gemini: workspace status and incidents
- Current source resolution uses lightweight enums:
  - `resolveClaudeSource()` in [src/runtime/providers/claude.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/claude.ts)
  - `resolveCodexSource()` in [src/runtime/providers/codex.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/codex.ts)
  - `resolveGeminiSource()` in [src/runtime/providers/gemini.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/gemini.ts)
- The main existing validation surface is already concentrated in:
  - [test/runtime/provider-adapters.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/provider-adapters.test.ts)
  - [test/runtime/app-runtime.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/app-runtime.test.ts)
  - [test/ui/tui-presenter.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/ui/tui-presenter.test.ts)
  - [test/ui/tui-snapshot.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/ui/tui-snapshot.test.ts)
  - [test/cli/stats-output.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/cli/stats-output.test.ts)

## Non-Goals

- No new provider sources or provider-parity feature work
- No TUI redesign or new stats output features
- No generic `BaseProviderAdapter` or large cross-provider parser framework
- No attempt to genericize provider-specific collection quirks such as:
  - Claude PTY CLI parsing
  - Codex JSON-RPC and usage-host policy
  - Gemini project/quota drilldown logic
- No packaging, release, installer, or tray changes

## Target End State

The runtime collection layer should have these properties when this plan is complete:

- Source resolution returns rich provider-specific handles instead of bare source enums.
- Source collectors are split into provider-local modules by source and concern.
- Snapshot construction is driven from a shared normalized pre-snapshot contract rather than repeated ad hoc mapping inside each source path.
- Enrichers run through shared pipeline plumbing instead of bespoke provider-local chaining.
- The metric contract no longer round-trips through display percent strings to derive rate-window numbers.
- Existing runtime entrypoints continue to work:
  - `bun run stats`
  - `bun run tui`
  - runtime-driven refresh from the app store

## Acceptance Criteria

### AC-01 Must

Provider runtime adapters are split so orchestration, source resolution, source collection, normalization, and enrichment are no longer braided together inside the three existing monolithic provider files.

Source:

- user-confirmed
- repo-constrained

Validation:

- Review: each provider has a thin adapter/orchestration layer plus provider-local source and enrichment modules under `src/runtime/providers/`.
- Automated: provider adapter tests still cover the end-to-end refresh behaviors through the new module boundaries.

### AC-02 Must

`resolveClaudeSource()`, `resolveCodexSource()`, and `resolveGeminiSource()` are replaced or reshaped so the refresh pipeline consumes rich resolved handles instead of rediscovering the same source-specific state later in the flow.

Source:

- user-confirmed
- planner-recommended based on Oracle + repo review

Validation:

- Review: source-plan modules expose discriminated unions or equivalent rich resolved-handle types.
- Automated: focused tests cover source selection and fallback with the new handle shape.

### AC-03 Must

Source-specific collectors return a shared normalized pre-snapshot contract that is then converted into `ProviderRuntimeSnapshot` through shared snapshot-building code, eliminating the repeated `metrics -> createSnapshot -> withProviderDetails -> createRefreshSuccess` pattern from provider/source-specific parsing code.

Source:

- user-confirmed
- planner-recommended based on Oracle + repo review

Validation:

- Review: snapshot/result wiring is centralized in shared collection modules.
- Automated: provider adapter tests assert unchanged or intentionally corrected snapshot content through the shared builder path.

### AC-04 Must

The metric-contract cleanup removes the current percent-string roundtrip used to derive `rateWindows`.

Specifically:

- collection/normalization keeps numeric usage-window information in typed fields until the runtime snapshot is built
- display formatting stays at the rendering or presentation boundary

Source:

- user-confirmed
- planner-recommended based on Oracle + repo review

Validation:

- Automated: runtime-state and provider tests assert numeric rate-window derivation without parsing a formatted percent string.
- Automated: TUI/stats tests still pass after the contract change.

### AC-05 Must

Provider-specific enrichers are applied through shared pipeline plumbing that preserves prior provider details and captures source diagnostics without each enricher manually re-merging provider-specific state.

Source:

- user-confirmed
- planner-recommended based on Oracle + repo review

Validation:

- Automated: tests cover Codex dashboard + token cost + service-status composition, Claude token cost + service-status composition, and Gemini incidents + service-status composition.
- Review: enrichers no longer directly depend on hand-preserving previous provider-details state in multiple places.

### AC-06 Must

Preferred-source failures that later succeed through fallback remain observable in runtime data or refresh results so collection regressions are not silently masked.

Source:

- user-confirmed because behavior corrections are allowed
- planner-recommended based on Oracle + repo review

Validation:

- Automated: fallback tests assert preserved diagnostics when OAuth fails and a later source succeeds.
- Review: fallback diagnostics are stored in a dedicated runtime snapshot diagnostics field instead of overloading `latestError`.

### AC-07 Must

Existing runtime consumers continue to function after the refactor:

- provider refresh actions still produce valid `ProviderRuntimeSnapshot` values
- `bun run stats` still emits a valid snapshot
- TUI presenter/snapshot tests still pass against the updated runtime contract

Source:

- repo-constrained

Validation:

- Automated: `bun test`
- Automated: `bun run typecheck`
- Automated: `bun run lint`

### AC-08 Should

The refactor reduces the public responsibility of [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts) into smaller shared modules with clearer ownership, such as pipeline, snapshot, JWT, and low-level I/O helpers.

Source:

- planner-recommended based on Oracle + repo review

Validation:

- Review: `shared.ts` is removed or materially reduced to a narrow facade.

## Proposed Module Shape

Provider-local shape:

- `src/runtime/providers/<provider>/adapter.ts`
- `src/runtime/providers/<provider>/source-plan.ts`
- `src/runtime/providers/<provider>/sources/oauth.ts`
- `src/runtime/providers/<provider>/sources/cli.ts` where applicable
- `src/runtime/providers/<provider>/sources/web.ts` where applicable
- `src/runtime/providers/<provider>/normalize.ts`
- `src/runtime/providers/<provider>/enrich.ts`

Shared shape:

- `src/runtime/providers/collection/pipeline.ts`
- `src/runtime/providers/collection/snapshot.ts`
- `src/runtime/providers/collection/jwt.ts`
- `src/runtime/providers/collection/io.ts`
- optional later `src/runtime/providers/collection/usage.ts` if the metric-contract work benefits from a dedicated normalized usage model

This module shape is a planning target, not a required file-for-file outcome. Equivalent naming is acceptable if the same boundaries are achieved.

## Implementation Approach

### Design Rules

- Keep provider-specific collection and parsing local to each provider.
- Share only low-level primitives, pipeline orchestration, snapshot assembly, and narrow helper logic.
- Do not introduce a generic provider superclass, base adapter, or universal parser abstraction.
- Separate behavior-preserving extraction from behavior corrections wherever practical so regressions are easier to isolate.
- Prefer migrating one provider at a time through the new seed/snapshot pipeline rather than landing a repo-wide rewrite in one step.

### Shared Contracts To Introduce

Introduce a normalized pre-snapshot contract, referred to here as `RefreshSeed`, that can represent:

- `sourceLabel`
- account identity fields
- provider cost
- quota buckets
- typed usage-window values before display formatting
- base provider details
- version
- optional diagnostics such as preferred-source failure notes

The final type name can change during implementation, but the plan requires this intermediate boundary to exist.

### Diagnostics Policy

When a preferred source fails and a fallback succeeds, the resulting refresh should retain the earlier failure in a structured field rather than dropping it.

Approved shape:

- introduce a dedicated cross-provider diagnostics field on the normalized seed and final runtime snapshot for source/fallback diagnostics
- do not overload `latestError`, because the current TUI treats it as an active error banner
- do not store fallback diagnostics under provider-specific `providerDetails`

Minimum contract:

- the field must preserve at least the preferred-source failure message when fallback succeeds
- the field may support multiple diagnostic entries if that is simpler for the pipeline work
- the field must be visible in tests and preserved through store refresh application

## Phases

### Phase 1: Extract Enrichers And Shared Low-Level Helpers

Scope:

- Move Claude, Codex, and Gemini enrichers into provider-local `enrich` modules without changing behavior.
- Extract obviously shared JWT and I/O helpers out of `shared.ts` into narrower shared modules.
- Keep current adapter behavior and current source enums in place during this phase.

Likely files:

- [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts)
- [src/runtime/providers/claude.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/claude.ts)
- [src/runtime/providers/codex.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/codex.ts)
- [src/runtime/providers/gemini.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/gemini.ts)
- [test/runtime/provider-adapters.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/provider-adapters.test.ts)

Exit criteria:

- provider-specific enrichers are isolated
- shared JWT decoding no longer has duplicated implementations
- all current provider-adapter tests still pass

### Phase 2: Replace Enum Source Resolution With Rich Resolved Handles

Scope:

- Introduce provider-local source-plan modules.
- Change Claude, Codex, and Gemini source resolution so it returns rich resolved handles instead of bare enums.
- Eliminate duplicated rediscovery of source-specific handles later in the refresh path.

Likely files:

- [src/runtime/providers/claude.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/claude.ts)
- [src/runtime/providers/codex.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/codex.ts)
- [src/runtime/providers/gemini.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/gemini.ts)
- [src/core/actions/provider-adapter.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/actions/provider-adapter.ts) if action/result types need minor support changes
- [src/core/store/runtime-state.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/runtime-state.ts) if fallback diagnostics require a minimal snapshot contract change
- [src/core/store/app-store-actions.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/app-store-actions.ts) if successful fallback diagnostics need explicit preservation rules
- [test/runtime/provider-adapters.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/provider-adapters.test.ts)
- [test/core/store/app-store.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/core/store/app-store.test.ts)

Exit criteria:

- resolved-handle unions exist per provider
- fallback policy is expressed in adapter/orchestration code without redoing discovery inside collectors
- tests cover source selection and fallback

### Phase 3: Split Source Collectors Into Provider-Local Modules

Scope:

- Move source-specific collection logic into per-source files while keeping current parsing logic verbatim where possible.
- Start with Gemini as the cleanest proof, then Codex, then Claude.
- Keep provider-specific quirks local.

Likely files:

- new `src/runtime/providers/gemini/*`
- new `src/runtime/providers/codex/*`
- new `src/runtime/providers/claude/*`
- [src/runtime/provider-adapters.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/provider-adapters.ts)
- [test/runtime/provider-adapters.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/provider-adapters.test.ts)

Exit criteria:

- provider adapter files become thin orchestration entrypoints
- source-specific collectors compile and pass existing end-to-end adapter tests
- no new cross-provider parsing abstraction is introduced

### Phase 4: Introduce Shared Normalized Seed And Snapshot Builder

Scope:

- Add shared collection pipeline and snapshot builder modules.
- Migrate source-specific collectors to return the normalized seed type.
- Centralize the repeated snapshot/result wiring.
- Introduce shared enricher application plumbing.

Likely files:

- new `src/runtime/providers/collection/*`
- provider-local normalize modules
- [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts) or its replacements
- [src/core/store/runtime-state.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/runtime-state.ts)
- [src/core/store/app-store-actions.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/app-store-actions.ts)
- [test/runtime/provider-adapters.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/runtime/provider-adapters.test.ts)
- [test/core/store/app-store.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/core/store/app-store.test.ts)

Exit criteria:

- repeated source-specific `createSnapshot` + `createRefreshSuccess` sequences are removed
- enrichers apply through shared pipeline helpers
- Codex provider-details merging no longer depends on hand-preserving dashboard/token-cost state in multiple functions

### Phase 5: Replace The Percent-String Metric Contract

Scope:

- Remove the string parse roundtrip from `createUsageSnapshot()`.
- Introduce typed usage-window inputs for normalized collection data.
- Push percent formatting to the consumer or presentation boundary.
- Update runtime-state tests and any affected stats/TUI presenter expectations.

Likely files:

- [src/runtime/providers/shared.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/runtime/providers/shared.ts) or the new snapshot/usage modules that replace it
- [src/core/store/runtime-state.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/runtime-state.ts)
- [src/core/store/app-store-actions.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/core/store/app-store-actions.ts)
- [src/cli/stats-output.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/cli/stats-output.ts)
- [src/ui/tui/provider-metrics-presentation.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/ui/tui/provider-metrics-presentation.ts)
- [src/ui/tui/runtime-presentation.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/src/ui/tui/runtime-presentation.ts)
- [test/ui/tui-presenter.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/ui/tui-presenter.test.ts)
- [test/ui/tui-snapshot.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/ui/tui-snapshot.test.ts)
- [test/cli/stats-output.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/cli/stats-output.test.ts)
- [test/core/store/app-store.test.ts](/home/thierry/Work/Sideprojects/CodexBarOmarchy/test/core/store/app-store.test.ts)

Exit criteria:

- rate-window derivation is numeric end-to-end in the runtime pipeline
- display formatting is no longer required to recover usage semantics
- consumer tests pass with the new contract

### Phase 6: Cleanup, Documentation, And Session Record

Scope:

- Remove obsolete compatibility shims and dead shared helpers.
- Update architecture notes and session notes to reflect the new boundaries and any accepted behavior corrections.

Likely files:

- [ai_docs/2026-03-13-provider-refresh-collection-architecture.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/ai_docs/2026-03-13-provider-refresh-collection-architecture.md)
- [session.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/session.md)

Exit criteria:

- docs describe the new runtime collection boundaries accurately
- session record captures the completed refactor and any remaining follow-ups

## Validation Strategy

Automated validation after each phase as applicable:

- `bun run typecheck`
- `bun run lint`
- `bun test`
- focused `bun test test/runtime/provider-adapters.test.ts`
- focused `bun test test/ui/tui-presenter.test.ts`
- focused `bun test test/cli/stats-output.test.ts`

Manual validation after the final phase:

- `bun run stats` produces a valid JSON snapshot with expected provider identity, usage, and details fields
- `bun run tui` still starts and renders provider metrics/details from the refactored runtime snapshot

## Risks And Watchouts

- Claude is the highest-risk provider because its CLI and web fallback paths are the most brittle.
- The metric-contract cleanup will likely touch consumer tests outside `src/runtime/providers/` even though the primary scope is runtime collection.
- Preserving diagnostics across successful fallback paths may require a small runtime-state contract change; that change should be kept minimal and covered by tests.
- Codex provider-details merging is currently fragile; changing it too early without tests could silently drop dashboard or token-cost data.
- This plan allows behavior corrections, so the implementation must distinguish intended corrections from accidental regressions in tests and docs.

## Traceability Matrix

| Phase | Primary ACs |
| --- | --- |
| Phase 1 | AC-05, AC-08 |
| Phase 2 | AC-02, AC-06 |
| Phase 3 | AC-01, AC-07 |
| Phase 4 | AC-03, AC-05, AC-07 |
| Phase 5 | AC-04, AC-07 |
| Phase 6 | AC-07, AC-08 |

## Open Implementation Notes

- The final type names do not need to match this document exactly if the architectural boundaries and acceptance criteria are satisfied.
- If the metric-contract cleanup proves too invasive to land safely in the same branch, implementation can still pause after Phase 4 for explicit user review before Phase 5. That is a sequencing checkpoint, not a scope change.

## Implementation Approval

This plan is approved for implementation based on the current discussion, with the dedicated fallback-diagnostics field now chosen as part of the execution contract.
