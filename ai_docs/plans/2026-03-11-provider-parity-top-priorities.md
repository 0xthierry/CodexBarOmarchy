# Provider Parity Top Priorities Plan

Date: 2026-03-11

## Overview

Plan the next implementation slice for the current Omarchy Agent Bar codebase around these user-prioritized gaps:

- a richer runtime model for provider-specific data beyond the current shared snapshot
- shared Linux browser-cookie auto-import for Codex and Claude web paths
- Codex web extras:
  - code review remaining
  - usage breakdown
  - credits history
  - purchase URL
- token-cost history for Codex and Claude
- pace / run-out estimates for Codex and Claude
- richer Gemini quota and incident drill-down in the TUI

This plan is intentionally scoped to runtime data, acquisition, normalization, and TUI presentation for those six areas.

Explicitly out of scope for this plan:

- tray / Waybar shell work
- adding providers beyond `codex`, `claude`, and `gemini`
- a general widget/export system beyond what the current stats snapshot already exposes

## Intent Summary

The user wants to understand how each top-priority parity area can be implemented in this repository before starting code changes, and wants the working understanding kept in sync with `session.md`.

The outcome of this plan should be:

- a concrete implementation direction for each prioritized area
- a recommended sequencing that fits the current TypeScript runtime and TUI
- explicit file targets and validation seams
- clear separation between verified repo facts and proposed decisions
- a repo-grounded Linux path for shared browser-cookie import where Codex and Claude overlap

## Resolved Clarifications

- Scope is limited to the six parity areas listed above.
- Tray integration is not part of this planning slice.
- The current product surface remains:
  - headless runtime
  - `bun run stats`
  - `bun run tui`
- The current provider set remains:
  - `codex`
  - `claude`
  - `gemini`

## Current State Analysis

### Verified repo facts

- The current normalized provider snapshot lives in `src/core/store/runtime-state.ts`.
- Provider acquisition logic currently lives in:
  - `src/runtime/providers/codex.ts`
  - `src/runtime/providers/claude.ts`
  - `src/runtime/providers/gemini.ts`
- Shared provider helpers live in `src/runtime/providers/shared.ts`.
- Service-status acquisition currently returns only the collapsed current status summary and lives in `src/runtime/providers/service-status.ts`.
- `src/cli/stats-output.ts` exports the runtime snapshot as the safe machine-readable contract.
- `src/ui/tui/presenter.ts` and `src/ui/tui/opentui-app.ts` currently render only the shared snapshot fields.
- Current Codex config already contains:
  - `extrasEnabled`
  - `historicalTrackingEnabled`
  - `cookieSource`
  - `cookieHeader`
  but `src/runtime/providers/codex.ts` does not currently use those settings for dashboard enrichment or history collection.
- Current Claude runtime already supports multiple source paths and already maps OAuth `extra_usage` into `usage.providerCost`.
- Current Claude runtime already has a direct web API path using `Cookie: sessionKey=...`, but it does not yet auto-import browser cookies from Linux browser stores.
- Current Gemini runtime already preserves `usage.quotaBuckets`, but the TUI only renders the collapsed `Flash` and `Pro` rows.
- The Linux Codex spike validated browser-backed session acquisition plus direct OpenAI backend calls on this machine for:
  - Firefox
  - Chrome
  - Chromium
  - Brave
- The Linux Claude spike validated browser-backed `sessionKey` extraction plus direct Claude API calls on this machine for:
  - Firefox
  - Chrome
  - Chromium
  - Brave

### Upstream CodexBar reference seams

These are the main upstream seams relevant to this plan:

- Codex dashboard extras:
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIDashboardModels.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIWeb/OpenAIDashboardFetcher.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIWeb/OpenAIDashboardParser.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/OpenAIWeb/OpenAIDashboardScrapeScript.swift`
- Claude web APIs:
  - `.repositories/CodexBar/docs/claude.md`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeWeb/ClaudeWebAPIFetcher.swift`
