# Omarchy Agent Bar Spec

Date: 2026-03-08

## Purpose

Define the research-backed product and configuration contract for an Omarchy-native equivalent of CodexBar.

Current scope for this document:

- Linux app for Omarchy, not a 1:1 CodexBar clone
- provider set limited to `codex`, `claude`, and `gemini`
- same style of automatic provider detection for those three providers as CodexBar currently uses
- focus on:
  - what the UI must show
  - how provider auto-detection works
  - what options/actions are available in each provider screen
  - how provider data is collected
  - how config is persisted in a file while remaining editable from the UI

Explicitly out of scope now:

- `cursor`
- `copilot`
- every other CodexBar provider

## 1. Verified Omarchy Environment

Verified facts:

- Omarchy is an Arch-based Linux distribution built around Hyprland. Evidence: upstream Omarchy docs and repo, previously researched for this project.
- Waybar is the primary top bar. Its default config includes a right-side tray area exposed via `group/tray-expander` and `tray`. Evidence: upstream `config/waybar/config.jsonc`.
- Omarchy expects user-owned config in `~/.config`.
- A tray app for Omarchy should target Linux tray/status-notifier behavior, not a macOS menu-bar implementation model.

Implications for this app:

- one tray icon integrated into Waybar's tray area
- one popup/panel opened from that tray icon
- file-backed config under `~/.config`

## 2. Product Definition

The app is a compact Omarchy tray utility for:

- Codex
- Claude
- Gemini

Primary UX:

- one tray icon in the Omarchy Waybar tray
- one popup window/panel opened from that tray icon
- a provider switcher at the top of the popup when more than one provider is enabled
- one provider card view at a time

Provider defaults for this version:

- `codex`, `claude`, and `gemini` should use the same automatic detection pattern as CodexBar:
  - detect whether the provider CLI is installed
  - enable that provider automatically when installed
  - if none of the three CLIs are installed, keep `codex` enabled as the fallback default

Evidence:

- `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ProviderDetection.swift:14-60`

This is the required default behavior for our app, not just a recommendation.

## 3. Shared UI Contract Derived From CodexBar

CodexBar's provider detail/settings screen is built from:

- a header with provider name, subtitle, refresh button, and enable switch
- an info grid with state/source/version/updated/account/plan fields
- inline metric rows
- optional error display
- a `Settings` section for pickers, secure fields, and token-account controls
- an `Options` section for toggles

Evidence:

- detail screen structure: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:45-101`
- header actions: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:154-183`
- info-grid fields: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:234-260`
- settings/options sections: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:72-94`
- picker/toggle/field row behavior: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift:36-201`
- token-account row actions: `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift:203-281`

Our app should preserve that information hierarchy, but adapt it to Linux UI primitives.

### Shared screen-level actions for every provider

Every provider screen in our app must support:

- enable/disable provider
- refresh provider now
- view current state
- view source label
- view version if known
- view updated timestamp
- view account email when available
- view plan/login method when available
- view latest error when present

These are grounded in CodexBar's shared provider detail view:

- `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:49-56`
- `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:170-183`
- `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:242-260`

## 4. Auto-Detection Contract

The app must run initial provider auto-detection exactly for `codex`, `claude`, and `gemini`:

1. detect `codex` CLI
2. detect `claude` CLI
3. detect `gemini` CLI
4. if none of them are installed, still enable `codex`
5. persist the resulting enabled-state into the config file

CodexBar evidence:

- binary detection and fallback behavior:
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ProviderDetection.swift:16-27`
- persistence path for provider config changes:
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ConfigPersistence.swift:37-59`
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ConfigPersistence.swift:145-176`

Omarchy app contract:

- run detection on first launch and whenever the user explicitly requests re-detection
- store the detected enabled-state in config so the result is user-overridable afterward
- once the user manually changes enabled-state, that persisted choice wins until they change it again

## 5. Provider Definitions

Interpretation rule:

- the provider sections below document both:
  - researched CodexBar behavior
  - the exact provider-screen contract we want in the Omarchy app
- when something is marked optional or deferred, it is not part of Phase 1

### 5.1 Codex

#### UI data shown in CodexBar

Verified:

- labels are `Session` and `Weekly`; Codex supports credits
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexProviderDescriptor.swift:10-39`
- Codex provider screen exposes:
  - `Usage source` picker
  - `OpenAI cookies` picker
  - secure manual `Cookie: …` field when cookie mode is manual
  - `Historical tracking` toggle
  - `OpenAI web extras` toggle
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Codex/CodexProviderImplementation.swift:60-175`
- Codex supports provider login flow
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Codex/CodexProviderImplementation.swift:194-198`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Codex/CodexLoginFlow.swift:4-16`

#### Codex screen contract for our app

The Codex provider screen must allow the user to:

