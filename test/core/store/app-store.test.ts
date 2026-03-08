import { createFakeConfigStore, createTestBinaryLocator, defaultDelayMs } from "./test-support.ts";
import { expect, test } from "bun:test";
import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import { createRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import {
  defaultRefreshSchedulerIntervalMs,
  minimumRefreshSchedulerIntervalMs,
} from "@/core/store/scheduler.ts";

const firstSavedConfigIndex = 0;
const lastSavedConfigIndex = -1;
const slowSaveDelayMs = 20;
const updatedTimestamp = "2026-03-08T12:00:00.000Z";

const expectProviderActions = (
  actions: {
    login: { actionName: "login"; message: string | null; status: string; supported: boolean };
    openTokenFile: {
      actionName: "openTokenFile";
      message: string | null;
      status: string;
      supported: boolean;
    };
    refresh: { actionName: "refresh"; message: string | null; status: string; supported: boolean };
    reloadTokenFile: {
      actionName: "reloadTokenFile";
      message: string | null;
      status: string;
      supported: boolean;
    };
    repair: { actionName: "repair"; message: string | null; status: string; supported: boolean };
  },
  supportsClaudeTokenFileActions: boolean,
  supportsRecovery: boolean,
): void => {
  expect(actions).toEqual({
    login: {
      actionName: "login",
      message: null,
      status: "idle",
      supported: true,
    },
    openTokenFile: {
      actionName: "openTokenFile",
      message: null,
      status: "idle",
      supported: supportsClaudeTokenFileActions,
    },
    refresh: {
      actionName: "refresh",
      message: null,
      status: "idle",
      supported: true,
    },
    reloadTokenFile: {
      actionName: "reloadTokenFile",
      message: null,
      status: "idle",
      supported: supportsClaudeTokenFileActions,
    },
    repair: {
      actionName: "repair",
      message: null,
      status: "idle",
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

const createCodexRefreshSnapshot = () => ({
  accountEmail: "codex@example.com",
  latestError: null,
  metrics: [
    {
      detail: null,
      label: "Session",
      value: "58%",
    },
    {
      detail: null,
      label: "Weekly",
      value: "81%",
    },
  ],
  planLabel: "OAuth",
  sourceLabel: "oauth",
  state: "ready" as const,
  updatedAt: updatedTimestamp,
  version: "1.2.3",
});

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

  expectProviderActions(resolvedCodexView.actions, false, false);
  expect(resolvedCodexView.settings.availableCookieSources).toEqual(["auto", "manual", "off"]);
  expect(resolvedCodexView.settings.availableUsageSources).toEqual(["auto", "oauth", "cli"]);
  expect(resolvedCodexView.settings.showCookieSourceControl).toBe(false);
  expect(resolvedCodexView.settings.showManualCookieField).toBe(false);
  expect(resolvedCodexView.status.state).toBe("idle");
});

test("exposes the claude provider screen settings and recovery action", async () => {
  const appStore = await createInitializedAppStore();
  const resolvedClaudeView = appStore.getProviderView("claude");

  if (resolvedClaudeView.id !== "claude") {
    throw new TypeError("Expected the Claude provider view.");
  }

  expectProviderActions(resolvedClaudeView.actions, true, true);
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
  expect(resolvedClaudeView.settings.showPromptPolicyControl).toBe(true);
  expect(resolvedClaudeView.settings.tokenAccounts).toEqual([]);
});

test("exposes the gemini provider screen shared actions without provider-specific settings", async () => {
  const appStore = await createInitializedAppStore();
  const resolvedGeminiView = appStore.getProviderView("gemini");

  if (resolvedGeminiView.id !== "gemini") {
    throw new TypeError("Expected the Gemini provider view.");
  }

  expectProviderActions(resolvedGeminiView.actions, false, false);
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

test("shows in-flight refresh state and applies the final provider snapshot once", async () => {
  let resolveRefresh = (): void => {};
  let refreshCallCount = 0;
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
          refreshCallCount += 1;
          await refreshReady;

          return createRefreshActionResult(
            createSuccessfulProviderActionResult("codex", "refresh", "Codex refreshed."),
            createCodexRefreshSnapshot(),
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

  const firstRefresh = appStore.refreshProvider("codex");
  const secondRefresh = appStore.refreshProvider("codex");

  expect(appStore.getProviderView("codex").actions.refresh.status).toBe("running");
  expect(appStore.getProviderView("codex").status.state).toBe("refreshing");
  resolveRefresh();
  await Promise.all([firstRefresh, secondRefresh]);

  expect(refreshCallCount).toBe(1);
  expect(appStore.getProviderView("codex").actions.refresh.status).toBe("success");
  expect(appStore.getProviderView("codex").status.sourceLabel).toBe("oauth");
  expect(appStore.getProviderView("codex").status.updatedAt).toBe(updatedTimestamp);
  expect(appStore.getProviderView("codex").status.metrics).toEqual([
    {
      detail: null,
      label: "Session",
      value: "58%",
    },
    {
      detail: null,
      label: "Weekly",
      value: "81%",
    },
  ]);
});

test("tracks scheduler state through explicit start and stop calls", async () => {
  const appStore = await createInitializedAppStore();

  expect(appStore.getState().scheduler).toEqual({
    active: false,
    intervalMs: null,
  });

  appStore.startRefreshScheduler(minimumRefreshSchedulerIntervalMs);
  expect(appStore.getState().scheduler).toEqual({
    active: true,
    intervalMs: minimumRefreshSchedulerIntervalMs,
  });

  appStore.stopRefreshScheduler();
  expect(appStore.getState().scheduler).toEqual({
    active: false,
    intervalMs: null,
  });
});

test("normalizes invalid scheduler intervals before scheduling", async () => {
  const appStore = await createInitializedAppStore();

  appStore.startRefreshScheduler(Number.NaN);
  expect(appStore.getState().scheduler).toEqual({
    active: true,
    intervalMs: defaultRefreshSchedulerIntervalMs,
  });

  appStore.startRefreshScheduler(1000);
  expect(appStore.getState().scheduler).toEqual({
    active: true,
    intervalMs: minimumRefreshSchedulerIntervalMs,
  });
});
