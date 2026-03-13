import { expect, test } from "bun:test";
import {
  isAppCommandName,
  parseAppCommandName,
  resolveAppCommandArgs,
} from "../../src/cli/app-command.ts";

test("resolveAppCommandArgs skips the source entrypoint when running through bun", () => {
  expect(resolveAppCommandArgs(["bun", "src/main.ts", "tray"])).toEqual(["tray"]);
});

test("resolveAppCommandArgs reads arguments directly for compiled binaries", () => {
  expect(resolveAppCommandArgs(["./dist/omarchy-agent-bar", "stats"])).toEqual(["stats"]);
});

test("resolveAppCommandArgs skips Bun's bundled entry module path in compiled binaries", () => {
  expect(
    resolveAppCommandArgs(["./dist/omarchy-agent-bar", "/$bunfs/root/omarchy-agent-bar", "stats"]),
  ).toEqual(["stats"]);
});

test("parseAppCommandName returns null for unknown commands", () => {
  expect(parseAppCommandName(["./dist/omarchy-agent-bar", "nope"])).toBeNull();
});

test("parseAppCommandName parses valid app commands", () => {
  expect(parseAppCommandName(["bun", "src/main.ts", "tui"])).toBe("tui");
  expect(parseAppCommandName(["./dist/omarchy-agent-bar", "tray"])).toBe("tray");
});

test("isAppCommandName only accepts declared commands", () => {
  expect(isAppCommandName("stats")).toBe(true);
  expect(isAppCommandName("other")).toBe(false);
});
