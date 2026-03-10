import { expect, test } from "bun:test";
import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import { createRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { createTuiController } from "@/ui/tui/controller.ts";
import { createFakeConfigStore, createTestBinaryLocator } from "../core/store/test-support.ts";

const createInitializedAppStore = async () => {
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createDefaultConfig()),
  });

  await appStore.initialize();

  return appStore;
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test("starts from the selected provider in app store state", async () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "gemini" as const,
  };
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(config),
  });

  await appStore.initialize();

  const controller = createTuiController({ appStore });

  expect(controller.getSnapshot().state.selectedProviderId).toBe("gemini");
});

test("switches providers through keyboard shortcuts", async () => {
  const appStore = await createInitializedAppStore();
  const controller = createTuiController({ appStore });

  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    name: "2",
    sequence: "2",
    shift: false,
  });
  await Promise.resolve();

  expect(controller.getSnapshot().state.selectedProviderId).toBe("claude");
});

test("opens and closes the settings modal", async () => {
  const appStore = await createInitializedAppStore();
  const controller = createTuiController({ appStore });

  controller.openSettings();
  expect(controller.getSnapshot().localState.isSettingsOpen).toBe(true);

  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    name: "escape",
    sequence: "\u001B",
    shift: false,
  });
  expect(controller.getSnapshot().localState.isSettingsOpen).toBe(false);
});

test("refresh stays non-blocking while provider selection changes", async () => {
  let resolveRefresh!: () => void;
  const refreshReady = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createDefaultConfig()),
    providerAdapters: {
      claude: {
        login: async () =>
          createSuccessfulProviderActionResult("claude", "login", "Claude login started."),
        openTokenFile: async () =>
          createSuccessfulProviderActionResult("claude", "openTokenFile", "Opened."),
        refresh: async () =>
          createRefreshActionResult(
            createSuccessfulProviderActionResult("claude", "refresh", "Claude refreshed."),
          ),
        reloadTokenFile: async () =>
          createSuccessfulProviderActionResult("claude", "reloadTokenFile", "Reloaded."),
        repair: async () =>
          createSuccessfulProviderActionResult("claude", "repair", "Claude repaired."),
      },
      codex: {
        login: async () =>
          createSuccessfulProviderActionResult("codex", "login", "Codex login started."),
        refresh: async () => {
          await refreshReady;

          return createRefreshActionResult(
            createSuccessfulProviderActionResult("codex", "refresh", "Codex refreshed."),
          );
        },
      },
      gemini: {
        login: async () =>
          createSuccessfulProviderActionResult("gemini", "login", "Gemini login started."),
        refresh: async () =>
          createRefreshActionResult(
            createSuccessfulProviderActionResult("gemini", "refresh", "Gemini refreshed."),
          ),
      },
    },
  });

  await appStore.initialize();

  const controller = createTuiController({ appStore });

  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    name: "r",
    sequence: "r",
    shift: false,
  });
  expect(controller.getSnapshot().state.providerViews[0]?.actions.refresh.status).toBe("running");

  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    name: "2",
    sequence: "2",
    shift: false,
  });
  await flush();

  expect(controller.getSnapshot().state.selectedProviderId).toBe("claude");
  resolveRefresh();
  await flush();
  await flush();

  expect(appStore.getProviderView("codex").actions.refresh.status).toBe("success");
});

test("requests quit from the keyboard", async () => {
  const appStore = await createInitializedAppStore();
  const controller = createTuiController({ appStore });

  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    name: "q",
    sequence: "q",
    shift: false,
  });

  expect(controller.getSnapshot().localState.quitRequested).toBe(true);
});