- Token-cost history:
  - `.repositories/CodexBar/Sources/CodexBarCore/CostUsageFetcher.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/CostUsageModels.swift`
  - `.repositories/CodexBar/Sources/CodexBarCore/Vendored/CostUsage/*`
- Pace:
  - `.repositories/CodexBar/Sources/CodexBar/HistoricalUsagePace.swift`
  - `.repositories/CodexBar/Sources/CodexBar/UsagePaceText.swift`
- Gemini status and incident logic:
  - `.repositories/CodexBar/Sources/CodexBar/UsageStore+Status.swift`

## Design Direction

### 1. Richer runtime model for provider-specific data

#### Problem

The current snapshot is strong for shared metrics, but it is too flat for:

- Codex dashboard artifacts
- token-cost history
- pace
- Gemini drill-down data

Trying to force all of that into `usage.displayMetrics` or `usage.additional` would make the runtime harder to reason about and would lose machine-readable structure.

#### Recommended approach

Replace the current runtime snapshot with a richer structured model in one coordinated slice, and update the current consumers at the same time.

Recommended shape:

```ts
interface ProviderRuntimeSnapshot {
  identity: ProviderIdentitySnapshot;
  latestError: string | null;
  providerDetails: ProviderDetailsSnapshot | null;
  serviceStatus: ProviderServiceStatusSnapshot | null;
  sourceLabel: string | null;
  state: ProviderRuntimeStatus;
  updatedAt: string | null;
  usage: ProviderUsageSnapshot;
  version: string | null;
}

type ProviderDetailsSnapshot =
  | { kind: "codex"; dashboard: CodexDashboardSnapshot | null; pace: PaceSnapshot | null; tokenCost: TokenCostSnapshot | null }
  | { kind: "claude"; pace: PaceSnapshot | null; tokenCost: TokenCostSnapshot | null; accountOrg: string | null }
  | { kind: "gemini"; quotaDrilldown: GeminiQuotaDrilldownSnapshot | null; incidents: ProviderIncidentSnapshot[] };
```

Why this is the right fit:

- it gives the runtime one clear machine-readable contract instead of a compatibility layer
- it avoids polluting `usage` with unrelated provider-only fields
- it gives the TUI and stats export a stable place for richer sections
- it allows the repo to stop treating `usage.displayMetrics` as the primary machine-readable contract

Coordinated replacement requirement:

- update the current consumers in the same implementation slice:
  - runtime providers
  - `bun run stats`
  - TUI presenter/rendering
  - affected tests
- explicitly allow removal or redefinition of compatibility-oriented fields such as:
  - duplicated `metrics` summaries in stats output
  - the current overuse of `usage.displayMetrics` as the main structured contract

#### Local file targets

- `src/core/store/runtime-state.ts`
- `src/runtime/providers/shared.ts`
- `src/cli/stats-output.ts`
- `src/ui/tui/presenter.ts`
- `src/ui/tui/types.ts`

#### Acceptance criteria

- AC-01: The runtime model is replaced with the richer structured contract and all current consumers are updated to use it.
- AC-02: Each provider can attach richer provider-specific data without carrying fields for other providers.
- AC-03: `bun run stats` exports the new structured provider details without leaking secrets.
- AC-03a: The TUI renders from the new structured model rather than relying on the old flat snapshot shape.

### 2. Shared Linux browser-cookie import for Codex and Claude

#### Problem

The current repo has no Linux browser-cookie importer even though both Codex and Claude benefit from one:

- Codex needs browser-derived web sessions for dashboard enrichment.
- Claude already has a direct web API path, but auto mode does not currently import `sessionKey` from browsers.

If each provider implements its own Chromium/Firefox decryption and profile discovery, the repo will duplicate the riskiest Linux-specific logic.

#### Recommended approach

Introduce one shared Linux browser-cookie import layer, then keep provider-specific logic above that seam.

Recommended split:

- shared browser layer:
  - discover Firefox profiles
  - discover Chromium-family profiles
  - decrypt Chromium-family cookies on Linux
  - normalize cookie rows by domain/name/path
