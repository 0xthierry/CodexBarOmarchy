# Omarchy Bar data map

This file describes the data our current app actually collects, exports, and renders today, then compares that against [codex-bar-data.md](/home/thierry/Work/Sideprojects/CodexBarOmarchy/codex-bar-data.md).

Source basis:

- local source under `src/`
- the current `bun run stats` output on 2026-03-10

Scope note: this is the current implementation, not the long-term spec. When `spec.md` says we should eventually support something but the code does not, this file treats it as missing.

## What our app collects today

## Shared runtime snapshot

Our app has one shared provider snapshot shape for all providers:

| Data | Where it lives | How we show/export it |
| --- | --- | --- |
| Provider id | `ProviderView.id` | provider tabs, stats JSON |
| Enabled flag | `ProviderView.enabled` | tab label state, settings toggle, stats JSON |
| Selected flag | `ProviderView.selected` | focused tab and `selectedProviderId` in stats JSON |
| Runtime state | `ProviderRuntimeSnapshot.state` | header summary, details panel, stats JSON |
| Source label | `ProviderRuntimeSnapshot.sourceLabel` | header, details panel, stats JSON |
| Version | `ProviderRuntimeSnapshot.version` | details panel, stats JSON |
| Updated timestamp | `ProviderRuntimeSnapshot.updatedAt` | details panel, stats JSON |
| Identity block | `ProviderRuntimeSnapshot.identity` | header summary, details panel, stats JSON |
| Latest error | `ProviderRuntimeSnapshot.latestError` | usage area footer, details panel, stats JSON |
| Service status | `ProviderRuntimeSnapshot.serviceStatus` | usage area health note, details panel, stats JSON |
| Usage block | `ProviderRuntimeSnapshot.usage` | usage panel in TUI, stats JSON |
| Provider actions | `ProviderRuntimeState.actions` | internal store state for refresh/login/repair/open-token-file/reload-token-file |
| Enabled provider ids | `AppStoreState.enabledProviderIds` | stats JSON |
| Provider order | config + `providerViews` order | tab order |
| Selected provider id | `AppStoreState.selectedProviderId` | tab focus, stats JSON |
| Scheduler state | `AppStoreState.scheduler` | store only; not shown in `bun run stats` |

## Metric model

Unlike the earlier flat `snapshot.metrics[]` shape, we now keep a shared typed usage object:

| Field | Type | Meaning |
| --- | --- | --- |
| `identity.accountEmail` | string or `null` | resolved account email |
| `identity.planLabel` | string or `null` | current plan/workspace label |
| `usage.windows` | typed object | named window slots for `session`, `weekly`, `sonnet`, `pro`, `flash` |
| `usage.balances.credits` | metric or `null` | Codex credit balance display row |
| `usage.providerCost` | typed object or `null` | provider-level spend block such as Claude OAuth extra usage |
| `usage.quotaBuckets` | typed array | normalized per-model Gemini quota buckets preserved from the raw API response |
| `usage.additional` | metric array | uncategorized display rows such as local Claude counters |
| `usage.displayMetrics` | metric array | ordered display/export list derived from the typed fields |

Each display metric row still uses the same compact shape:

| Field | Type | Meaning |
| --- | --- | --- |
| `label` | string | display name like `Session`, `Weekly`, `Credits`, `Sonnet`, `Flash`, `Pro` |
| `value` | string | display value such as `16%` or `0.00` |
| `detail` | string or `null` | usually a reset timestamp ISO string, but it is free-form |

Display behavior in the TUI:

- If `value` looks like `NN%`, the presenter renders a 16-cell text meter.
- If `detail` parses as an ISO timestamp, the presenter turns it into `Resets today HH:MM` or `Resets DD Mon HH:MM`.
- If `detail` is missing for known labels, the presenter injects generic text like `Current session window`.
- Non-percent metrics like Codex `Credits` render as plain text with no bar.

## Safe stats export

`bun run stats` exports a redacted JSON snapshot:

- includes provider status, metrics, and a small settings summary
- excludes secret token values
- for Claude it exports only:
  - `activeTokenAccountIndex`
  - `tokenAccountLabels`
- for Codex it exports only:
  - `showCookieSourceControl`
  - `showManualCookieField`

This is one area where our current app is already deliberate: the exported snapshot is safe to inspect without leaking saved tokens.

## TUI surface

Our TUI renders these sections from the shared snapshot:

