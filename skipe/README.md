# Scipe Experiments

This directory contains experimental code for the current Linux provider-data spikes.

It is intentionally separate from `src/`.

## Current focus

- Linux browser cookie-store discovery
- OpenAI cookie-header validation and Codex endpoint inspection
- Claude `sessionKey` extraction and Claude web API validation

## Rules

- keep experiments isolated here until the implementation path is clear
- prefer scripts that can be run locally with Bun
- avoid printing secret cookie values in command output

## Current scripts

- `codex-openai-linux-spike.ts`
  - list likely Linux browser cookie stores
  - validate a cookie header against OpenAI session endpoints
  - probe the Codex usage page HTML for account/auth signals
- `claude-linux-spike.ts`
  - extract Claude `sessionKey` from Firefox and Chromium-family browsers
  - validate Claude account, organizations, usage, and overage-spend endpoints