- provider-specific adapters:
  - Codex:
    - build `chatgpt.com` / `openai.com` cookie headers
    - validate via `api/auth/session`
    - derive bearer token and account id
  - Claude:
    - extract `sessionKey`
    - validate via `api/account`
    - fetch org-scoped usage APIs

Recommended Linux implementation:

- `cookieSource === "auto"` should be the primary Linux path for both providers.
- `cookieSource === "manual"` remains available as fallback/troubleshooting.
- Firefox and Chromium-family extraction should share one normalized result model rather than returning provider-shaped cookies directly.

Verified spike conclusion to bake into the plan:

- Codex and Claude both validated on this machine across:
  - Firefox
  - Chrome
  - Chromium
  - Brave
- Chromium-family extraction works through:
  - cookie DB read
  - `secret-tool` lookup
  - PBKDF2-derived AES key
  - `v11` cookie decrypt
  - version-24 domain-digest strip
- Firefox extraction worked from `cookies.sqlite` plain `value` reads on this machine

#### Local file targets

- new:
  - `src/runtime/browser-cookies/models.ts`
  - `src/runtime/browser-cookies/firefox.ts`
  - `src/runtime/browser-cookies/chromium.ts`
  - `src/runtime/browser-cookies/discovery.ts`
- existing:
  - `src/runtime/providers/codex.ts`
  - `src/runtime/providers/claude.ts`
  - `src/runtime/providers/shared.ts`

#### Acceptance criteria

- AC-04: The repo has one shared Linux browser-cookie import layer used by both Codex and Claude web flows.
- AC-05: Auto mode supports the Linux browsers validated in the spikes on this machine:
  - Firefox
  - Chrome
  - Chromium
  - Brave
- AC-06: Codex and Claude retain `manual` cookie configuration as a fallback path.
- AC-07: Browser-cookie import failures degrade gracefully and do not break non-web refresh paths.
- AC-08: Shared browser-cookie tests cover Chromium-family decryption and Firefox profile discovery with fixture-backed cases.

### 3. Codex web extras

#### Problem

Current Codex runtime only implements:

- OAuth usage
- CLI RPC fallback
- status page health

The config already exposes web extras and cookie settings, but the runtime does not implement them.

#### Recommended approach

Implement Codex dashboard enrichment as a second data path that runs in parallel with the primary source when `extrasEnabled` is on.

Recommended flow:

1. Keep current primary refresh path:
   - `oauth`
   - fallback to `cli`
2. When `extrasEnabled === true`, try a Codex web-enrichment fetch in parallel.
3. Acquire web auth through the shared Linux browser-cookie layer when `cookieSource === "auto"`.
4. Merge web-enrichment data into `providerDetails.kind === "codex"` without replacing the primary quota snapshot.

Recommended Linux implementation:

- upstream CodexBar's WebKit scraper is macOS-specific and should not be the primary Linux implementation model
- on Linux, the usage page HTML is useful for session/bootstrap inspection, but the primary data source should be `backend-api/wham/...`
- once a session is acquired, the runtime should:
  - call `https://chatgpt.com/api/auth/session`
  - validate the signed-in email against the primary Codex account when known
  - extract the bearer access token and account id from the session response
  - call `https://chatgpt.com/backend-api/wham/...` for the actual Codex usage payloads

#### Data to extract

- from `GET /backend-api/wham/usage`:
  - code review remaining percent via `code_review_rate_limit`
  - primary and secondary usage windows via `rate_limit`
  - additional rate limits via `additional_rate_limits`
  - credits balance and message estimates via `credits`
  - signed-in email and plan via `email` and `plan_type`
- from `GET /backend-api/wham/usage/credit-usage-events`:
  - credit events
  - derived daily credits breakdown
- from `GET /backend-api/wham/usage/daily-token-usage-breakdown`:
  - usage breakdown points
- from `GET /backend-api/wham/usage/approximate-credit-usage`:
  - approximate message/value helper data for credits UI
- unresolved / follow-up:
  - purchase URL is not yet validated from `backend-api/wham` in the Linux spike and may still require HTML/DOM fallback or explicit omission from the first slice