- enable/disable Codex
- refresh Codex
- see provider state/source/version/updated/account/plan
- choose `Usage source`
  - `Auto`
  - `OAuth`
  - `CLI`
- choose `OpenAI cookies`
  - `Automatic`
  - `Manual`
  - `Off`
- paste a manual OpenAI `Cookie:` header when cookie mode is `Manual`
- toggle `Historical tracking`
- toggle `OpenAI web extras`
- start/restart Codex login/auth flow

Notes:

- `OpenAI cookies` picker is only visible when `OpenAI web extras` is enabled in CodexBar. Preserve that dependency.
- `OpenAI web extras` are optional in implementation, but the config surface still belongs in the spec because the user asked to map all options/actions in the provider screen.

#### How Codex source selection works

Verified:

- explicit source modes are `auto`, `oauth`, `cli`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Codex/CodexProviderImplementation.swift:48-53`
- in app runtime, `auto` resolves to:
  1. OAuth
  2. CLI
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexProviderDescriptor.swift:61-73`
- in CLI runtime, `auto` resolves to:
  1. Web
  2. CLI
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexProviderDescriptor.swift:47-60`

Omarchy app contract:

- app auto-order must be `OAuth -> CLI`
- web/dashboard data is optional enrichment, not the primary app fetch path

#### How Codex data is collected

Verified:

- OAuth credentials from `$CODEX_HOME/auth.json` or `~/.codex/auth.json`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexOAuth/CodexOAuthCredentials.swift:48-68`
- OAuth usage fetch through ChatGPT/OpenAI backend usage endpoint
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexOAuth/CodexOAuthUsageFetcher.swift:148-201`
- CLI local RPC via `codex -s read-only -a untrusted app-server`
  - `.repositories/CodexBar/Sources/CodexBarCore/UsageFetcher.swift:344-522`
- PTY fallback by sending `/status`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexStatusProbe.swift:48-160`
- optional dashboard/web extras via cookie-backed `chatgpt.com/codex/settings/usage`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexWebDashboardStrategy.swift:5-149`

### 5.2 Claude

#### UI data shown in CodexBar

Verified:

- labels are `Session`, `Weekly`, and `Sonnet`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeProviderDescriptor.swift:10-42`
- Claude provider screen exposes:
  - `Usage source` picker
  - `Keychain prompt policy` picker when applicable
  - `Claude cookies` picker
  - token-account/session-token management row
  - `Avoid Keychain prompts (experimental)` toggle
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeProviderImplementation.swift:65-192`
- token-account row supports:
  - add account
  - remove selected account
  - open token file
  - reload from disk
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift:240-279`
- Claude supports provider login flow
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeProviderImplementation.swift:194-198`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeLoginFlow.swift:4-24`
- Claude may expose a provider-specific recovery action `Open Terminal` when OAuth is failing
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeProviderImplementation.swift:216-235`

#### Claude screen contract for our app

The Claude provider screen must allow the user to:

- enable/disable Claude
- refresh Claude
- see provider state/source/version/updated/account/plan
- choose `Usage source`
  - `Auto`
  - `OAuth`
  - `Web`
  - `CLI`
- choose `Claude cookies`
  - `Automatic`
  - `Manual`
- manage Claude session tokens / token accounts:
  - view configured accounts
  - select active account
  - add account label + token
  - remove selected account
  - open token file
  - reload token file
- start/restart Claude login/auth flow
- trigger recovery action equivalent to `Open Terminal` when OAuth repair requires it

Linux note:

- Claude prompt-policy and secret-storage behavior are deferred for now.
- Phase 1 should not expose prompt-policy controls in the canonical Linux config or provider screen until we decide the Linux secret-storage contract.

#### How Claude source selection works

Verified:

- explicit source modes are `auto`, `oauth`, `web`, `cli`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeProviderImplementation.swift:55-62`
- in app runtime, `auto` resolves to:
  1. OAuth
  2. CLI
  3. Web
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeProviderDescriptor.swift:69-93`
- in CLI runtime, `auto` resolves to:
  1. Web
  2. CLI
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeProviderDescriptor.swift:45-68`

Omarchy app contract:

- app auto-order must be `OAuth -> CLI -> Web`
- token-account/session-token mode must remain available from the provider screen because it is part of the current Claude settings surface

#### How Claude data is collected

Verified:

- OAuth credentials from environment, CodexBar cache, `~/.claude/.credentials.json`, and Claude Code keychain data
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeOAuth/ClaudeOAuthCredentials.swift:103-236`
- OAuth fetch path through Anthropic OAuth usage API
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeProviderDescriptor.swift:131-248`
- web path through cookie-backed `claude.ai` APIs
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeWeb/ClaudeWebAPIFetcher.swift:12-228`
- CLI PTY path through `claude`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeUsageFetcher.swift:773-815`

