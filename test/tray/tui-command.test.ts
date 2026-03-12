import { expect, test } from "bun:test";
import {
  createRepoLocalTuiLaunchTarget,
  resolveRepoRootFromModuleUrl,
} from "../../src/tray/tui-command.ts";

const syntheticTrayModuleUrl = "file:///workspace/agent-stats/src/tray/tui-command.ts";

test("resolveRepoRootFromModuleUrl walks from src/tray to the repository root", () => {
  expect(resolveRepoRootFromModuleUrl(syntheticTrayModuleUrl)).toBe("/workspace/agent-stats");
});

test("createRepoLocalTuiLaunchTarget returns the repo-local bun tui command", () => {
  expect(createRepoLocalTuiLaunchTarget(syntheticTrayModuleUrl)).toEqual({
    args: ["run", "--cwd", "/workspace/agent-stats", "tui"],
    command: "bun",
  });
});
