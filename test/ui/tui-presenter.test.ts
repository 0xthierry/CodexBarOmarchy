import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { createInitialLocalState } from "@/ui/tui/controller.ts";
import { createTuiViewModel, formatHeaderClockDisplay } from "@/ui/tui/presenter.ts";

test("derives provider tabs in config order and focuses the selected provider", () => {
  const defaultConfig = createDefaultConfig();
  const providerOrder: (typeof defaultConfig.providerOrder)[number][] = [
    "gemini",
    "codex",
    "claude",
  ];
  const config = {
    ...defaultConfig,
    providerOrder,
    providers: {
      ...defaultConfig.providers,
      claude: {
        ...defaultConfig.providers.claude,
        enabled: false,
      },
    },
    selectedProvider: "gemini" as const,
  };
  const state = createAppStoreState(config, createDefaultProviderRuntimeStateMap());
  const viewModel = createTuiViewModel(state, createInitialLocalState());

  expect(viewModel.tabs.map((tab) => tab.id)).toEqual(["gemini", "codex", "claude"]);
  expect(viewModel.tabs.map((tab) => tab.label)).toEqual(["gemini", "codex", "claude off"]);
  expect(viewModel.tabs.find((tab) => tab.selected)?.id).toBe("gemini");
});

test("renders the required shell sections for the selected provider", () => {
  const config = createDefaultConfig();
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();
  const currentTime = new Date("2026-03-10T15:45:12.000Z");

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "OAuth",
    },
    latestError: null,
    serviceStatus: {
      description: "Partial outage on chat history",
      indicator: "major",
      updatedAt: "2026-03-10T11:59:00.000Z",
    },
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      displayMetrics: [
        {
          detail: null,
          label: "Session",
          value: "58%",
        },
      ],
      providerCost: {
        currencyCode: "USD",
        limit: 100,
        periodLabel: "Monthly",
        resetsAt: null,
        updatedAt: "2026-03-10T12:00:00.000Z",
        used: 25,
      },
      quotaBuckets: [
        {
          modelId: "gemini-2.5-pro",
          remainingFraction: 0.72,
          resetTime: "2026-03-10T18:00:00.000Z",
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: {
          detail: null,
          label: "Session",
          value: "58%",
        },
        sonnet: null,
        weekly: null,
      },
    },
    version: "1.2.3",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
    currentTime,
  );

  expect(viewModel.headerLines[0]).toContain("CODEX");
  expect(viewModel.headerLines[1]).toContain(formatHeaderClockDisplay(currentTime));
  expect(viewModel.usageLines.join("\n")).toContain("Session");
  expect(viewModel.usageLines.join("\n")).toContain("Extra usage 25%");
  expect(viewModel.usageLines.join("\n")).toContain("USD 25.00 / USD 100.00 Monthly");
  expect(viewModel.usageLines.join("\n")).toContain("Raw quotas 1 models");
  expect(viewModel.usageLines.join("\n")).toContain("gemini-2.5-pro 28%");
  expect(viewModel.usageLines.join("\n")).toContain("Provider health: Major issue");
  expect(viewModel.detailsLines.join("\n")).toContain("health");
  expect(viewModel.detailsLines.join("\n")).toContain("extra");
  expect(viewModel.detailsLines.join("\n")).toContain("quotas");
  expect(viewModel.detailsLines.join("\n")).toContain("1 raw buckets");
  expect(viewModel.detailsLines.join("\n")).toContain("account");
  expect(viewModel.detailsLines.join("\n")).toContain("updated");
  expect(viewModel.configLines.join("\n")).toContain("Usage");
  expect(viewModel.menuLines.join("\n")).toContain("settings");
});

test("shows the settings modal structure when the modal is open", () => {
  const localState = {
    ...createInitialLocalState(),
    isSettingsOpen: true,
  };
  const viewModel = createTuiViewModel(
    createAppStoreState(createDefaultConfig(), createDefaultProviderRuntimeStateMap()),
    localState,
  );

  expect(viewModel.modal?.title).toBe("settings • codex");
  expect(viewModel.modal?.settingsItems.length).toBeGreaterThan(0);
  expect(viewModel.modal?.detailLines.join("\n")).toContain("Current:");
});