#### Local file targets

- new:
  - `src/runtime/providers/codex-web-auth.ts`
  - `src/runtime/providers/codex-web-auth-models.ts`
  - `src/runtime/providers/codex-web-wham.ts`
  - `src/runtime/providers/codex-web-models.ts`
- existing:
  - `src/runtime/providers/codex.ts`
  - `src/runtime/providers/shared.ts`
  - `src/ui/tui/presenter.ts`

#### Acceptance criteria

- AC-09: When Codex web extras are enabled and `cookieSource === "auto"`, the runtime can acquire a valid ChatGPT/OpenAI web session from supported Linux browsers and enrich Codex without breaking the primary `oauth` or `cli` source.
- AC-10: Dashboard data is rejected when account matching clearly fails.
- AC-11: Missing dashboard data degrades gracefully; Codex still refreshes via the primary source.
- AC-12: The TUI can render:
  - code review remaining
  - usage breakdown summary
  - credits history summary
  - credits summary derived from `wham`
- AC-13: Failed dashboard enrichment must never downgrade or replace a successful primary Codex refresh result.
- AC-14: The first Linux Codex web-extras slice may omit purchase URL if it is not available from `backend-api/wham` and no safe HTML fallback has been implemented yet.

### 4. Claude web auto-import parity

#### Problem

Claude already has a web API path in the repo, but Linux auto mode does not currently import `sessionKey` from browser cookies. That leaves the existing Claude web path weaker than upstream CodexBar parity even though the direct API itself already exists.

#### Recommended approach

Keep Claude's current direct API model and change only how `auto` mode acquires credentials on Linux:

1. Use the shared Linux browser-cookie layer to load `claude.ai` cookies.
2. Extract `sessionKey`.
3. Validate the browser session with `GET https://claude.ai/api/account`.
4. Resolve organization context through `GET https://claude.ai/api/organizations`.
5. Fetch usage and overage data through the existing org-scoped endpoints.

First-slice org selection rule:

- preserve the current repo behavior and use the first valid organization entry returned by `GET /api/organizations`
- treat explicit org selection or org-switching as a follow-up, not part of this slice

Verified spike conclusion to bake into the plan:

- Claude does not need a browser-rendered dashboard path after cookie recovery.
- `sessionKey` alone was sufficient on this machine for:
  - `GET https://claude.ai/api/account`
  - `GET https://claude.ai/api/organizations`
  - `GET https://claude.ai/api/organizations/{orgId}/usage`
  - `GET https://claude.ai/api/organizations/{orgId}/overage_spend_limit`
- live payload notes:
  - account email appears under `email_address`
  - organization identifiers are UUID-style values

#### Local file targets

- new:
  - `src/runtime/providers/claude-web-auth.ts`
  - `src/runtime/providers/claude-web-models.ts`
- existing:
  - `src/runtime/providers/claude.ts`
  - `src/runtime/providers/shared.ts`
  - `src/ui/tui/presenter.ts`

#### Acceptance criteria

- AC-15: Claude `cookieSource === "auto"` can recover `sessionKey` from supported Linux browsers through the shared browser layer.
- AC-16: Claude web refresh uses direct `claude.ai/api/...` calls after cookie recovery and does not require DOM or browser automation.
- AC-17: Claude account email and org context are attached to the richer runtime model when the web path succeeds.
- AC-18: Claude web import failure degrades to existing non-web sources without blocking the provider refresh.

### 5. Token-cost history for Codex and Claude

#### Problem

Current runtime has no local log scanning or token-cost summary model.

#### Recommended approach

Add a shared token-cost scanner layer under `src/runtime/cost/` and keep provider-specific file discovery and parsing rules separate.

Recommended shape:

```ts
interface TokenCostSnapshot {
  today: { costUsd: number; tokens: number } | null;
  last30Days: { costUsd: number; tokens: number } | null;
  daily: TokenCostDailyPoint[];
  updatedAt: string;
}
```

Recommended module split:

