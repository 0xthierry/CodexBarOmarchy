# Provider Collection Refactor Oracle Note

Date: 2026-03-14
Source: user-provided Oracle output captured in this session
Status: Saved for planning reference

## Scope

Architectural review of the collection pipeline only:

- source resolution
- file / CLI / HTTP collection
- parsing and normalization
- snapshot assembly
- post-refresh enrichment

## Main Conclusions

1. The highest-risk structural problem is split-brain source orchestration.
   - `resolveClaudeSource`, `resolveCodexSource`, and `resolveGeminiSource` return enum-like values instead of rich resolved handles.
   - Real source discovery then happens again later in source-specific refresh code.
   - This spreads behavior across `resolveXSource`, `refreshXFromResolvedSource`, and collector code.
2. Parsing and snapshot assembly are duplicated across source paths.
   - The repeated pattern is: derive identity and plan, assemble `ProviderMetricInput[]`, call `createSnapshot`, then wrap with `withProviderDetails` and `createRefreshSuccess`.
3. The metric model leaks presentation concerns into normalization.
   - Providers format numeric values into strings like `"42%"`.
   - `createUsageSnapshot()` then parses those strings back into numeric `rateWindows`.
4. Enrichment is order-sensitive and manually merged.
   - Codex is the clearest example because enrichers must preserve each other's provider-details state.
5. Successful auto-fallback paths lose diagnostics.
   - Preferred-source failures are not preserved when a later fallback succeeds.
6. The most brittle provider-specific logic should stay provider-specific, but it should be isolated from orchestration.

## Recommended Refactor Seams

- Make source resolution return rich discriminated unions with resolved handles, not bare source enums.
- Introduce a shared normalized pre-snapshot type such as `RefreshSeed` or `NormalizedCollection`.
- Add shared enricher plumbing so enrichers stop hand-merging provider details.
- Extract shared JWT claim helpers.
- Extract the repeated OAuth retry skeleton only after source modules are split.

## Keep Provider-Specific

- Claude CLI probing and parsing
- Codex RPC flow, usage URL policy, and web dashboard enrichment
- Gemini project discovery, quota aggregation, and quota drilldown
- Provider-specific auth discovery tricks

## Recommended Module Shape

Per provider:

- `adapter.ts`
- `source-plan.ts`
- `sources/oauth.ts`
- `sources/cli.ts` where applicable
- `sources/web.ts` where applicable
- `normalize.ts`
- `enrich.ts`

Shared:

- `collection/pipeline.ts`
- `collection/snapshot.ts`
- `collection/jwt.ts`
- later `collection/usage.ts`

## Recommended Execution Order

1. Extract enrichers first, unchanged.
2. Change `resolveXSource` to return rich resolved handles.
3. Split source collectors into per-source modules with current parsing logic preserved at first.
4. Introduce the shared normalized pre-snapshot builder.
5. Remove the percent-string roundtrip last.
