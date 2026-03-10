import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { createInitialLocalState } from "@/ui/tui/controller.ts";
import { createTuiViewModel } from "@/ui/tui/presenter.ts";

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

  runtimeStateMap.codex.snapshot = {
    accountEmail: "codex@example.com",
    latestError: null,
    metrics: [
      {
        detail: null,
        label: "Session",
        value: "58%",
      },
    ],
    planLabel: "OAuth",
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    version: "1.2.3",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.headerLines[0]).toContain("CODEX");
  expect(viewModel.usageLines.join("\n")).toContain("Session");
  expect(viewModel.detailsLines.join("\n")).toContain("account");
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
