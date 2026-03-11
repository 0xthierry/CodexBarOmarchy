# Session

Last updated: 2026-03-11

This file is the working session log for this repository.
It should stay in sync with what we are actively building, what is already verified in code, what is still missing, and what we plan to tackle next.

It is not the product spec.
It is the implementation-facing source of truth for current work.

## Current focus

Build an Omarchy-native equivalent of the useful parts of CodexBar for the currently supported providers:

- `codex`
- `claude`
- `gemini`

Current product shape in code:

- headless runtime
- safe JSON stats export via `bun run stats`
- keyboard-first TUI via `bun run tui`

Not implemented yet:

- tray / Waybar shell
- floating terminal launch/focus integration
- richer provider-specific parity with CodexBar

## Verified current implementation

These points are verified from the current codebase and a live `bun run stats` run on 2026-03-11.

### Core architecture

- `src/runtime/app-runtime.ts` wires config store, provider detection, provider adapters, and scheduler.
- `src/core/store/app-store.ts` owns state, persistence, provider actions, and scheduler state.
- `src/core/config/store.ts` persists config at `~/.config/omarchy-agent-bar/config.json` with `0600` permissions.
- `src/runtime/provider-adapters.ts` only wires three real providers: `codex`, `claude`, `gemini`.
- `src/cli/stats.ts` refreshes enabled providers and prints a redacted JSON snapshot.
- `src/ui/tui/*` renders the terminal UI from the same shared store state.

### Shared runtime data shape

All providers currently map into one shared normalized snapshot:

- identity
  - `accountEmail`
  - `planLabel`
- runtime status
  - `state`
  - `sourceLabel`
  - `version`
  - `updatedAt`
  - `latestError`
  - `serviceStatus`
- usage
  - `windows`
  - `balances.credits`
  - `providerCost`
  - `quotaBuckets`
  - `additional`
  - `displayMetrics`

This shared shape is defined in `src/core/store/runtime-state.ts`.

### Provider coverage today

#### Codex

Implemented:

- source resolution: `auto -> oauth -> cli`
- OAuth read from `~/.codex/auth.json`
- CLI fallback through Codex app-server RPC
- metrics:
  - `Session`
  - `Weekly`
  - `Credits`
- identity:
  - account email
  - plan label
- version
- OpenAI status page health

Not yet implemented in runtime:

- OpenAI dashboard extras
- code review remaining
- usage breakdown
- credits history
- purchase URL
- token-cost history
- pace

Important note:

- Codex config already exposes `extrasEnabled`, `historicalTrackingEnabled`, and cookie-source UI, but those do not yet drive real web/history collection.

#### Claude

Implemented:

- source resolution: `auto -> oauth -> cli -> web`
- OAuth refresh and usage API support
- CLI `/status` parsing
- web-session support
- local stats fallback from `~/.claude/stats-cache.json`
- metrics, depending on source:
  - `Session`
  - `Weekly`
  - `Sonnet`
  - or local counters: `Tokens`, `Messages`, `Sessions`, `Tools`
- identity:
  - account email
  - plan label
- provider cost:
  - OAuth `extra_usage` mapped into `usage.providerCost`
- Anthropic status page health
- Claude token-account management in the TUI

Not yet implemented:

- token-cost history from Claude local project logs
- weekly pace
- richer multi-account usage display
- org/account fields beyond current basic mapping
- broader extra-usage support outside current OAuth path

#### Gemini

Implemented:

- OAuth credential handling
- quota fetch from Gemini APIs
- per-model quota buckets retained in `usage.quotaBuckets`
- collapsed display metrics:
  - `Flash`
  - `Pro`
- identity:
  - account email
  - derived plan label
- Google Workspace incident/status fetch

Not yet implemented:

- richer quota drill-down in the UI
- dedicated incident/history view
- richer account/tier metadata presentation

### TUI surface today

The TUI currently renders:

- provider tabs
- header
- usage area
- details area
- config summary
- keyboard help / menu
- settings modal