| Section | Data used |
| --- | --- |
| Tabs | provider id, enabled, selected |
| Header | provider id, source label, `identity.planLabel`, runtime state |
| Usage | `usage.displayMetrics`, latest error, provider health note |
| Details | state, health, source, version, updated, `identity.accountEmail`, `identity.planLabel`, provider-cost summary, raw-quota count, health impact, error |
| Config summary | selected provider settings descriptors |
| Menu | fixed keyboard/help lines |
| Settings modal | provider setting descriptors, choices, token-account editor state |

We do not currently render dedicated blocks for credits history, cost history, pace, account organizations, or daily breakdowns. Provider health is now surfaced inline, but not as a richer incident/history view.

## Provider-by-provider data

| Provider | Sources implemented | Data collected today | How we show it |
| --- | --- | --- | --- |
| Codex | OAuth API and Codex CLI app-server RPC | account email, plan label, version, `Session %`, `Weekly %`, `Credits balance`, reset timestamps when the source provides them | header, usage rows, details panel, stats JSON |
| Claude | OAuth API, web session, CLI parsing, local fallback cache | account email, plan label, version, `Session %`, `Weekly %`, `Sonnet %`; OAuth mode can also populate `usage.providerCost`; local fallback can surface `Tokens`, `Messages`, `Sessions`, `Tools` from `.claude/stats-cache.json` | header, usage rows, details panel, stats JSON |
| Gemini | OAuth-backed quota API | account email, derived plan label (`Paid`, `Legacy`, `Workspace`, `Free`), version, highest-used `Pro %`, highest-used `Flash %`, reset timestamps, full normalized `usage.quotaBuckets[]` list | header, usage rows, details panel, stats JSON |

## Current live snapshot example

Observed from `bun run stats` on 2026-03-10:

- `codex`
  - source `oauth`
  - metrics `Session 19%`, `Weekly 20%`, `Credits 0.00`
  - service status `minor`
- `claude`
  - source `cli`
  - additional metrics `Tokens 48319`, `Messages 3880`, `Sessions 4`, `Tools 151`
  - no live `providerCost` in this snapshot because the current source is CLI rather than OAuth
- `gemini`
  - source `api`
  - metrics `Flash 0%`, `Pro 0%`
  - `usage.quotaBuckets` contained `12` raw model buckets in the live snapshot

This confirms the current app is now exporting both a typed `identity` / `usage` snapshot and a compatibility `metrics` summary.

## Comparison with CodexBar

## What we have in common

| Area | CodexBar | Our app |
| --- | --- | --- |
| Core provider coverage | Codex, Claude, Gemini supported | Codex, Claude, Gemini supported |
| Source labels | tracks source mode like OAuth/CLI/Web/API | tracks `sourceLabel` |
| Account identity | email and plan/login data | `identity.accountEmail` and `identity.planLabel` |
| Basic quota metrics | usage windows/percentages | typed `usage.windows` plus display metrics |
| Configurable provider settings | yes | yes, but much smaller |
| JSON-friendly CLI export | yes | yes via `bun run stats` |

## What we currently have that is different

| Area | CodexBar | Our app |
| --- | --- | --- |
| Export model | provider-specific rich snapshot objects | one shared typed snapshot for every provider |
| TUI/CLI safety | mixed app data surfaces | redacted stats export intentionally omits secret token values |
| Claude local fallback | focuses on quota and cost views | can fall back to local counters like `Tokens`, `Messages`, `Sessions`, `Tools` |

## What CodexBar has that we do not

### Shared missing data structures

| Missing in our app | CodexBar has |
| --- | --- |
| typed primary/secondary/tertiary windows | yes |
| credits snapshot with balance + event history | yes |
| provider cost / extra usage snapshot | partial: Claude OAuth `providerCost` is implemented, but not yet a broader cross-provider cost/history model |
| token cost summary for today and last 30 days | yes |
| daily usage history points | yes |
| widget snapshot/export model | yes |
| provider incident/status tracking | yes, and with richer history/detail surfaces |
| weekly pace model and run-out estimate | yes |
| code review remaining data | yes for Codex |
| usage-breakdown and credits-history data | yes for Codex |
| account organization / login method as separate fields | yes |
| per-account usage snapshots for token accounts | yes |

### Missing display blocks