- `src/runtime/cost/models.ts`
- `src/runtime/cost/pricing.ts`
- `src/runtime/cost/jsonl.ts`
- `src/runtime/cost/codex-scanner.ts`
- `src/runtime/cost/claude-scanner.ts`
- `src/runtime/cost/fetcher.ts`

Recommended acquisition paths:

- Codex:
  - `~/.codex/sessions/**/*.jsonl`
  - optionally archived sessions if present
- Claude:
  - `~/.config/claude/projects/**/*.jsonl`
  - `~/.claude/projects/**/*.jsonl`

Recommended first slice:

- compute:
  - today totals
  - last 30 day totals
  - daily series
- defer:
  - session-level breakdown
  - cache invalidation complexity beyond a simple mtime/content-based cache if measurement shows it is needed

Note:

- A cache is likely desirable later, but the current repo does not yet have a local cache subsystem for this feature.
- Recommendation: start without a persistent cache unless scanning proves too slow in practice.

#### Local file targets

- new:
  - `src/runtime/cost/*`
- existing:
  - `src/runtime/providers/codex.ts`
  - `src/runtime/providers/claude.ts`
  - `src/core/store/runtime-state.ts`
  - `src/cli/stats-output.ts`
  - `src/ui/tui/presenter.ts`

#### Acceptance criteria

- AC-19: Codex and Claude can each attach a `tokenCost` snapshot derived from local logs.
- AC-20: The scanner ignores invalid or unrelated JSONL lines instead of failing the whole refresh.
- AC-21: The TUI renders at least:
  - `Today`
  - `Last 30 days`
  for providers with token-cost data.

### 6. Pace / run-out estimates for Codex and Claude

#### Problem

Current runtime stores mostly display strings for windows, which is awkward for pace calculations.

#### Recommended approach

Introduce a machine-readable rate-window structure for pace math while keeping the current display metrics for presentation.

Recommended addition:

```ts
interface ProviderRateWindowSnapshot {
  label: string;
  resetAt: string | null;
  usedPercent: number;
}
```

Recommended placement:

- either add `structuredWindows` under `usage`
- or enrich the provider-specific subtree with pace inputs

Recommendation:

- keep pace inputs under shared `usage` so both Codex and Claude can use the same calculator
- keep the final pace result under provider-specific details

Pace modules:

- `src/core/usage/pace.ts`
- `src/core/usage/pace-text.ts`

Phase-1 behavior recommendation:

- derive pace directly from the current weekly window and reset time for both Codex and Claude
- do not block the first implementation on Codex historical backfill from dashboard usage breakdown

Optional follow-up:

- if Codex dashboard breakdown becomes available, use it to improve Codex pace later

#### Local file targets

- `src/core/store/runtime-state.ts`
- `src/runtime/providers/shared.ts`
- `src/runtime/providers/codex.ts`
- `src/runtime/providers/claude.ts`
- new:
  - `src/core/usage/pace.ts`
  - `src/core/usage/pace-text.ts`
- existing:
  - `src/ui/tui/presenter.ts`

#### Acceptance criteria

- AC-22: Codex and Claude weekly pace can be computed from machine-readable weekly windows.
- AC-23: The TUI renders a clear pace summary for each provider when enough data exists.
- AC-24: Missing or invalid reset timestamps disable pace gracefully instead of producing misleading output.

### 7. Gemini quota and incident drill-down in the TUI

#### Problem

Current Gemini runtime already exports:

- collapsed `Flash`
- collapsed `Pro`
- raw `quotaBuckets`
- collapsed current status

But the TUI does not surface the raw model buckets or incident details.

#### Recommended approach

Reuse the existing `quotaBuckets` data, add a small normalized drill-down model for grouped quotas, and extend status acquisition to preserve active incident entries for workspace-backed providers.

Recommended shapes:

```ts
interface GeminiQuotaDrilldownSnapshot {
  proBuckets: GeminiQuotaBucketSnapshot[];
  flashBuckets: GeminiQuotaBucketSnapshot[];
  otherBuckets: GeminiQuotaBucketSnapshot[];
}

interface ProviderIncidentSnapshot {
  severity: string | null;
  status: string | null;
  summary: string | null;
  updatedAt: string | null;
}
```

