# Omarchy Native Look Spike

## Goal

Prototype the Omarchy-native direction agreed for this project:

- tray click should open or focus a floating terminal panel
- the panel should feel like an Omarchy tool, not like a generic web popup
- the UI should follow the active Omarchy theme automatically
- the spike should use e2e-derived provider data, but keep a presentation layer tuned for terminal UX

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
- it exposes the small set of renderables we actually need for this panel shape:
  - boxes
  - text
  - tab selects
  - scroll containers

Official sources:

- <https://opentui.com/>
- <https://opentui.com/docs/getting-started/>
- <https://github.com/anomalyco/opentui>

Practical caveat:

- `OpenTUI` requires the native package/toolchain path to work, including Zig during package build on this machine

### OpenTUI features worth keeping

The full OpenTUI surface is larger than what this spike should use. After trying a more complex workbench, the useful subset is smaller:

- `Box` + `Text` stay as the main shell primitives. They fit the Omarchy-style boxed layout well.
  - <https://opentui.com/docs/components/box/>
  - <https://opentui.com/docs/components/text/>
- `TabSelect` makes sense for the provider switcher in the header. It improves discoverability without changing the information architecture.
  - <https://opentui.com/docs/components/tab-select/>
- `ScrollBox` makes sense inside the usage, details, config, and menu panes so the spike keeps one canonical layout instead of reintroducing compact-mode branches.
  - <https://opentui.com/docs/components/scrollbox/>
- A modal is possible even though OpenTUI does not expose a first-class `Modal` component in the docs. The spike builds the settings modal from a `Box` overlay with layout positioning, `zIndex`, and `visible` state.
  - <https://opentui.com/docs/components/box/>
  - <https://opentui.com/docs/core-concepts/layout/>
- `Select` makes sense inside the settings modal. It gives us a proper keyboardable list instead of a raw text dump, and it lets boolean options read like checkbox rows.
  - <https://opentui.com/docs/components/select/>
- OpenTUI layout is still doing the heavy lifting underneath the shell.
  - <https://opentui.com/docs/core-concepts/layout/>

Features intentionally not kept in the main spike:

- `Markdown`, `Code`, and `Diff` made the panel feel like a generic terminal workbench instead of an Omarchy-native status surface.
- React/Solid bindings are unnecessary for this spike.
- Animations are not a priority for a dense quota/account panel.

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
  - uses e2e-derived mock provider data
  - mirrors CodexBar's popup hierarchy in a denser TUI layout
  - keeps the main surface lean, but uses `Select` inside the settings modal where it materially improves UX
  - opens provider settings in a centered modal overlay with `,` and closes it with `Esc`
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

- `1`, `2`, `3`: select provider directly
- `Left`, `Right`: move between providers through the focused tab control
- `h`, `l`: move left/right in vim-style
- `,`: open the settings modal
- `Tab`: switch between settings items and allowed values when a setting is selectable
- `Enter`: toggle boolean options or apply the selected setting value
- `Space`: toggle the selected checkbox-style option
- `Esc`: close the settings modal
- `r`: mock refresh
- `e`: toggle provider enabled state
- `q`: quit

## Notes

- This spike does not implement the tray icon yet.
- The tray shell should stay separate from this TUI surface.
- If the theme file is missing, the spike fails fast with an explicit error instead of guessing a fallback theme.
- The current TUI favors the fuller CodexBar-style wording rather than an `80x24` compact mode. Small terminals may need a larger panel size to show every section cleanly.
