# Core Entry Points

This repository intentionally does not use barrel exports for the core layer.
Headless consumers should import the concrete modules they need:

- `@/runtime/app-runtime.ts`
  - assembles the default headless runtime from config store, binary detection, provider adapters, and scheduler startup
  - gives UI or non-UI hosts a single startup/shutdown seam
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

1. create `@/runtime/app-runtime.ts` for the default host wiring
2. call `start()` once during startup
3. use `appStore` for mutations, subscriptions, and provider actions
4. call `stop()` during shutdown to stop the refresh scheduler

If a host needs more control, it can still wire `config-store`, `provider-adapter`, and `app-store` directly.

## Current Scope Boundary

This core is headless on purpose.
It does not provide a graphical shell and should stay reusable by non-UI hosts.
