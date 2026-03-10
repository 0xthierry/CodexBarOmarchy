import { expect, test } from "bun:test";
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
