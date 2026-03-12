import type { createDefaultConfig } from "@/core/config/schema.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderId = "claude" | "codex" | "gemini";

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

interface FakeConfigStoreOptions {
  saveDelaysMs?: number[];
}

interface TestBinaryLocator {
  findBinary: (binaryName: ProviderId) => string | null;
  isInstalled: (binaryName: ProviderId) => boolean;
}

const defaultDelayMs = 0;
const saveCountIncrement = 1;
const fakeBinaryPath = (binaryName: ProviderId): string => `test-bin/${binaryName}`;

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const resolveVoid = async (): Promise<void> => {
  await Promise.resolve();
};

const waitForDelay = async (delayMs: number): Promise<void> => {
  if (delayMs === defaultDelayMs) {
    await Promise.resolve();

    return;
  }

  await Bun.sleep(delayMs);
};

const createTestBinaryLocator = (
  installedBinaries: Record<ProviderId, boolean>,
): TestBinaryLocator => ({
  findBinary: (binaryName: ProviderId): string | null => {
    if (installedBinaries[binaryName]) {
      return fakeBinaryPath(binaryName);
    }

    return explicitNull;
  },
  isInstalled: (binaryName: ProviderId): boolean => installedBinaries[binaryName],
});

const createFakeConfigStore = (
  initialConfig: OmarchyAgentBarConfig,
  options?: FakeConfigStoreOptions,
): FakeConfigStore => {
  let currentConfig = initialConfig;
  const savedConfigs: OmarchyAgentBarConfig[] = [];
  let saveCount = 0;

  return {
    deleteIfPresent: resolveVoid,
    filePath: "test-config/fake-omarchy-agent-bar-config.json",
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

      const delayMs = options?.saveDelaysMs?.[saveCount] ?? defaultDelayMs;

      saveCount += saveCountIncrement;
      await waitForDelay(delayMs);

      return config;
    },
    savedConfigs,
  };
};

export {
  createFakeConfigStore,
  createTestBinaryLocator,
  defaultDelayMs,
  type FakeConfigStore,
  type FakeConfigStoreOptions,
  type TestBinaryLocator,
};
