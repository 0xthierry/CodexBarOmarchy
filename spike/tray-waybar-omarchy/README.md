# Omarchy Tray / Waybar Spike

Date: 2026-03-12

## Goal

Verify the safest integration pattern for an Omarchy-native tray entry that opens or focuses this project's TUI across different Omarchy installs.

This spike is intentionally limited to:

- Waybar tray behavior on Omarchy
- Hyprland focus-or-launch behavior for a single TUI window
- icon identity constraints for an open-source distribution

This spike is not production code.

## Verified local Omarchy behavior

### Waybar

Default Omarchy Waybar includes a tray group on the right side:

- `~/.local/share/omarchy/config/waybar/config.jsonc`
- `modules-right` includes `group/tray-expander`
- `group/tray-expander` expands a real `tray` module

Important operational note from Omarchy's own skill docs:

- Waybar does not auto-reload after config changes
- Omarchy expects an explicit `omarchy-restart-waybar`

### TUI launch and focus conventions

Omarchy already has a standard pattern for "open one terminal TUI or focus the existing one":

- `omarchy-launch-or-focus`
  - inspects `hyprctl clients -j`
  - matches windows by class or title
  - focuses with `hyprctl dispatch focuswindow address:...`
  - otherwise launches the app
- `omarchy-launch-or-focus-tui`
  - wraps a TUI command with an Omarchy app id
- `omarchy-launch-tui`
  - launches through `uwsm-app -- xdg-terminal-exec --app-id=...`

Implication:

- we should not invent a second launcher model
- the tray entry should reuse the same focus-or-launch behavior
- the TUI remains the primary UI surface

## Recommended product contract

The correct Omarchy-native contract is:

- one tray/status-notifier entry
- activating the tray item opens or focuses the existing TUI window
- no separate popup UI
- tray stays a launcher seam, TUI stays the main surface

## Best implementation direction

Primary path:

1. expose a Linux StatusNotifier/AppIndicator tray item
2. on activation, run a launch-or-focus helper for a stable TUI app id
3. render the actual application UX in the existing TUI

Current spike artifacts in this folder:

- `launch-or-focus-agent-stats.sh`
  - proven locally to launch one TUI window with app id `org.omarchy.agent-stats`
  - proven locally to focus that same window on repeated invocation instead of spawning duplicates
- `tray-indicator.py`
  - minimal Ayatana AppIndicator proof of concept using the system GTK/AppIndicator stack
  - offers an `Open agent-stats` menu item wired to the launcher helper
- `direct-status-notifier.py`
  - direct `org.kde.StatusNotifierItem` proof of concept over D-Bus
  - intended to test whether Waybar activation can map directly to TUI launch/focus without the AppIndicator menu abstraction
- `agent-stats-tray.svg`
  - minimal monochrome symbolic icon for tray testing

## Results from the current spike

### Launch/focus helper

Verified locally:

- launching via `launch-or-focus-agent-stats.sh` creates a single terminal window with class/app id `org.omarchy.agent-stats`
- repeated invocation focuses the existing window instead of spawning duplicates

### Ayatana AppIndicator path

Verified locally:

- registers a tray item with Waybar's `org.kde.StatusNotifierWatcher`
- appears as an AppIndicator-style notification item on the bus

Limitation:

- this path exports a menu-oriented interface and does not expose `Activate`
- it is therefore not the best fit for "left click should open or focus the TUI"

### Direct StatusNotifierItem path

Verified locally:

- registers a real `StatusNotifierItem` directly with Waybar's watcher
- exports `Activate`, `SecondaryActivate`, `ContextMenu`, and `Scroll`
- calling `Activate` over D-Bus triggers the launch-or-focus helper
- after activation, the active Hyprland window becomes `org.omarchy.agent-stats`

Current conclusion:

- the direct `StatusNotifierItem` approach is the strongest technical direction for Omarchy
- the AppIndicator path is still useful as a compatibility reference, but not the preferred design for this app

Fallback path:

- document an optional Waybar `custom/...` module snippet for users who removed the tray from their Waybar config

## Open questions

These are still unresolved and need a technical spike before production implementation:

1. Which StatusNotifier/AppIndicator library is the best fit for this repository's runtime and packaging constraints?
2. Do we want the tray item to offer only activate/quit, or also quick actions like refresh?
3. What is the final installed TUI entry command outside the repo checkout?
4. What app id/class should be considered stable for focus matching?

## Safe assumptions for the next slice

- default Omarchy installs include a tray module
- customized Omarchy installs may remove or replace that tray, so we should not require Waybar config edits for the main path
- `xdg-terminal-exec` is the correct terminal launch abstraction for Omarchy
- Hyprland focus matching should use class/app-id first, title second

## Local references

- `~/.local/share/omarchy/config/waybar/config.jsonc`
- `~/.local/share/omarchy/bin/omarchy-launch-or-focus`
- `~/.local/share/omarchy/bin/omarchy-launch-or-focus-tui`
- `~/.local/share/omarchy/bin/omarchy-launch-tui`
- `~/.local/share/omarchy/default/omarchy-skill/SKILL.md`

## Public references

- Hyprland dispatchers: <https://wiki.hypr.land/Configuring/Dispatchers/>
- Waybar tray module: <https://man.archlinux.org/man/extra/waybar/waybar-tray.5.en>
