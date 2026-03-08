import { createDefaultConfig } from "@/core/config/schema.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderId = "claude" | "codex" | "gemini";

interface InMemoryConfigStore {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<OmarchyAgentBarConfig | null>;
  loadOrCreateDefault: () => Promise<{
    config: OmarchyAgentBarConfig;
    created: boolean;
  }>;
  save: (config: OmarchyAgentBarConfig) => Promise<OmarchyAgentBarConfig>;
}

interface TestBinaryLocator {
  findBinary: (binaryName: ProviderId) => string | null;
  isInstalled: (binaryName: ProviderId) => boolean;
}

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const failedSaveMessage = "Simulated detection save failure.";

const createTestBinaryLocator = (
  installedBinaries: Record<ProviderId, boolean>,
): TestBinaryLocator => ({
  findBinary: (binaryName: ProviderId): string | null => {
    if (installedBinaries[binaryName]) {
      return `/usr/bin/${binaryName}`;
    }

    return explicitNull;
  },
  isInstalled: (binaryName: ProviderId): boolean => installedBinaries[binaryName],
});

const createInMemoryConfigStore = (options?: { failFirstSave?: boolean }): InMemoryConfigStore => {
  let savedConfig: OmarchyAgentBarConfig | null = explicitNull;
  let saveFailed = false;

  return {
    deleteIfPresent: async (): Promise<void> => {
      savedConfig = explicitNull;
      await Promise.resolve();
    },
    filePath: "/tmp/in-memory-provider-detection-config.json",
    load: async (): Promise<OmarchyAgentBarConfig | null> => {
      await Promise.resolve();

      return savedConfig;
    },
    loadOrCreateDefault: async (): Promise<{
      config: OmarchyAgentBarConfig;
      created: boolean;
    }> => {
      await Promise.resolve();

      if (savedConfig === explicitNull) {
        return {
          config: createDefaultConfig(),
          created: true,
        };
      }

      return {
        config: savedConfig,
        created: false,
      };
    },
    save: async (config: OmarchyAgentBarConfig): Promise<OmarchyAgentBarConfig> => {
      await Promise.resolve();

      if (options?.failFirstSave === true && !saveFailed) {
        saveFailed = true;

        throw new Error(failedSaveMessage);
      }

      savedConfig = config;

      return config;
    },
  };
};

export {
  createInMemoryConfigStore,
  createTestBinaryLocator,
  failedSaveMessage,
  type InMemoryConfigStore,
  type TestBinaryLocator,
};
