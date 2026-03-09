# Omarchy Native Look Spike

This folder is intentionally ignored by git.

## Goal

Prototype the Omarchy-native direction agreed for this project:

- tray click should open or focus a floating terminal panel
- the panel should feel like an Omarchy tool, not like a generic web popup
- the UI should follow the active Omarchy theme automatically
- data is mock-only for now

## Findings

### Product direction

- The chosen interaction model is:
  - tray click -> open/focus floating terminal TUI
- The target is native Omarchy behavior, not CodexBar visual parity.
- The surface should inherit Omarchy conventions:
  - square borders
  - monospaced dense layout
  - theme-driven colors
  - keyboard-first controls

### CodexBar layout findings

Reading the checked-out CodexBar app changed the spike direction in one important way: the popup is not just a list of metrics. It has a stable section hierarchy that is worth preserving even in a terminal form.

Relevant source files:

- `.repositories/CodexBar/Sources/CodexBar/MenuCardView.swift`
- `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderDetailView.swift`
- `.repositories/CodexBar/Sources/CodexBar/PreferencesProviderSettingsRows.swift`

The stable hierarchy we should mirror is:

- provider tabs / switcher
- provider title + subtitle + plan/status summary
- usage metrics
- optional extra-usage / credits / cost blocks
- account and provider details
- provider settings
- provider options
- bottom app actions such as dashboard, status, settings, about, quit

For the Omarchy TUI spike, the best translation is not a 1:1 popup copy. The better terminal mapping is:

- header box for tabs + provider identity
- left usage box for metrics plus spend/cost blocks
- right details/config column for account rows and provider config
- bottom menu box for provider actions and app-level actions

### Why `OpenTUI`

`OpenTUI` is the best fit found for this spike.

Reasons:

- it is TypeScript-first
- it runs on Bun, which already matches this repo
- it has a native Zig core instead of pretending the terminal is a browser
- it exposes renderables we actually need for this panel shape:
  - boxes
  - text
  - selects
  - tab selects
  - scroll containers

Official sources:

- <https://opentui.com/>
- <https://opentui.com/docs/getting-started/>
- <https://github.com/anomalyco/opentui>

Practical caveat:

- `OpenTUI` requires the native package/toolchain path to work, including Zig during package build on this machine

### Omarchy-specific findings that shape the spike

- The active Omarchy theme is available locally at `~/.config/omarchy/current/theme/colors.toml` on this machine.
- Omarchy tools commonly launch terminal-hosted TUIs rather than bespoke GUI popups.
- Omarchy bar and TUI styling is sharp and square rather than rounded.
- The future tray icon should follow Omarchy-standard iconography rather than inventing custom glossy branding.

## Files

- `omarchy-native-look-and-feel.ts`
  - runnable terminal prototype
  - uses `OpenTUI` for the interactive TTY surface
  - reads the active Omarchy theme from `~/.config/omarchy/current/theme/colors.toml`
  - uses mock provider data
  - mirrors CodexBar's popup hierarchy in a denser TUI layout
  - falls back to a plain text snapshot when run without a TTY
- `omarchy-native-look-and-feel.test.ts`
  - covers the pure theme/state formatting helpers
- `open-omarchy-look.sh`
  - launches the prototype in the default Omarchy terminal style

## Run

In the current terminal:

```bash
bun run spike:omarchy-look
```

Open it in a floating Omarchy-style terminal window:

```bash
bun run spike:omarchy-look:open
```

## Keys

- `1`, `2`, `3`: select provider
- `Left`, `Right`: move between providers
- `h`, `l`: move left/right in vim-style
- `r`: mock refresh
- `e`: toggle provider enabled state
- `q`: quit

## Notes

- This spike does not implement the tray icon yet.
- The tray shell should stay separate from this TUI surface.
- If the theme file is missing, the spike fails fast with an explicit error instead of guessing a fallback theme.
- The current TUI favors the fuller CodexBar-style wording rather than an `80x24` compact mode. Small terminals may need a larger panel size to show every section cleanly.
