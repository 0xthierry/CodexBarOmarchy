# CodexBarOmarchy

Terminal-first provider usage dashboard for Omarchy.

Inspired by [CodexBar](https://github.com/steipete/CodexBar), this project brings the same general idea to an Omarchy-flavored Linux setup: keep your AI provider usage, account state, and service health visible without leaving the terminal.

<img src="assets/agent-stats-tui.png" alt="CodexBarOmarchy running in the terminal on Omarchy" width="560" />

## What It Does

- Shows a keyboard-driven TUI for `codex`, `claude`, and `gemini`
- Renders with your active Omarchy theme
- Tracks usage windows, account identity, plan, version, and provider status
- Surfaces service degradation when the provider status pages expose it
- Persists provider settings in a local config file
- Exposes a headless JSON snapshot via `bun run stats`
- Scans local Codex and Claude history to estimate token cost totals

This repository is currently focused on `codex`, `claude`, and `gemini`. It is closer to "CodexBar for Omarchy" than a full Linux port of the upstream macOS app.

## How It Works

1. On first run, the app detects installed provider CLIs and creates `~/.config/omarchy-agent-bar/config.json`.
2. The headless runtime refreshes each enabled provider through provider-specific adapters.
3. Those adapters read local CLI auth files, optional web/cookie-backed session data, and provider status endpoints.
4. The TUI presents the current snapshot, and the non-interactive stats command prints the same state as JSON.

## Providers

- `codex`: CLI or OAuth-backed usage, optional OpenAI web extras, and local token-cost history
- `claude`: CLI, OAuth, or web-backed usage with saved token accounts for manual cookie mode
- `gemini`: Gemini CLI OAuth-backed quota tracking with workspace status support

## Install

### Requirements

- [Bun](https://bun.sh/) 1.3+
- Omarchy if you want automatic theme pickup
- Any provider CLIs you want to monitor: `codex`, `claude`, and/or `gemini`

### Setup

```bash
bun install
```

## Usage

Launch the interactive TUI:

```bash
bun run tui
```

Run the tray entrypoint:

```bash
bun run tray
```

The repo-local `tray` script uses the development identity suffix `dev`, so it does not collide with a future installed production build that uses `org.omarchy.agent-stats`.

Print the current provider state as JSON:

```bash
bun run stats
```

Common keys in the TUI:

- `1-3`: switch provider tabs
- `h` / `l`: move between providers
- `,`: open settings
- `r`: refresh the selected provider
- `q`: quit
- `Ctrl+C`: emergency exit

If `stdout` is not a TTY, `bun run tui` falls back to a plain-text snapshot instead of the interactive renderer.

The current tray slice is manual-start only. Install packaging and session autostart are deferred; the tray launcher is intentionally shaped so those can be added later without rewriting the tray service.

## Configuration

- Config file: `~/.config/omarchy-agent-bar/config.json`
- Config permissions are written as `0600`
- Omarchy theme lookup:
  - `~/.config/omarchy/current/theme/colors.toml`
  - `~/.local/share/omarchy/current/theme/colors.toml`
- Override theme path with `OMARCHY_THEME_PATH`

## Development

```bash
bun run test
bun run e2e:tui
bun run lint
bun run typecheck
```

`bun run stats` is useful for scripting and verification because it prints a JSON snapshot and excludes secret token values from saved Claude token accounts.
