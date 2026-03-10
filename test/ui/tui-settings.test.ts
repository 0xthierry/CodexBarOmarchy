import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { getSettingsItems } from "@/ui/tui/descriptors.ts";
import { createTuiController } from "@/ui/tui/controller.ts";
import type { ProviderId, ProviderView, TuiKeyInput } from "@/ui/tui/types.ts";
import { createFakeConfigStore, createTestBinaryLocator } from "../core/store/test-support.ts";

const createInitializedController = async (config = createDefaultConfig()) => {
  const configStore = createFakeConfigStore(config);
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore,
  });

  await appStore.initialize();

  return {
    appStore,
    configStore,
    controller: createTuiController({ appStore }),
  };
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const getSelectedProviderView = (
  controller: ReturnType<typeof createTuiController>,
): ProviderView => {
  const focusedProviderId =
    controller.getSnapshot().localState.focusedProviderId ??
    controller.getSnapshot().state.selectedProviderId;
  const selectedProvider = controller
    .getSnapshot()
    .state.providerViews.find((providerView) => providerView.id === focusedProviderId);

  if (selectedProvider === undefined) {
    throw new Error("Expected a selected provider view.");
  }

  return selectedProvider;
};

const findSettingsIndex = (
  controller: ReturnType<typeof createTuiController>,
  itemId: string,
): number => {
  const selectedProvider = getSelectedProviderView(controller);
  const index = getSettingsItems(selectedProvider).findIndex((item) => item.id === itemId);

  if (index === -1) {
    throw new Error(`Could not find settings item ${itemId}.`);
  }

  return index;
};

const selectProvider = async (
  controller: ReturnType<typeof createTuiController>,
  providerId: ProviderId,
): Promise<void> => {
  await controller.selectProvider(providerId);
  controller.openSettings();
};

const pressKey = (
  controller: ReturnType<typeof createTuiController>,
  key: Partial<TuiKeyInput> & Pick<TuiKeyInput, "name" | "sequence">,
): void => {
  controller.handleKeyPress({
    ctrl: false,
    meta: false,
    shift: false,
    ...key,
  });
};

const typeText = (controller: ReturnType<typeof createTuiController>, value: string): void => {
  for (const character of value) {
    pressKey(controller, {
      name: character,
      sequence: character,
    });
  }
};

test("persists Codex in-scope settings through the app store", async () => {
  const { appStore, configStore, controller } = await createInitializedController();

  controller.openSettings();
  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "codex:web-extras"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.codex.extrasEnabled).toBe(true);

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "codex:source"));
  controller.focusModalChoices();
  controller.setSelectedChoiceIndex(2);
  await controller.applySelectedChoice();

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "codex:cookie-source"));
  controller.focusModalChoices();
  controller.setSelectedChoiceIndex(0);
  await controller.applySelectedChoice();

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "codex:historical-tracking"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.codex.source).toBe("cli");
  expect(appStore.getState().config.providers.codex.cookieSource).toBe("auto");
  expect(appStore.getState().config.providers.codex.historicalTrackingEnabled).toBe(false);
  expect(configStore.savedConfigs.at(-1)?.providers.codex.extrasEnabled).toBe(true);
});

test("adds, selects, and removes Claude token accounts from keyboard input", async () => {
  const { appStore, configStore, controller } = await createInitializedController();

  await selectProvider(controller, "claude");
  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "claude:add-token-account"));
  await controller.activateSelectedSettingsItem();

  typeText(controller, "primary");
  pressKey(controller, { name: "tab", sequence: "\t" });
  typeText(controller, "secret-1");
  pressKey(controller, { name: "enter", sequence: "\r" });
  await flush();

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "claude:add-token-account"));
  await controller.activateSelectedSettingsItem();
  typeText(controller, "backup");
  pressKey(controller, { name: "tab", sequence: "\t" });
  typeText(controller, "secret-2");
  pressKey(controller, { name: "enter", sequence: "\r" });
  await flush();

  expect(appStore.getState().config.providers.claude.tokenAccounts).toEqual([
    {
      label: "primary",
      token: "secret-1",
    },
    {
      label: "backup",
      token: "secret-2",
    },
  ]);
  expect(appStore.getState().config.providers.claude.activeTokenAccountIndex).toBe(1);

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "claude:active-token-account"));
  controller.focusModalChoices();
  controller.setSelectedChoiceIndex(0);
  await controller.applySelectedChoice();

  expect(appStore.getState().config.providers.claude.activeTokenAccountIndex).toBe(0);

  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "claude:remove-token-account"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.claude.tokenAccounts).toEqual([
    {
      label: "backup",
      token: "secret-2",
    },
  ]);
  expect(configStore.savedConfigs.at(-1)?.providers.claude.tokenAccounts).toEqual([
    {
      label: "backup",
      token: "secret-2",
    },
  ]);
});

test("persists Gemini enablement changes from the settings modal", async () => {
  const { appStore, configStore, controller } = await createInitializedController();

  await selectProvider(controller, "gemini");
  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "shared:enabled"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.gemini.enabled).toBe(false);
  expect(configStore.savedConfigs.at(-1)?.providers.gemini.enabled).toBe(false);
  expect(appStore.getState().selectedProviderId).toBe("codex");
});

test("keeps a disabled provider reachable so it can be re-enabled", async () => {
  const { appStore, controller } = await createInitializedController();

  await selectProvider(controller, "gemini");
  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "shared:enabled"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.gemini.enabled).toBe(false);
  expect(controller.getSnapshot().localState.focusedProviderId).toBe("gemini");

  await controller.selectProvider("gemini");
  controller.openSettings();
  controller.setSelectedSettingsIndex(findSettingsIndex(controller, "shared:enabled"));
  await controller.activateSelectedSettingsItem();

  expect(appStore.getState().config.providers.gemini.enabled).toBe(true);
  expect(appStore.getState().selectedProviderId).toBe("gemini");
});
