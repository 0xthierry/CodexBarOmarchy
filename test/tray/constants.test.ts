import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import {
  buildTrayIdentity,
  createTrayAssetDirectoryCandidates,
  normalizeTrayIdentitySuffix,
  resolveTrayIconThemePath,
  trayIconName,
  trayIdentitySuffixEnvVar,
} from "../../src/tray/constants.ts";

test("normalizeTrayIdentitySuffix trims and lowercases the configured suffix", () => {
  expect(normalizeTrayIdentitySuffix(" Dev ")).toBe("dev");
  expect(normalizeTrayIdentitySuffix("")).toBeNull();
  expect(normalizeTrayIdentitySuffix()).toBeNull();
});

test("buildTrayIdentity returns the production identifiers by default", () => {
  expect(buildTrayIdentity(null)).toEqual({
    trayBusName: "org.omarchy.AgentStatsTray",
    trayTuiAppId: "org.omarchy.agent-stats",
  });
});

test("buildTrayIdentity appends the suffix for side-by-side development identities", () => {
  expect(buildTrayIdentity("dev")).toEqual({
    trayBusName: "org.omarchy.AgentStatsTray.dev",
    trayTuiAppId: "org.omarchy.agent-stats.dev",
  });
});

test("the identity suffix environment variable name is stable", () => {
  expect(trayIdentitySuffixEnvVar).toBe("OMARCHY_AGENT_BAR_ID_SUFFIX");
});

test("the tray icon theme path resolves to a directory containing the tray svg", () => {
  const themePath = resolveTrayIconThemePath();

  expect(existsSync(join(themePath, `${trayIconName}.svg`))).toBe(true);
});

test("tray asset directory candidates include the source asset directory", () => {
  const candidates = createTrayAssetDirectoryCandidates();

  expect(candidates.some((candidate) => existsSync(join(candidate, `${trayIconName}.svg`)))).toBe(
    true,
  );
});
