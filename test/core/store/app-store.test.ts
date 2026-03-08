import { createFakeConfigStore, createTestBinaryLocator, defaultDelayMs } from "./test-support.ts";
import { expect, test } from "bun:test";
import { createAppStore } from "@/core/store/app-store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";

const firstSavedConfigIndex = 0;
const lastSavedConfigIndex = -1;
const slowSaveDelayMs = 20;

const expectProviderActions = (
  actions: {
    login: { actionName: "login"; supported: boolean };
    refresh: { actionName: "refresh"; supported: boolean };
    repair: { actionName: "repair"; supported: boolean };
  },
  supportsRecovery: boolean,
): void => {
  expect(actions).toEqual({
    login: {
      actionName: "login",
      supported: true,
    },
    refresh: {
      actionName: "refresh",
      supported: true,
    },
    repair: {
      actionName: "repair",
      supported: supportsRecovery,
    },
  });
};

const createInitializedAppStore = async (): Promise<ReturnType<typeof createAppStore>> => {
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

test("initializes with the persisted config and exposes provider views", async () => {
  const initialConfig = createDefaultConfig();
  const configStore = createFakeConfigStore({
    ...initialConfig,
    providers: {
      ...initialConfig.providers,
      claude: {
        ...initialConfig.providers.claude,
        enabled: false,
      },
    },
  });
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: false,
      gemini: false,
    }),
    configStore,
  });
  const state = await appStore.initialize();
  const codexView = appStore.getProviderView("codex");

  expect(state.config.providers.claude.enabled).toBe(false);
  expect(state.enabledProviderIds).toEqual(["codex", "gemini"]);
  expect(codexView.id).toBe("codex");
  expect(codexView.settings.availableUsageSources).toEqual(["auto", "oauth", "cli"]);
});

test("exposes the codex provider screen settings and shared actions", async () => {
  const appStore = await createInitializedAppStore();
  const resolvedCodexView = appStore.getProviderView("codex");

  if (resolvedCodexView.id !== "codex") {
    throw new TypeError("Expected the Codex provider view.");
  }

  expectProviderActions(resolvedCodexView.actions, false);
  expect(resolvedCodexView.settings.availableCookieSources).toEqual(["auto", "manual", "off"]);
  expect(resolvedCodexView.settings.availableUsageSources).toEqual(["auto", "oauth", "cli"]);
});

test("exposes the claude provider screen settings and recovery action", async () => {
  const appStore = await createInitializedAppStore();
  const resolvedClaudeView = appStore.getProviderView("claude");

  if (resolvedClaudeView.id !== "claude") {
    throw new TypeError("Expected the Claude provider view.");
  }

  expectProviderActions(resolvedClaudeView.actions, true);
  expect(resolvedClaudeView.settings.availableCookieSources).toEqual(["auto", "manual"]);
  expect(resolvedClaudeView.settings.availablePromptPolicies).toEqual([
    "never_prompt",
    "only_on_user_action",
    "always_allow_prompts",
  ]);
  expect(resolvedClaudeView.settings.availableUsageSources).toEqual([
    "auto",
    "oauth",
    "web",
    "cli",
  ]);
});

test("exposes the gemini provider screen shared actions without provider-specific settings", async () => {
  const appStore = await createInitializedAppStore();
  const resolvedGeminiView = appStore.getProviderView("gemini");

  if (resolvedGeminiView.id !== "gemini") {
    throw new TypeError("Expected the Gemini provider view.");
  }

  expectProviderActions(resolvedGeminiView.actions, false);
  expect(resolvedGeminiView.settings).toEqual({});
});

test("updates runtime state immediately and persists provider enablement changes", async () => {
  const configStore = createFakeConfigStore(createDefaultConfig());
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore,
  });

  await appStore.initialize();

  const pendingUpdate = appStore.setProviderEnabled("claude", false);

  expect(appStore.getState().config.providers.claude.enabled).toBe(false);
  expect(appStore.getState().selectedProviderId).toBe("codex");
  await pendingUpdate;
  expect(configStore.savedConfigs[firstSavedConfigIndex]?.providers.claude.enabled).toBe(false);
});

test("serializes overlapping mutations so later saves cannot roll state back", async () => {
  const configStore = createFakeConfigStore(createDefaultConfig(), {
    saveDelaysMs: [slowSaveDelayMs, defaultDelayMs],
  });
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore,
  });

  await appStore.initialize();

  const firstUpdate = appStore.setCodexConfig((providerConfig) => ({
    ...providerConfig,
    extrasEnabled: true,
  }));
  const secondUpdate = appStore.setClaudeConfig((providerConfig) => ({
    ...providerConfig,
    cookieSource: "manual",
  }));

  await Promise.all([firstUpdate, secondUpdate]);

  expect(appStore.getState().config.providers.codex.extrasEnabled).toBe(true);
  expect(appStore.getState().config.providers.claude.cookieSource).toBe("manual");
  expect(configStore.savedConfigs.at(lastSavedConfigIndex)?.providers.codex.extrasEnabled).toBe(
    true,
  );
  expect(configStore.savedConfigs.at(lastSavedConfigIndex)?.providers.claude.cookieSource).toBe(
    "manual",
  );
});

test("keeps the repaired selection when reordering still leaves it enabled", async () => {
  const configStore = createFakeConfigStore({
    ...createDefaultConfig(),
    selectedProvider: "claude",
  });
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore,
  });

  await appStore.initialize();
  await appStore.setProviderEnabled("claude", false);
  await appStore.setProviderOrder(["gemini", "codex", "claude"]);

  expect(appStore.getState().selectedProviderId).toBe("codex");
  expect(appStore.getState().enabledProviderIds).toEqual(["gemini", "codex"]);
});

test("persists provider-specific configuration updates", async () => {
  const configStore = createFakeConfigStore(createDefaultConfig());
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore,
  });

  await appStore.initialize();
  await appStore.setCodexConfig((providerConfig) => ({
    ...providerConfig,
    cookieSource: "manual",
    extrasEnabled: true,
  }));
  await appStore.setClaudeConfig((providerConfig) => ({
    ...providerConfig,
    cookieSource: "manual",
    tokenAccounts: [
      {
        label: "primary",
        token: "secret",
      },
    ],
  }));

  expect(appStore.getState().config.providers.codex.cookieSource).toBe("manual");
  expect(appStore.getState().config.providers.codex.extrasEnabled).toBe(true);
  expect(appStore.getState().config.providers.claude.tokenAccounts).toEqual([
    {
      label: "primary",
      token: "secret",
    },
  ]);
});