| Missing in our TUI | CodexBar has |
| --- | --- |
| dedicated credits section | yes |
| dedicated extra-usage / quota-usage section | yes |
| token cost section | yes |
| usage breakdown chart/submenu | yes |
| credits history chart/submenu | yes |
| provider status indicator overlays | yes |
| overview/combined multi-provider surface | yes |
| stacked token-account cards or account switcher usage view | yes |

### Missing provider-specific data

| Provider | Missing versus CodexBar |
| --- | --- |
| Codex | no OpenAI dashboard extras, no code review metric, no usage breakdown, no credits history, no buy-credits URL, no local token-cost history, no pace summary |
| Claude | no account organization field, no token-cost history section, no pace summary, no multi-account per-account usage display, and no extra-usage support outside the OAuth path |
| Gemini | no richer tier/account metadata, no incident history/detail view, and no dedicated raw-quota drill-down beyond the inline summary/export |

## Gap summary

If the goal is parity with the useful parts of CodexBar, the biggest missing pieces are:

1. Richer provider-specific snapshot sections beyond the current shared `identity` / `usage` model.
2. Separate support for credits, provider cost, and token-cost history.
3. Codex web extras: code review, usage breakdown, credits history.
4. Pace tracking and richer status history/presentation.
5. A display model that can render more than one flat list of metric rows.

## How CodexBar gets the missing data

This section narrows the comparison to the providers we actually support: `codex`, `claude`, and `gemini`.

| Missing data in our app | Provider | How CodexBar gets it | Source type |
| --- | --- | --- | --- |
| Code review remaining | Codex | OpenAI dashboard scrape at `https://chatgpt.com/codex/settings/usage` using imported browser cookies or manual cookie header | Web dashboard |
| Usage breakdown (30-day chart) | Codex | Same OpenAI dashboard scrape; parses Recharts chart data into `usageBreakdown` | Web dashboard |
| Credits history / credit events | Codex | Same OpenAI dashboard scrape; parses credits table rows into `CreditEvent[]` and `dailyBreakdown` | Web dashboard |
| Credits purchase URL | Codex | Same dashboard scrape | Web dashboard |
| Token-cost history (`Today`, `Last 30 days`, daily entries) | Codex | Scans `~/.codex/sessions/**/*.jsonl` and archived session logs, then computes token and cost totals | Local logs |
| Weekly pace / run-out estimate | Codex | Computes from weekly window; optionally personalizes using stored Codex history and dashboard usage breakdown backfill | Derived from current data + local history |
| Extra usage spend/limit | Claude | From OAuth `GET https://api.anthropic.com/api/oauth/usage` field `extra_usage`; web fallback uses `GET /api/organizations/{orgId}/overage_spend_limit` | OAuth API / web API |
| Account organization | Claude | Web API `GET https://claude.ai/api/account` and CLI `/status` parsing can provide org/account fields | Web API / CLI |
| Token-cost history (`Today`, `Last 30 days`, daily entries) | Claude | Scans `~/.config/claude/projects/**/*.jsonl` and `~/.claude/projects/**/*.jsonl` | Local logs |
| Weekly pace / run-out estimate | Claude | Derived from weekly window and reset time | Derived from current data |
| Full per-model quota list | Gemini | Same quota API we already call, but CodexBar keeps per-model buckets before collapsing to Pro/Flash display | Existing API response |
| Provider incident/status | Gemini | implemented: polls Google Workspace incidents JSON feed and filters by Gemini product id | Status feed |
| Provider incident/status | Codex / Claude | implemented: polls each provider’s Statuspage `api/v2/status.json` | Status feed |

## How we can collect it too

### Already available from sources we use today

These do not require a new upstream endpoint, only a richer local snapshot and presenter:

| Missing data | Current source we already use | What we would need to change |
| --- | --- | --- |
| Claude extra usage spend/limit | Claude OAuth usage response already includes `extraUsage` in `src/runtime/providers/claude.ts` | implemented as `usage.providerCost`; remaining work is broader UI/history coverage and non-OAuth parity |
| Richer Gemini quota data | Gemini quota API already returns all buckets | implemented as normalized `usage.quotaBuckets[]`; remaining work is richer drill-down and secondary summaries |
| Pace for Claude | Claude weekly metric already has reset timestamps in OAuth/web mode | add a derived pace calculator in the store/presenter |
| Pace for Codex | Codex weekly metric already has reset timestamps in OAuth and CLI mode | add a derived pace calculator; optional later improvement is historical personalization |
| Claude account org from CLI | our Claude CLI parsing already captures `Org:` as `planLabel` in some paths | split identity into separate `plan` and `organization` fields instead of overloading `planLabel` |