The TUI does not currently render dedicated sections for:

- credits history
- usage breakdown history
- token-cost history
- pace
- incident history
- multi-provider overview

## Missing map

This is the practical gap list against the useful CodexBar features we are likely to need as well.

### Priority 0: foundation gaps

These are structural gaps that block the intended Omarchy product shape.

- Tray / Waybar integration does not exist yet.
- No process or shell layer currently opens or focuses the TUI from a tray icon.
- No dedicated launcher flow exists for the "one tray icon -> one floating terminal TUI" product contract.
- `session.md` exists now, but we still need to keep it updated as work progresses.
- `spike.md` now tracks the Linux Codex web-extras spike.
- experimental Linux cookie/dashboard work now lives under `skipe/`.

### Priority 1: shared data-model gaps

These are cross-provider capabilities missing from the current normalized snapshot and UI.

- No dedicated history models for:
  - credits history
  - usage history
  - token-cost history
  - daily breakdowns
- No pace model or run-out estimate.
- No richer incident/status history model, only current status.
- No provider-specific extension blocks beyond the shared snapshot, except current Claude `providerCost`.
- No multi-provider overview model.

### Priority 1: Codex parity gaps

- OpenAI dashboard scraping/enrichment is not implemented.
- No code review remaining metric.
- No usage breakdown chart data.
- No credits event/history data.
- No buy-credits URL.
- No token-cost history from `~/.codex/sessions/**/*.jsonl`.
- No weekly pace.
- Current Codex settings for web extras/history are mostly config-only.

### Priority 1: Claude parity gaps

- No token-cost history from Claude local logs.
- No weekly pace.
- No richer account organization / org display.
- No dedicated extra-usage section outside the current flat `providerCost` rendering.
- No multi-account per-account usage snapshots.

### Priority 1: Gemini parity gaps

- Raw quota buckets are exported but not surfaced in a richer UI block.
- Incident signal exists, but there is no richer incident/history drill-down.
- No detailed account/tier metadata surface beyond the derived plan label.

### Priority 2: UI parity gaps

- No dedicated blocks for provider-specific enrichments.
- No overview screen.
- No compact summary surface outside the TUI and JSON stats.
- No widget/export model beyond the current stats snapshot.
- No richer visual treatment for histories, trends, or account sections.

## Suggested implementation order

This is the current recommended order, based on what appears most valuable and least speculative.

1. Implement tray / launcher integration for Omarchy.
2. Introduce provider-specific extension data in the runtime snapshot.
3. Implement Codex web extras end-to-end.
4. Implement token-cost history for Codex and Claude.
5. Add pace derivation for Codex and Claude.
6. Expand the TUI to render provider-specific blocks and history sections.
7. Add a richer Gemini quota/status drill-down.

## Current top-priority planning

The current detailed plan artifact for the user-prioritized parity work is:

- `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md`

The corresponding readiness review is:

- `ai_docs/reviews/2026-03-11-provider-parity-top-priorities-plan-review.md`
- `ai_docs/reviews/2026-03-11-provider-parity-top-priorities-plan-review-no-backcompat.md`

### Newly clarified decision

- backward compatibility is not required for the parity-model migration

Implication:

- the parity plan should use a coordinated replacement of the runtime model plus current consumers:
  - runtime providers
  - stats export
  - TUI presenter
  - tests

### What the current plan recommends

- replace the current runtime snapshot with a richer provider-specific `providerDetails` structure instead of overloading `usage.displayMetrics`
- replace the current runtime model cleanly rather than preserving compatibility-oriented fields
- add machine-readable rate-window data so pace is derived from structured values, not UI strings
- add a shared Linux browser-cookie import layer for Codex and Claude instead of duplicating browser-specific extraction per provider
- implement Codex dashboard enrichment in parallel with the primary Codex source, not as a replacement for it
- implement Claude browser-cookie auto-import against the existing direct `claude.ai/api/...` path
- add a shared token-cost scanner layer with provider-specific Codex and Claude parsers
- reuse existing Gemini `quotaBuckets` and extend status acquisition to preserve active incident entries for drill-down

