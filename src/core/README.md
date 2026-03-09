# Core Entry Points

This repository intentionally does not use barrel exports for the core layer.
Headless consumers should import the concrete modules they need:

- `@/core/store/app-store.ts`
  - owns in-memory app state
  - initializes config with first-run provider detection
  - persists every successful config mutation
  - dispatches provider actions through injected adapters
- `@/core/config/store.ts`
  - reads and writes `~/.config/omarchy-agent-bar/config.json`
  - normalizes config and applies `0600` permissions
- `@/core/actions/provider-adapter.ts`
  - defines `refresh`, `login`, and recovery-style action seams
  - lets a host inject real provider implementations without changing store shape
- `@/core/detection/provider-detection.ts`
  - applies first-run CLI detection for `codex`, `claude`, and `gemini`

## Expected Consumer Flow

A headless runtime should:

1. create a config store
2. create provider adapters for the real `codex`, `claude`, and `gemini` integrations
3. create the app store with those dependencies
4. call `initialize()` once during startup
5. call store mutations and provider actions directly as needed

## Current Scope Boundary

This core is headless on purpose.
It does not provide a graphical shell and should stay reusable by non-UI hosts.
