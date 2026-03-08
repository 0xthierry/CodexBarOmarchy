import { expect, test } from "bun:test";
import { createAppStore } from "@/core/store/app-store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
const firstSavedConfigIndex = 0;

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const resolveVoid = async (): Promise<void> => {
  await Promise.resolve();
};

interface FakeConfigStore {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<OmarchyAgentBarConfig>;
  loadOrCreateDefault: () => Promise<{
    config: OmarchyAgentBarConfig;
    created: boolean;
  }>;
  save: (config: OmarchyAgentBarConfig) => Promise<OmarchyAgentBarConfig>;
  savedConfigs: OmarchyAgentBarConfig[];
}

interface TestBinaryLocator {
  findBinary: (binaryName: "claude" | "codex" | "gemini") => string | null;
  isInstalled: (binaryName: "claude" | "codex" | "gemini") => boolean;
}

const createTestBinaryLocator = (installedBinaries: {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}): TestBinaryLocator => ({
  findBinary: (binaryName: "claude" | "codex" | "gemini"): string | null => {
    if (installedBinaries[binaryName]) {
      return `/usr/bin/${binaryName}`;
    }

    return explicitNull;
  },
  isInstalled: (binaryName: "claude" | "codex" | "gemini"): boolean =>
    installedBinaries[binaryName],
});

const createFakeConfigStore = (initialConfig: OmarchyAgentBarConfig): FakeConfigStore => {
  let currentConfig = initialConfig;
  const savedConfigs: OmarchyAgentBarConfig[] = [];

  return {
    deleteIfPresent: resolveVoid,
    filePath: "/tmp/fake-omarchy-agent-bar-config.json",
    load: async (): Promise<OmarchyAgentBarConfig> => {
      await Promise.resolve();

      return currentConfig;
    },
    loadOrCreateDefault: async (): Promise<{
      config: OmarchyAgentBarConfig;
      created: boolean;
    }> => {
      await Promise.resolve();

      return {
        config: currentConfig,
        created: false,
      };
    },
    save: async (config: OmarchyAgentBarConfig): Promise<OmarchyAgentBarConfig> => {
      currentConfig = config;
      savedConfigs.push(config);
      await Promise.resolve();

      return config;
    },
    savedConfigs,
  };
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