### Open decisions still requiring confirmation

- whether token-cost history should launch without a persistent cache first
- whether Codex pace should initially use only weekly-window math, with dashboard-backed backfill deferred

### New direction from current session

- Codex web extras should target automatic cookie import as the primary path.
- Manual `Cookie:` header entry is no longer the preferred user flow.
- The immediate discovery task is how to implement reliable Linux browser-cookie import for `chatgpt.com` / `openai.com`.
- Upstream CodexBar's current OpenAI auto-import path is macOS-only, so it cannot be copied directly.
- Claude browser-cookie import on Linux should follow the same shared extraction layer, but its downstream fetch path is simpler because `sessionKey` is enough for direct JSON APIs.

## Current assumptions

- Scope remains limited to `codex`, `claude`, and `gemini`.
- The current app is not trying to replicate every CodexBar provider.
- We should prioritize the useful CodexBar data paths already identified in `codex-bar-data.md` and `bar-data.md`, not invent new product scope.
- The current shared snapshot was the right first step, but it is too flat for parity with CodexBar's richer provider-specific sections.

## Risks / watchouts

- Codex settings currently imply functionality that does not yet exist in runtime; this can confuse users if surfaced without follow-through.
- A purely shared snapshot model may become awkward once we add richer provider-specific sections.
- Claude source behavior is intentionally varied; any new history/cost work should avoid mixing data from incompatible sources.
- Gemini quota buckets are already available, so the main work there is presentation and drill-down, not acquisition.

## Next working targets

- [ ] decide the first parity milestone
- [ ] define the runtime extension model for provider-specific data
- [ ] implement Codex dashboard extras or tray integration first
- [ ] update this file after each meaningful change in scope or implementation

## Session notes

### 2026-03-11

- Read upstream `CodexBar` docs and local mapping docs.
- Verified the repo is currently a headless runtime plus TUI, not yet a tray app.
- Verified `bun run stats` live output for all three providers.
- Drafted the top-priority parity plan and review artifacts under `ai_docs/plans/` and `ai_docs/reviews/`.
- Confirmed the biggest implementation gaps are:
  - tray integration
  - Codex dashboard extras/history
  - token-cost history
  - pace
  - richer provider-specific UI blocks
- Reviewed upstream CodexBar's OpenAI cookie import path:
  - it imports browser cookies for `chatgpt.com` and `openai.com`
  - it validates cookie candidates against signed-in account email
  - it persists a validated per-account web session
  - it scrapes the Codex usage dashboard after session validation
- Verified that upstream OpenAI cookie import and dashboard fetching are currently `#if os(macOS)` implementations using WebKit and macOS browser-cookie access.
- Confirmed this repo has no implemented Linux browser-cookie importer yet; current Codex cookie settings remain config-only.
- Created the Linux spike tracker at `spike.md`.
- Created isolated experiment scaffolding under `skipe/`, including:
  - `skipe/README.md`
  - `skipe/codex-openai-linux-spike.ts`
- Verified the experimental script runs for local cookie-store discovery.
- Verified on this machine that likely Chromium-family stores exist at:
  - `~/.config/google-chrome/Local State`
  - `~/.config/google-chrome/Default/Cookies`
  - `~/.config/chromium/Local State`
  - `~/.config/chromium/Default/Cookies`
- Verified Firefox on this machine stores profile data under `~/.config/mozilla/firefox/`, with ChatGPT cookies present in `cookies.sqlite`.
- Verified local Chromium-family OpenAI cookie extraction on Linux:
  - reads cookie DBs from Chrome, Chromium, and Brave
  - retrieves safe-storage secrets via `secret-tool`
  - decrypts `v11` cookie values
  - strips the DB-version-24 domain digest prefix
