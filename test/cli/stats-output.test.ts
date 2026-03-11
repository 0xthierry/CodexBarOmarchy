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
    identity: {
      accountEmail: "claude@example.com",
      planLabel: "Max",
    },
    latestError: null,
    providerDetails: null,
    serviceStatus: {
      description: "Degraded performance",
      indicator: "minor",
      updatedAt: "2026-03-10T11:58:00.000Z",
    },
    sourceLabel: "Web",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: {
        currencyCode: "USD",
        limit: 50,
        periodLabel: "Monthly",
        resetsAt: null,
        updatedAt: "2026-03-10T12:00:00.000Z",
        used: 12.34,
      },
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Session",
          resetAt: null,
          usedPercent: 72,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: {
          detail: null,
          label: "Session",
          value: "72%",
        },
        sonnet: null,
        weekly: null,
      },
    },
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
  expect(claudeProvider?.identity).toEqual({
    accountEmail: "claude@example.com",
    planLabel: "Max",
  });
  expect(claudeProvider?.providerDetails).toBeNull();
  expect(claudeProvider?.serviceStatus).toEqual({
    description: "Degraded performance",
    indicator: "minor",
    updatedAt: "2026-03-10T11:58:00.000Z",
  });
  expect(claudeProvider?.usage.windows.session?.value).toBe("72%");
  expect(claudeProvider?.usage.providerCost).toEqual({
    currencyCode: "USD",
    limit: 50,
    periodLabel: "Monthly",
    resetsAt: null,
    updatedAt: "2026-03-10T12:00:00.000Z",
    used: 12.34,
  });
  expect(JSON.stringify(snapshot)).not.toContain("secret-1");
  expect(JSON.stringify(snapshot)).not.toContain("secret-2");
});
