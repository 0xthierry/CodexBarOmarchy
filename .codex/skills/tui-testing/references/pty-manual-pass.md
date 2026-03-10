# PTY Manual Pass

## Checklist

1. Find the entrypoint and confirm whether the app branches on `isTTY`.
2. Find the keybindings in the real controller or input handler.
3. Identify any persisted config or session files that a manual pass could mutate.
4. Back up those files before starting the PTY run.
5. Run the non-TTY command once for fallback output.
6. Run the real command in a PTY and poll for the first stable frame.
7. Exercise a minimal but representative flow set.
8. Inspect external state when the UI claims to have saved something.
9. Restore backups and verify cleanup.

## PTY Pattern

Use this sequence with Codex tools:

1. Start the app with `functions.exec_command` and `tty: true`.
2. Poll with `functions.write_stdin` and empty `chars` until you see the first meaningful frame.
3. Send one logical step at a time.
4. Poll again after each step when the UI updates asynchronously or persists state.
5. Exit cleanly through the app if possible. Use `Ctrl+C` only as a fallback.

Example command shape:

```text
TERM=xterm-256color bun run tui
```

## Input Strategy

Prefer staged input over one large burst.

- Good: open modal, poll, send arrows, poll, send `Tab`, poll, send text, poll, send `Enter`.
- Risky: send a full multi-step interaction in one write and assume every intermediate state was processed.

Use staged input especially for:

- Editor-like flows with focus changes
- Modals that switch between items and choices
- Flows that trigger async persistence or refresh

## Persistence Safety

Back up any real file before testing a write flow. Restore it after the pass.

If the UI writes JSON config:

1. Copy the file to a temporary backup next to the original.
2. Run the manual flow.
3. Inspect the JSON after each important step.
4. Restore the backup when finished.

Treat this as mandatory unless the user explicitly asks to keep the manual changes.

## What to Prove

Prove the smallest set of behaviors that justifies a manual pass:

- Initial render under a real TTY
- Keyboard routing on the main screen
- Modal open and close behavior
- One real edit flow that persists externally
- Refresh or async in-flight behavior
- Clean quit

## Repository Example: CodexBarOmarchy

This repository exposed several useful patterns:

- `src/ui/tui/main.ts` uses a non-TTY snapshot path and a separate interactive renderer path when both stdio streams are TTYs.
- `src/ui/tui/controller.ts` defines the real keys:
  - `,` open settings
  - `Tab` switch modal focus or editor field
  - `Enter` apply
  - `Esc` close or cancel
  - `h` and `l` or left and right move between providers
  - `r` refresh
  - `q` quit
- The persisted config file lives at `~/.config/omarchy-agent-bar/config.json`.

The manual pass that worked reliably was:

1. Run `bun run tui` without a PTY to confirm fallback output exists.
2. Back up `~/.config/omarchy-agent-bar/config.json`.
3. Run `TERM=xterm-256color bun run tui` in a PTY.
4. Poll until the first rendered frame appears.
5. Open settings with `,`.
6. Drive Claude token-account add, select, and remove in small steps, checking the JSON file between steps.
7. Close the modal with `Esc`.
8. Switch providers on the main screen with `l`.
9. Refresh with `r`.
10. Quit with `q`.
11. Restore the config backup.