### 5.3 Gemini

#### UI data shown in CodexBar

Verified:

- labels are `Pro` and `Flash`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiProviderDescriptor.swift:10-40`
- Gemini provider screen has no provider-specific settings rows in CodexBar
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Gemini/GeminiProviderImplementation.swift:5-14`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Shared/ProviderImplementation.swift:122-132`
- Gemini still supports provider login flow
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Gemini/GeminiProviderImplementation.swift:10-13`
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Gemini/GeminiLoginFlow.swift:4-18`

#### Gemini screen contract for our app

The Gemini provider screen must allow the user to:

- enable/disable Gemini
- refresh Gemini
- see provider state/source/version/updated/account/plan
- start/restart Gemini login/auth flow

There are no provider-specific pickers, fields, token-account controls, or toggles in the current CodexBar model for Gemini.

#### How Gemini source selection works

Verified:

- single API strategy only
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiProviderDescriptor.swift:35-63`
- unsupported auth types are rejected:
  - `api-key`
  - `vertex-ai`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:151-172`

Omarchy app contract:

- Gemini is API-only
- no browser-cookie mode
- no alternate CLI/web source picker is needed

#### How Gemini data is collected

Verified:

- auth type from `~/.gemini/settings.json`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:135-149`
- OAuth credentials from `~/.gemini/oauth_creds.json`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:182-213`
- token refresh via Google OAuth
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:208-213`
- quota and tier discovery through:
  - `loadCodeAssist`
  - `retrieveUserQuota`
  - Cloud Resource Manager fallback
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:219-294`

## 6. Configuration Contract

### File-backed persistence

CodexBar persists provider config in a JSON file and writes it automatically after UI changes.

Verified CodexBar behavior:

- config file path: `~/.codexbar/config.json`
  - `.repositories/CodexBar/Sources/CodexBarCore/Config/CodexBarConfigStore.swift:73-77`
- config is JSON, normalized, pretty-printed, saved atomically, and chmodded to `0600`
  - `.repositories/CodexBar/Sources/CodexBarCore/Config/CodexBarConfigStore.swift:50-85`
- provider config updates are triggered from UI mutations and then persisted asynchronously
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ConfigPersistence.swift:37-45`
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ConfigPersistence.swift:145-176`

Omarchy app contract:

- persist config in a file
- all provider screen changes must update in-memory state immediately and then persist to disk
- file location for our app should be:
  - `~/.config/omarchy-agent-bar/config.json`
- file permissions should be `0600`

### Editable config model

The UI must allow the user to edit provider config without manually opening the file.

Minimum persisted fields:

The persisted JSON contract uses camelCase keys.

```json
{
  "version": 1,
  "providers": {
    "codex": {
      "enabled": true,
      "source": "auto",
      "extrasEnabled": false,
      "cookieSource": "off",
      "cookieHeader": null,
      "historicalTrackingEnabled": true
    },
    "claude": {
      "enabled": true,
      "source": "auto",
      "cookieSource": "auto",
      "tokenAccounts": [],
      "activeTokenAccountIndex": 0
    },
    "gemini": {
      "enabled": true
    }
  },
  "selectedProvider": "codex",
  "providerOrder": ["codex", "claude", "gemini"]
}
```

Notes:

- This is the Omarchy-app schema proposal, not a literal CodexBar schema.
- It is intentionally narrower than CodexBar's generic multi-provider config.

## 7. Provider-Screen Option Matrix

### Codex

- Common actions:
  - enable/disable
  - refresh
  - login/auth flow
- Settings:
  - Usage source: `Auto`, `OAuth`, `CLI`
  - OpenAI cookies: `Automatic`, `Manual`, `Off`
  - manual secure cookie field when `Manual`
- Options:
  - Historical tracking
  - OpenAI web extras

### Claude

- Common actions:
  - enable/disable
  - refresh
  - login/auth flow
  - recovery action equivalent to `Open Terminal` when OAuth repair is needed
- Settings:
  - Usage source: `Auto`, `OAuth`, `Web`, `CLI`
  - Claude cookies: `Automatic`, `Manual`
  - token accounts/session tokens:
    - choose active account
    - add account
    - remove selected account
    - open token file
    - reload token file
- Options:
  - none in Phase 1

### Gemini

- Common actions:
  - enable/disable
  - refresh
  - login/auth flow
- Settings:
  - none
- Options:
  - none

## 8. Minimal Build Contract For The Next Phase

When implementation starts, the first useful slice should provide:

- one Omarchy tray icon
- popup with provider switcher for `codex`, `claude`, `gemini`
- initial auto-detection for those three CLIs with the same logic CodexBar uses
- provider screens with the exact options/actions listed in section 7
- file-backed persisted config at `~/.config/omarchy-agent-bar/config.json`
- immediate UI-driven config mutation with automatic file persistence
- working collectors for:
  - Codex OAuth or CLI
  - Claude OAuth, CLI, and optional web fallback contract
  - Gemini API
- persisted selected-provider tab
- periodic refresh plus manual refresh

Deferred:

- Cursor
- Copilot
- every non-target provider
- Codex dashboard extras implementation
- Claude Linux-specific secret-storage replacement details
- token-cost summaries

## 9. Acceptance Criteria

### AC-01 Must

The app must run as a tray-resident app compatible with Omarchy's Waybar tray model.

Validation:

- Manual: launch in an Omarchy session and verify the icon appears in Waybar's tray area or tray expander.

### AC-02 Must

On first launch, the app must auto-detect `codex`, `claude`, and `gemini` CLIs and enable providers using the same logic as CodexBar:

- enable `codex` if Codex is installed
- enable `claude` if Claude is installed
- enable `gemini` if Gemini is installed
- if none are installed, keep `codex` enabled

Validation:

- Automated: unit tests for provider-detection logic.
- Manual: test with different CLI availability combinations.
- Repository basis: `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ProviderDetection.swift:14-60`

### AC-03 Must

The popup must show only enabled providers from the supported set (`codex`, `claude`, `gemini`) in persisted order, and it must remember the last selected provider.

Validation:

- Manual: enable/disable providers, reorder them, restart the app, and verify ordering/selection persistence.

### AC-04 Must

Each provider screen must expose the shared fields:

- state
- source
- version
- updated
- account when available
- plan/login-method when available
- refresh action
- enable/disable action

Validation:

- Automated: view-model tests.
- Manual: compare against section 3.

### AC-05 Must

Each provider screen must expose the provider-specific options/actions defined in section 7.

Validation:

- Automated: provider-screen model tests for visible controls.
- Manual: inspect each provider screen and verify all listed controls exist.

### AC-06 Must

Config must be persisted in a file and remain user-editable through the UI.

This means:

- user changes in the provider screens update runtime state immediately
- the updated config is saved automatically to disk
- the config file survives restart

Validation:

- Automated: config store/load/save tests.
- Manual: change settings in the UI, restart the app, and verify the changes persist.

### AC-07 Must

Provider source selection must match this spec:

- Codex app auto: `OAuth -> CLI`
- Claude app auto: `OAuth -> CLI -> Web`
- Gemini: `API only`

Validation:

- Automated: provider-specific source-selection tests.
- Manual: diagnostics/logging should show the chosen source label.

### AC-08 Must

Refresh must support both:

- periodic background refresh
- manual/user-initiated refresh

The popup must remain responsive during refresh.

Validation:

- Automated: store refresh-state tests.
- Manual: open the popup while a slow provider refresh is running.

## 10. Source Index

### Shared/provider-screen references

- provider detail layout:
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:45-101`
- provider header actions:
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:154-183`
- provider info grid:
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift:234-260`
- picker/toggle/field rows:
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift:36-201`
- token-account actions:
  - `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift:203-281`

### Provider references

- Codex implementation:
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Codex/CodexProviderImplementation.swift:7-198`
- Claude implementation:
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Claude/ClaudeProviderImplementation.swift:5-236`
- Gemini implementation:
  - `.repositories/CodexBar/Sources/CodexBar/Providers/Gemini/GeminiProviderImplementation.swift:5-14`
- Codex descriptor/fetching:
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexProviderDescriptor.swift:7-220`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexOAuth/CodexOAuthCredentials.swift:48-68`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexOAuth/CodexOAuthUsageFetcher.swift:148-201`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexStatusProbe.swift:48-160`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Codex/CodexWebDashboardStrategy.swift:5-149`
- Claude descriptor/fetching:
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeProviderDescriptor.swift:7-343`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeOAuth/ClaudeOAuthCredentials.swift:103-236`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeUsageFetcher.swift:773-815`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Claude/ClaudeWeb/ClaudeWebAPIFetcher.swift:12-228`
- Gemini descriptor/fetching:
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiProviderDescriptor.swift:7-63`
  - `.repositories/CodexBar/Sources/CodexBarCore/Providers/Gemini/GeminiStatusProbe.swift:135-294`

### Detection/config references

- provider auto-detection:
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ProviderDetection.swift:14-60`
- config persistence:
  - `.repositories/CodexBar/Sources/CodexBar/SettingsStore+ConfigPersistence.swift:37-176`
- config schema/store:
  - `.repositories/CodexBar/Sources/CodexBarCore/Config/CodexBarConfig.swift:3-132`
  - `.repositories/CodexBar/Sources/CodexBarCore/Config/CodexBarConfigStore.swift:20-86`
