#!/bin/bash
set -euo pipefail

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to launch the Omarchy look spike." >&2
  exit 1
fi

if ! command -v uwsm-app >/dev/null 2>&1; then
  echo "uwsm-app is required to launch the Omarchy look spike." >&2
  exit 1
fi

if ! command -v xdg-terminal-exec >/dev/null 2>&1; then
  echo "xdg-terminal-exec is required to launch the Omarchy look spike." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"
exec setsid uwsm-app -- \
  xdg-terminal-exec \
  --app-id=org.omarchy.agent-bar \
  --title="Omarchy Agent Bar" \
  -e bun run spike:omarchy-look