### Feasible with our current host, but not implemented

These are realistic with `RuntimeHost` as it exists today because we already have HTTP, command execution, and file reads.

| Missing data | How we can collect it in Omarchy | Main constraint |
| --- | --- | --- |
| Codex token-cost history | enumerate `~/.codex/sessions` files via command runner (`find`, `rg --files`) and parse JSONL | our file API has no directory listing, so enumeration likely needs command execution or a new filesystem method |
| Claude token-cost history | enumerate Claude project log roots via command runner and parse JSONL | same directory-enumeration limitation |
| Per-account Claude usage views | iterate configured Claude token accounts and fetch usage for each saved token | needs a per-account snapshot model and rate limiting |

### Feasible, but our host/runtime likely needs new capabilities

| Missing data | How we can collect it | What is missing today |
| --- | --- | --- |
| Codex dashboard extras with automatic browser-cookie import | read Chromium/Firefox cookie stores on Linux, build a cookie header, then fetch the Codex dashboard HTML and parse it | our host lacks binary-file access, sqlite helpers, and browser-cookie import support |
| Claude automatic browser-cookie import | read Chromium/Firefox cookie stores on Linux and extract `sessionKey`, then call Claude web APIs | same cookie-storage access gap |
| Robust Codex dashboard chart parsing | fetch the dashboard HTML with cookies and parse hydrated chart/table data using a DOM or structured script extraction | our runtime has only raw HTTP text, so we would likely add an HTML/DOM parsing layer |

### Data that is probably macOS-specific in CodexBar and needs adaptation

| CodexBar mechanism | Why it does not port directly | Omarchy-friendly replacement |
| --- | --- | --- |
| `WKWebView` off-screen dashboard scrape | WebKit app-hosted scrape is macOS-only | direct HTTP fetch with a cookie header, plus HTML parsing |
| Keychain-backed cookie cache | macOS Keychain is not available in our current Linux runtime | config-file cache or secret-service integration later |
| Safari cookie import | Safari cookie store is macOS-specific | Chromium/Firefox cookie import only on Linux |

## Recommended collection plan

If we want the highest-value parity first, the order should be:

1. Add pace/run-out derivation for Codex and Claude from the windows we already collect.
2. Add token-cost history by enumerating local Codex and Claude session logs.
3. Add account-organization and multi-account usage views for Claude.
4. Add local token-cost scanners for Codex and Claude using command-based file enumeration plus JSONL parsing.
5. Add simple weekly pace from current weekly windows.
6. Add Codex dashboard extras through manual cookie-header mode first, then automatic browser-cookie import later.

## Proposed source map for our implementation

| Feature | Source in our app | New code likely needed |
| --- | --- | --- |
| Typed runtime snapshot | `src/core/store/runtime-state.ts` | new snapshot interfaces and view mappers |
| Status polling | `src/runtime/host.ts` HTTP client | new provider status fetchers and state fields |
| Claude provider cost | `src/runtime/providers/claude.ts` | extend parser and snapshot, then presenter |
| Gemini raw buckets | `src/runtime/providers/gemini.ts` | preserve bucket list in snapshot |
| Token-cost scanning | `src/runtime/host.ts` command runner | recursive file enumeration + JSONL parsers + cache model |
| Codex dashboard extras | existing Codex cookie config + HTTP client | cookie-header fetcher, HTML parser, richer snapshot fields |

## Suggested next shape for our data model

If we want cleaner parity work, the next data contract should probably move from:

- `metrics: { label, value, detail }[]`

to something closer to:

- `primaryWindow`
- `secondaryWindow`
- `tertiaryWindow`
- `credits`
- `providerCost`
- `tokenUsage`
- `providerStatus`
- `identity`
- `providerExtras`

That would let the TUI render real sections instead of inferring behavior from labels like `Session` or `Credits`.

## Key source files

- `src/core/store/runtime-state.ts`
- `src/core/store/state.ts`
- `src/cli/stats-output.ts`
- `src/cli/stats.ts`
- `src/ui/tui/presenter.ts`
- `src/ui/tui/descriptors.ts`
- `src/runtime/providers/claude.ts`
- `src/runtime/providers/codex.ts`
- `src/runtime/providers/gemini.ts`