Recommended implementation:

- keep `serviceStatus` as the collapsed status line for all providers
- add detailed incidents only in `providerDetails.kind === "gemini"`
- render the Gemini details pane with:
  - grouped quota buckets
  - active incident list

#### Local file targets

- `src/runtime/providers/gemini.ts`
- `src/runtime/providers/service-status.ts`
- `src/core/store/runtime-state.ts`
- `src/ui/tui/presenter.ts`
- `src/ui/tui/opentui-app.ts`

#### Acceptance criteria

- AC-25: Gemini details can render more than the collapsed `Flash` and `Pro` rows.
- AC-26: Active workspace incidents are preserved as structured entries for Gemini.
- AC-27: The TUI shows a Gemini drill-down section only when richer quota or incident data exists.

## Recommended sequencing

1. Add the provider-specific runtime extension model.
2. Add the shared Linux browser-cookie import layer.
3. Add machine-readable window data needed for pace.
4. Implement pace for Codex and Claude.
5. Implement Claude auto-import against the existing web API path.
6. Implement token-cost history for Codex and Claude.
7. Implement Codex web extras with Linux auto-cookie import and `backend-api/wham` fetch.
8. Implement Gemini drill-down rendering.
9. Expand `bun run stats` and the TUI to expose all new sections consistently.

Why this order:

- the runtime model is the dependency for every other feature
- the shared browser-cookie importer is a dependency for both Codex and Claude Linux web parity
- pace is small and validates the new structured model early
- Claude web auto-import is simpler than Codex and validates the shared cookie layer before the more complex OpenAI flow
- token-cost history is local-only and independent of Codex web acquisition
- Codex web extras are no longer blocked on a browser-rendered Linux scraper because the spike validated the `api/auth/session` -> `backend-api/wham` flow
- Gemini drill-down mostly reuses data we already collect

## Risks and watchouts

- Linux browser-cookie acquisition is browser-specific even though the downstream API path is shared.
- Chromium-family browsers depend on Linux secret-store access and cookie-DB format assumptions that should be covered by focused tests.
- Firefox profile discovery differs from the current common-path assumptions and should use the `.config/mozilla/firefox` path found in the spike.
- Claude organizations can return multiple entries; if the first valid organization assumption is insufficient, implementation will need an explicit org-selection rule.
- Purchase URL and any remaining credits-history details may still need an HTML fallback if they are not present in `backend-api/wham`.
- Extending the shared snapshot too aggressively could make the model less clear rather than more useful.
- Pace is only trustworthy if it is computed from machine-readable timestamps and percentages, not parsed UI strings.
- Local JSONL scanning can become expensive; if scanning is slow on real data, a cache will need to be added deliberately rather than hidden inside the first implementation.
- Gemini incident history is only straightforward for the workspace feed already in use; Codex and Claude status histories are a separate problem.

## Open decisions requiring user confirmation

These are recommendations, not settled scope.

1. Token-cost scanner caching:
   - Recommendation: start without a persistent cache unless real scans prove too slow.
2. Pace data source:
   - Recommendation: ship weekly-window pace first, then optionally improve Codex pace later using dashboard breakdown backfill.

## Validation plan

- `bun test`
- `bun run typecheck`
- `bun run lint`
- targeted tests to add:
  - `test/runtime/browser-cookies/chromium.test.ts`
  - `test/runtime/browser-cookies/firefox.test.ts`
  - `test/runtime/claude-web-auth.test.ts`
  - `test/runtime/codex-web-auth.test.ts`
  - `test/runtime/codex-wham.test.ts`
  - `test/runtime/token-cost.test.ts`
  - `test/core/usage/pace.test.ts`
  - `test/ui/tui-presenter.test.ts`
  - `test/cli/stats-output.test.ts`

## Session sync requirement

When implementation begins for any phase above, `session.md` should be updated with:

- current phase in progress
- accepted simplifications
- file ownership / touched modules
- newly discovered blockers
- what remains after the phase lands
