import { expect, test } from "bun:test";
import {
  createRepoLocalTuiLaunchTarget,
  resolveRepoRootFromModuleUrl,
} from "../../src/tray/tui-command.ts";

test("resolveRepoRootFromModuleUrl walks from src/tray to the repository root", () => {
  expect(
    resolveRepoRootFromModuleUrl(
      "file:///home/thierry/Work/Sideprojects/CodexBarOmarchy/src/tray/tui-command.ts",
    ),
  ).toBe("/home/thierry/Work/Sideprojects/CodexBarOmarchy");
});

test("createRepoLocalTuiLaunchTarget returns the repo-local bun tui command", () => {
  expect(
    createRepoLocalTuiLaunchTarget(
      "file:///home/thierry/Work/Sideprojects/CodexBarOmarchy/src/tray/tui-command.ts",
    ),
  ).toEqual({
    args: ["run", "--cwd", "/home/thierry/Work/Sideprojects/CodexBarOmarchy", "tui"],
    command: "bun",
  });
});
