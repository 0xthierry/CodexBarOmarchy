import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import {
  createRepoLocalTuiLaunchTarget,
  resolveRepoRootFromModuleUrl,
} from "../../src/tray/tui-command.ts";

const syntheticRepoRoot = resolve("test-fixtures", "agent-stats");
const syntheticTrayModuleUrl = pathToFileURL(
  resolve(syntheticRepoRoot, "src", "tray", "tui-command.ts"),
).href;

test("resolveRepoRootFromModuleUrl walks from src/tray to the repository root", () => {
  expect(resolveRepoRootFromModuleUrl(syntheticTrayModuleUrl)).toBe(syntheticRepoRoot);
});

test("createRepoLocalTuiLaunchTarget returns the repo-local bun tui command", () => {
  expect(createRepoLocalTuiLaunchTarget(syntheticTrayModuleUrl)).toEqual({
    args: ["run", "--cwd", syntheticRepoRoot, "tui"],
    command: "bun",
  });
});
