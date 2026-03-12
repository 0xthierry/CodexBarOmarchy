import { initializeConfigWithDetection } from "@/core/detection/provider-detection.ts";
import { createStateSetter } from "@/core/store/app-store-runtime.ts";
import type { AppStoreRuntime } from "@/core/store/app-store-runtime.ts";
import type { createInitialAppStoreState } from "@/core/store/state.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type AppStoreConfig = AppStoreState["config"];

interface BinaryLocatorLike {
  findBinary: (binaryName: "claude" | "codex" | "gemini") => string | null;
  isInstalled: (binaryName: "claude" | "codex" | "gemini") => boolean;
}

interface ConfigStoreLike {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<AppStoreConfig | null>;
  loadOrCreateDefault: () => Promise<{
    config: AppStoreConfig;
    created: boolean;
  }>;
  save: (config: AppStoreConfig) => Promise<AppStoreConfig>;
}

const createInitialize = (
  options: {
    binaryLocator: BinaryLocatorLike;
    configStore: ConfigStoreLike;
  },
  runtime: AppStoreRuntime,
) => {
  const setCurrentConfig = createStateSetter(runtime);

  return async (initializeOptions?: { forceRedetection?: boolean }): Promise<AppStoreState> => {
    const initializationOptions: {
      binaryLocator: BinaryLocatorLike;
      configStore: ConfigStoreLike;
      forceRedetection?: boolean;
    } = {
      binaryLocator: options.binaryLocator,
      configStore: options.configStore,
    };

    if (initializeOptions?.forceRedetection === true) {
      initializationOptions.forceRedetection = true;
    }

    const initializationResult = await initializeConfigWithDetection(initializationOptions);

    return setCurrentConfig(initializationResult.config);
  };
};

const createPersistConfig = (configStore: ConfigStoreLike, runtime: AppStoreRuntime) => {
  const setCurrentConfig = createStateSetter(runtime);

  return async (config: AppStoreConfig): Promise<AppStoreState> => {
    setCurrentConfig(config);
    runtime.persistenceVersion += 1;

    const { persistenceVersion } = runtime;
    let resolvedState = runtime.currentState;
    const previousPersistenceChain = runtime.persistenceChain;
    const persistenceOperation = (async (): Promise<void> => {
      await previousPersistenceChain;

      const savedConfig = await configStore.save(config);

      if (persistenceVersion === runtime.persistenceVersion) {
        resolvedState = setCurrentConfig(savedConfig);
      }
    })();

    runtime.persistenceChain = (async (): Promise<void> => {
      try {
        await persistenceOperation;
      } catch {
        await Promise.resolve();
      }
    })();

    await persistenceOperation;

    return resolvedState;
  };
};

const createConfigMutation =
  <Args extends unknown[]>(
    persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
    runtime: AppStoreRuntime,
    updateConfig: (config: AppStoreConfig, ...args: Args) => AppStoreConfig,
  ) =>
  async (...args: Args): Promise<AppStoreState> =>
    persistConfig(updateConfig(runtime.currentState.config, ...args));

export { createConfigMutation, createInitialize, createPersistConfig };