- Verified local Firefox OpenAI cookie extraction on Linux:
  - reads `~/.config/mozilla/firefox/.../cookies.sqlite`
  - uses the cookie `value` column directly for the OpenAI/ChatGPT session on this machine
- Verified extracted Linux Chromium cookies authenticate successfully against:
- Verified extracted Linux Chrome cookies authenticate successfully against the same endpoints and with the same result shape as Chromium.
- Verified extracted Linux Brave cookies authenticate successfully against the same endpoints and with the same result shape as Chrome/Chromium.
- Verified extracted Linux Chromium cookies authenticate successfully against:
  - `https://chatgpt.com/backend-api/me`
  - `https://chatgpt.com/api/auth/session`
- Verified extracted Linux Firefox cookies authenticate successfully against the same endpoints and with the same result shape as Chrome/Chromium.
- Verified `api/auth/session` yields the signed-in email and a bearer access token usable for follow-up API calls.
- Verified the logged-in Codex usage page HTML is only a shell and does not contain the target metrics in the initial document.
- Identified and validated the real backend usage endpoints from the route bundles:
  - `https://chatgpt.com/backend-api/wham/usage`
  - `https://chatgpt.com/backend-api/wham/usage/credit-usage-events`
  - `https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown`
  - `https://chatgpt.com/backend-api/wham/usage/daily-enterprise-token-usage-breakdown`
  - `https://chatgpt.com/backend-api/wham/usage/approximate-credit-usage`
- Verified `backend-api/wham` endpoints return:
  - `401` with cookies only
  - `200` with cookie-derived bearer token for usage, credits events, daily token breakdown, and approximate credit usage
  - `403` for enterprise token breakdown on this non-enterprise account
- Verified Firefox returns the same `backend-api/wham` auth behavior and response-shape summary as Chrome, Chromium, and Brave on this machine.
- Current Linux conclusion:
  - automatic cookie import is feasible for Chromium-family browsers
  - Codex web extras should use cookies to obtain the session and bearer token
  - Codex web extras should fetch primary data from `backend-api/wham/...`, not by scraping hydrated DOM as the first-choice path on Linux
- Created the Claude Linux spike tracker at `claude-spike.md`.
- Added Claude experimental validation code at `skipe/claude-linux-spike.ts`.
- Verified Linux Claude cookie extraction on this machine for:
  - Chromium
  - Chrome
  - Firefox
  - Brave
- Verified all four browsers expose a usable `sessionKey` for `claude.ai`.
- Verified all four browsers successfully authenticate Claude's direct web APIs with `Cookie: sessionKey=<value>`:
  - `https://claude.ai/api/account`
  - `https://claude.ai/api/organizations`
  - `https://claude.ai/api/organizations/{orgId}/usage`
  - `https://claude.ai/api/organizations/{orgId}/overage_spend_limit`
- Verified the live Claude payload shape differs slightly from the earlier assumption:
  - account email appears under `email_address`
  - organization identifiers are UUID-style values
- Current Linux Claude conclusion:
  - browser-specific work is only cookie extraction
  - Claude does not need a browser-rendered dashboard path after session recovery
  - the natural implementation is a shared Linux browser-cookie importer plus a Claude-specific API fetcher
- Updated `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md` to replace the stale manual-cookie recommendation with the validated Linux auto-cookie + `api/auth/session` + `backend-api/wham` plan.
- Reviewed the updated plan in `ai_docs/reviews/2026-03-11-provider-parity-top-priorities-plan-review-linux-spike-update.md` with verdict `READY`.
- Updated `ai_docs/plans/2026-03-11-provider-parity-top-priorities.md` again to add:
  - a shared Linux browser-cookie import layer for Codex and Claude
  - Claude Linux browser-cookie auto-import parity
  - shared browser-cookie test targets
  - the first-slice Claude org-selection rule
- Reviewed the Claude-updated plan in `ai_docs/reviews/2026-03-11-provider-parity-top-priorities-plan-review-claude-linux-update.md` with verdict `READY`.
