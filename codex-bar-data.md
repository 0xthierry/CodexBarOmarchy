# CodexBar data map

This is a repository-grounded summary of the data CodexBar collects and how it surfaces that data in the menu bar, menu card, widgets, and account sections.

Scope note: this focuses on display-facing runtime data plus the auth/session inputs each provider depends on. It does not enumerate every internal cache key or secret value format. When docs and code disagree, the current source and tests win.

## Shared data CodexBar collects

| Data | Where it lives | How CodexBar shows it |
| --- | --- | --- |
| Primary quota window | `RateWindow` in `Sources/CodexBarCore/UsageFetcher.swift` | Main menu-bar bar, first menu-card metric, first widget metric |
| Secondary quota window | `RateWindow` in `Sources/CodexBarCore/UsageFetcher.swift` | Bottom hairline in the menu bar, second menu-card metric, second widget metric |
| Tertiary/model-specific quota window | `RateWindow` in `Sources/CodexBarCore/UsageFetcher.swift` | Third menu-card metric for providers like Claude and Antigravity |
| Usage percent | `RateWindow.usedPercent` / `remainingPercent` | Shown as `% left` by default; optional `% used` mode flips the label and fill direction |
| Reset timestamp or reset text | `RateWindow.resetsAt` / `resetDescription` | Countdown or absolute reset time in the menu card; some providers replace this with detail text |
| Account identity | `ProviderIdentitySnapshot` in `Sources/CodexBarCore/UsageFetcher.swift` | `Account: ...`, `Plan: ...`, org/project/IDE info in the account section and menu-card header |
| Credits balance and credit events | `CreditsSnapshot` / `CreditEvent` in `Sources/CodexBarCore/CreditsModels.swift` | Codex credits section, last spend line, widget `creditsRemaining`, credits-history submenu |
| Provider-specific spend/quota budget | `ProviderCostSnapshot` in `Sources/CodexBarCore/ProviderCostSnapshot.swift` | Separate "Extra usage" or "Quota usage" section with percent bar and spend line |
| Token cost history | `CostUsageTokenSnapshot` feeding `WidgetSnapshot.TokenUsageSummary` | "Today" and "Last 30 days" cost/token lines for Codex, Claude, and Vertex AI |
| Daily history | `WidgetSnapshot.DailyUsagePoint` and OpenAI dashboard daily breakdown models | Widgets, cost charts, usage-breakdown charts, credits-history charts |
| Provider status/incidents | `ProviderStatus` in `UsageStore` plus `docs/status.md` sources | Incident overlay on the menu-bar icon, status page actions, in-menu state text |
| Pace prediction | `UsagePace` and `UsagePaceText` | Weekly pace note for Codex and Claude; can show "On pace", deficit/reserve, and run-out ETA |
| Codex web extras | `OpenAIDashboardSnapshot` in `Sources/CodexBarCore/OpenAIDashboardModels.swift` | Code review meter, usage-breakdown submenu, credits-history submenu, buy-credits link |
| Token accounts / manual multi-account tokens | `TokenAccountUsageSnapshot` and token-account settings | Account switcher bar or stacked account cards; per-account usage snapshots in the menu |
| Widget export | `WidgetSnapshot` in `Sources/CodexBarCore/WidgetSnapshot.swift` | Mirrors provider metrics, credits, code review, token usage, and daily history into widgets |

## Provider-by-provider matrix

