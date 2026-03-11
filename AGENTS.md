# Repository Instructions

- Use the project-local `tui-testing` skill at `.codex/skills/tui-testing` when testing the UI, especially terminal or TUI flows that need PTY validation in addition to non-TTY checks.
- Use `bun run stats` to fetch the current provider stats without opening the TUI; it prints a JSON snapshot of the current provider state and excludes secret token values from Claude token accounts.
- Always use semantic commit messages when creating commits.
