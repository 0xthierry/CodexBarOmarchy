import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "bun:test";
import {
  createDefaultTuiLaunchTarget,
  createInstalledTuiLaunchTarget,
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
    args: ["run", "--cwd", syntheticRepoRoot, "app", "tui"],
    command: "bun",
  });
});

test("createInstalledTuiLaunchTarget returns the installed binary tui subcommand", () => {
  expect(createInstalledTuiLaunchTarget("/tmp/omarchy-agent-bar")).toEqual({
    args: ["tui"],
    command: "/tmp/omarchy-agent-bar",
  });
});

test("createDefaultTuiLaunchTarget keeps using the repo-local bun path in source mode", () => {
  expect(
    createDefaultTuiLaunchTarget({
      argv: ["bun", "/workspace/src/tray/main.ts"],
      moduleUrl: syntheticTrayModuleUrl,
    }),
  ).toEqual({
    args: ["run", "--cwd", syntheticRepoRoot, "app", "tui"],
    command: "bun",
  });
});

test("createDefaultTuiLaunchTarget uses the installed binary outside source mode", () => {
  expect(
    createDefaultTuiLaunchTarget({
      argv: ["/tmp/omarchy-agent-bar", "tray"],
      executablePath: "/tmp/omarchy-agent-bar",
    }),
  ).toEqual({
    args: ["tui"],
    command: "/tmp/omarchy-agent-bar",
  });
});
