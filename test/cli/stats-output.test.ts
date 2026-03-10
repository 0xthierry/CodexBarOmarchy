import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { createStatsSnapshot } from "@/cli/stats-output.ts";

test("creates a safe JSON-friendly stats snapshot without token secrets", () => {
  const config = createDefaultConfig();
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();
  const currentTime = new Date("2026-03-10T15:45:12.000Z");

  config.selectedProvider = "claude";
  config.providers.claude.tokenAccounts = [
    {
      label: "primary",
      token: "secret-1",
    },
    {
      label: "backup",
      token: "secret-2",
    },
  ];
  config.providers.claude.activeTokenAccountIndex = 1;
  runtimeStateMap.claude.snapshot = {
    accountEmail: "claude@example.com",
    latestError: null,
    metrics: [
      {
        detail: null,
        label: "Session",
        value: "72%",
      },
    ],
    planLabel: "Max",
    sourceLabel: "Web",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    version: "1.0.0",
  };

  const snapshot = createStatsSnapshot(createAppStoreState(config, runtimeStateMap), currentTime);
  const claudeProvider = snapshot.providers.find((provider) => provider.id === "claude");

  expect(snapshot.generatedAt).toBe("2026-03-10T15:45:12.000Z");
  expect(snapshot.selectedProviderId).toBe("claude");
  expect(claudeProvider?.settings).toEqual({
    activeTokenAccountIndex: 1,
    tokenAccountLabels: ["primary", "backup"],
  });
  expect(JSON.stringify(snapshot)).not.toContain("secret-1");
  expect(JSON.stringify(snapshot)).not.toContain("secret-2");
});
