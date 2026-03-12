#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_ID="org.omarchy.agent-stats"
WINDOW_PATTERN="$APP_ID"
LAUNCH_COMMAND="setsid uwsm-app -- xdg-terminal-exec --app-id=$APP_ID -e bun run --cwd \"$PROJECT_ROOT\" tui"

if ! command -v hyprctl >/dev/null 2>&1; then
  echo "hyprctl is required for the Omarchy focus-or-launch spike." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for the Omarchy focus-or-launch spike." >&2
  exit 1
fi

WINDOW_ADDRESS="$(
  hyprctl clients -j \
    | jq -r --arg pattern "$WINDOW_PATTERN" '
        .[]
        | select(
            ((.class // "") | test("\\b" + $pattern + "\\b"; "i"))
            or ((.initialClass // "") | test("\\b" + $pattern + "\\b"; "i"))
            or ((.title // "") | test("\\b" + $pattern + "\\b"; "i"))
          )
        | .address
      ' \
    | head -n1
)"

if [[ -n "$WINDOW_ADDRESS" ]]; then
  exec hyprctl dispatch focuswindow "address:$WINDOW_ADDRESS"
fi

exec bash -lc "$LAUNCH_COMMAND"
