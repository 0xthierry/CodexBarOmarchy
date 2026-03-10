---
name: tui-testing
description: Validate terminal user interfaces that render differently in TTY and non-TTY environments. Use when Codex needs to test or debug terminal apps, OpenTUI or other keyboard-driven TUIs, PTY-only renderer paths, snapshot fallbacks, modal focus behavior, refresh and quit flows, or persisted settings changed through an interactive terminal UI.
---

# Tui Testing

## Overview

Validate terminal UIs by separating two questions:

- Does the non-TTY path produce the expected snapshot or fallback output?
- Does the real TTY path behave correctly under keyboard input?

Prove interactive behavior with a PTY session, not with a plain command run. Inspect persisted state only when the UI mutates config, cache, or other external state.

## Workflow

1. Identify the entrypoint and branch conditions.
   - Read the main executable and locate any `process.stdin.isTTY`, `process.stdout.isTTY`, renderer setup, alternate-screen, or snapshot fallback branches.
   - Read the key handler or controller before driving the app so the manual pass uses production shortcuts.
2. Run the non-TTY path first.
   - Execute the normal command without a PTY.
   - Use this only to validate deterministic fallback output. Do not infer focus, modal behavior, or keyboard routing from it.
3. Run the interactive path in a PTY.
   - Launch the real command with a PTY attached.
   - Set `TERM=xterm-256color` unless the repo clearly requires another terminal type.
   - Poll once or twice after launch before sending keys so the initial frame settles.
4. Drive the highest-value flows.
   - Cover open and close modal, provider or tab navigation, one persisted edit flow, refresh, and quit.
   - Prefer exact production keys over test helper abstractions.
5. Verify external state when needed.
   - If the UI writes config or saved sessions, inspect the backing file or store between steps.
   - Treat on-screen text as necessary but not sufficient for persistence claims.
6. Restore user state.
   - Back up real config before mutation.
   - Restore the backup after the pass unless the user explicitly wants the manual changes kept.
7. Report with boundaries.
   - State what the PTY pass proved, what automation proved separately, and what remains unverified.

## Tool Use

- Start the PTY session with `functions.exec_command` and `tty: true`.
- Use `functions.write_stdin` with empty `chars` to poll rendered output.
- Send keys in small steps when a flow is stateful or asynchronous.
- Use regular `functions.exec_command` calls outside the PTY to inspect config files or other persisted state.

## Safety Rules

- Back up any real config file before mutating it through the UI.
- Prefer reversible test data and remove it afterward.
- Do not claim success from partial ANSI output without a confirming poll or external state check.
- Do not use a non-TTY run to validate focus, key handling, modal suppression, or refresh animation.

## Choose the Lowest Credible Check

- Use a non-TTY run for snapshot or fallback rendering.
- Use a PTY run for keyboard routing, focus changes, alternate-screen rendering, modal behavior, and quit handling.
- Use direct file or store inspection for persistence claims.
- Lean on existing automated tests for broader coverage once the manual PTY pass establishes the interactive happy path.

## Load References Only When Needed

- Read [references/pty-manual-pass.md](references/pty-manual-pass.md) when planning or executing a live terminal validation pass.
- Read [references/failure-patterns.md](references/failure-patterns.md) when the TUI appears to ignore input, render stale data, or differ between PTY and non-TTY modes.

## Expected Output

When using this skill, always state:

- The exact non-TTY command used.
- The exact PTY command used.
- The flows exercised manually.
- Any persisted state inspected and how it was restored.
- What remains unverified.