| Provider | Auth/session inputs it reads | Data it collects | How CodexBar shows it |
| --- | --- | --- | --- |
| Codex | OAuth tokens from `~/.codex/auth.json`; OpenAI cookies; CLI RPC/PTy; local `~/.codex/sessions/**/*.jsonl` | Session quota, weekly quota, reset text/timestamps, credits balance, credit spend events, account email/plan, code review remaining, usage breakdown, credits history, buy-credits URL, local token cost and 30-day history | `Session` + `Weekly` metrics, weekly pace, `Code review` metric, credits section, token-cost section, usage-breakdown and credits-history submenus, account/plan text |
| Claude | OAuth credentials from Keychain or `~/.claude/.credentials.json`; `sessionKey` cookies; CLI PTY; local Claude project logs | Session quota, weekly quota, Sonnet/Opus weekly quota, extra-usage spend vs limit, account email/org/plan, local token cost and 30-day history | `Session`, `Weekly`, and `Sonnet` metrics, weekly pace, `Extra usage` section, account/org text, token-cost section |
| Gemini | Gemini CLI OAuth credentials | Per-model quotas with reset time; lowest Pro quota and lowest Flash quota; account email and plan/tier | `Pro` and `Flash` metrics in the card; lowest quota drives the menu-bar icon |
| Antigravity | Local language-server probe | Model quotas, reset descriptions, account email, account plan | Up to three model metrics: `Claude`, `Gemini Pro`, `Gemini Flash` |
| Cursor | Browser cookies or stored session | Included plan usage, on-demand usage, billing-cycle end, membership type, account email/name, legacy request-plan usage, on-demand provider cost | `Plan` metric plus `On-Demand` text or fallback metric; account/plan text |
| OpenCode | Browser cookies, workspace lookup, `_server` calls | Rolling 5-hour usage, weekly usage, both reset timers | `5-hour` and `Weekly` metrics |
| Factory (Droid) | Factory cookies, bearer tokens, local storage, WorkOS refresh tokens | Standard usage, premium usage, billing period end, plan, tier, organization, email | `Standard` and `Premium` metrics, reset text, account/org/plan text |
| z.ai | API key from config/env | Token-window quota, time/MCP quota, plan name, raw counts (`currentValue`, `usage`, `remaining`), per-model MCP usage details, reset time | `Tokens` and `MCP` metrics with extra detail text like `current / limit (remaining remaining)`; plan in account section |
| Copilot | GitHub OAuth token via device flow/env | Premium quota snapshot, chat quota snapshot, plan name | `Premium` and `Chat` metrics; plan in account section |
| Kimi | `kimi-auth` JWT from cookie/manual token | Weekly request quota, 5-hour rate-limit quota, request counts, reset timestamps | `Weekly` and `Rate Limit` metrics with request-count detail |
| Kilo | API key or CLI `~/.local/share/kilo/auth.json` | Credits used/total/remaining, Kilo Pass used/total/remaining, pass bonus, pass reset, plan name, auto top-up status/method | `Kilo Pass` and `Credits` metrics; Kilo Pass is sorted above Credits in the card; plan/activity text in account section |
| Kimi K2 | API key | Consumed credits, remaining credits, computed total, average tokens per request | `Credits` metric with `Credits: used/total` detail. `averageTokens` is collected in the raw snapshot but is not surfaced in the common menu-card model |
| Kiro | `kiro-cli` session | Plan name, credits used/total, bonus credits used/total, bonus expiry days, reset time | `Credits` and optional `Bonus` metrics; plan shown in account section |
| Warp | API key | Request/credit limit, requests used, next refresh, unlimited flag, combined add-on credits, next expiring add-on batch | `Credits` metric with `used/limit credits` or `Unlimited`; `Add-on credits` metric with expiry detail |
| Vertex AI | Google ADC OAuth credentials and Claude local logs | Project ID, account email, local token cost history; Cloud Monitoring quota fetch exists in `VertexAIUsageFetcher` | Current source surfaces identity plus token-cost history. The docs still describe a `Quota usage` section, but the current `VertexAIProviderDescriptor` maps no quota window into `UsageSnapshot` |
| Augment | Browser cookies / session refresh flow | Credits remaining, credits used, total credit limit, billing-cycle end, account email, account plan | `Credits` metric with reset text, account/plan text, refresh-session action |
| Amp | Browser cookies and settings-page scrape | Free quota, free used amount, hourly replenishment, inferred refill ETA, optional window length | Single `Amp Free` metric; reset is inferred from replenishment rate |
| Ollama | Browser cookies and settings-page scrape | Plan name, account email, session used percent, weekly used percent, session reset, weekly reset | `Session` and `Weekly` metrics; account email and plan |
| JetBrains AI | Local IDE quota XML | Current credits used/max/available, refill date, quota type, detected IDE | `Current` metric with reset/refill text; account section shows IDE name and quota type |
| OpenRouter | API key | Total credits, total usage, balance, optional API-key usage/limit, optional rate-limit metadata | Current source and tests show the main metric as API-key quota when available, with `API key limit` title and `$remaining/$limit left`; balance is shown as account text (`Balance: $X.XX`). If key quota is unavailable, the card falls back to notes like `No limit set for the API key` or `API key limit unavailable right now` |
| MiniMax | Browser cookies/local storage/manual cookie header/API key | Plan name, available prompts, current prompts, remaining prompts, window length, used percent, reset time | `Prompts` metric with detail like `X prompts / Y hours`; plan in account section |
| Synthetic (internal/test provider) | API key | Arbitrary quota entries with labels, percentages, window lengths, reset data, plan name | `Quota` and `Usage` metrics. This appears to be an internal/debug provider, not part of the public provider docs |

## Notes where docs and code diverge

| Topic | Current evidence | What I used in this file |
| --- | --- | --- |
| OpenRouter primary display | `docs/openrouter.md` says the primary meter is credit usage, but `OpenRouterUsageSnapshot.toUsageSnapshot()` plus `MenuCardModelTests` show API-key quota as the current primary metric when available | Code and tests |
| Vertex AI quota display | `docs/vertexai.md` says it shows `Quota usage`, but `VertexAIProviderDescriptor.mapUsage()` currently returns identity only and leaves quota windows empty | Code |

## Omarchy-relevant acquisition notes

These are the CodexBar data paths most relevant to the provider set we currently support in Omarchy.

| Provider | Missing parity area in our app | CodexBar acquisition path |
| --- | --- | --- |
| Codex | Code review, usage breakdown, credits history, purchase URL | scrape `https://chatgpt.com/codex/settings/usage` using browser-imported or manual cookies into `OpenAIDashboardSnapshot` |
| Codex | Token-cost history | scan `~/.codex/sessions/**/*.jsonl` and archived session logs into `CostUsageTokenSnapshot` |
| Codex | Pace | derive from weekly window; optionally personalize from locally stored history plus dashboard usage breakdown |
| Claude | Extra usage spend/limit | `GET https://api.anthropic.com/api/oauth/usage` field `extra_usage`; web fallback `GET /api/organizations/{orgId}/overage_spend_limit` |
| Claude | Token-cost history | scan `~/.config/claude/projects/**/*.jsonl` and `~/.claude/projects/**/*.jsonl` |
| Claude | Pace | derive from weekly window and reset time |
| Gemini | Richer quota model | keep per-model buckets from `retrieveUserQuota`, not just collapsed Pro/Flash summary |
| Gemini | Status/incidents | poll Google Workspace incidents JSON and filter Gemini product incidents |
| Codex / Claude | Status/incidents | poll provider Statuspage `api/v2/status.json` |

## Key source files

- `docs/providers.md`
- `docs/ui.md`
- `Sources/CodexBarCore/UsageFetcher.swift`
- `Sources/CodexBarCore/WidgetSnapshot.swift`
- `Sources/CodexBar/MenuCardView.swift`
- `Sources/CodexBar/MenuDescriptor.swift`
- Provider-specific files under `Sources/CodexBarCore/Providers/*`
- Display-behavior tests in `Tests/CodexBarTests/MenuCardModelTests.swift`
