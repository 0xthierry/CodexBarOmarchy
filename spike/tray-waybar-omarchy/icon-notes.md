# Icon Notes

Date: 2026-03-12

## Goal

Find an icon direction that feels native to Omarchy's current visual language and is safe for an open-source repository.

## What Omarchy uses locally

### Waybar / system-bar icon language

Waybar uses:

- `JetBrainsMono Nerd Font` for most bar glyphs
- the dedicated `omarchy` font for the Omarchy menu icon

That matches the screenshot's visual style:

- simple monochrome glyphs
- low-detail shapes
- terminal/bar-friendly rendering

### Local asset candidates

First-party Omarchy assets found locally:

- `~/.local/share/omarchy/logo.svg`
- `~/.local/share/omarchy/icon.png`
- `~/.local/share/fonts/omarchy.ttf`

App-style icon references found locally:

- `~/.local/share/omarchy/applications/icons/ChatGPT.png`
- `~/.local/share/omarchy/applications/icons/Fizzy.png`
- other app icons under `~/.local/share/omarchy/applications/icons/`

## What seems usable

Safest visual references:

- Omarchy's own logo assets
- Omarchy's own font
- Nerd Font style conventions already used by Waybar

## What is uncertain

I verified that Omarchy itself is MIT-licensed locally, but I did not verify per-asset provenance for every application icon under `applications/icons/`.

So for open-source redistribution, I cannot confidently recommend copying arbitrary app icons from:

- `~/.local/share/omarchy/applications/icons/`

without checking their original source and license individually.

## Practical recommendation

Use one of these directions:

1. Create a new monochrome tray icon in the same visual language as Omarchy/Waybar:
   - sharp, simple, symbolic
   - readable at small tray sizes
   - white or symbolic monochrome rendering
2. Derive a new icon from first-party Omarchy logo geometry only if Omarchy branding alignment is acceptable
3. Keep app-launcher artwork and tray artwork separate:
   - richer PNG for launcher/desktop entry
   - minimal symbolic icon for tray/status-notifier

## Best current candidate

For the spike, the best identity direction looks like:

- a custom monochrome symbolic icon
- visually aligned with Omarchy's bar glyphs
- not copied from a third-party provider brand
- not dependent on one provider, since this app spans Codex, Claude, and Gemini

That is safer than reusing the local `ChatGPT.png` directly.

## Current spike choice

The spike now uses Tabler's `bot-id` icon as the tray SVG source:

- icon page: `https://tabler.io/icons/icon/bot-id`
- icon set/license page: `https://tabler.io/icons`

Why this one:

- explicit robot/agent metaphor
- outline style fits Omarchy's small monochrome bar language better than most filled icons
- MIT license is straightforward for an open-source repository
