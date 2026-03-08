import {
  createAppStoreState,
  createInitialAppStoreState,
  getProviderView,
} from "@/core/store/state.ts";
import {
  createDefaultProviderAdapters,
  dispatchLoginAction,
  dispatchRecoveryAction,
  dispatchRefreshAction,
} from "@/core/actions/provider-adapter.ts";
import {
  setClaudeConfig,
  setCodexConfig,
  setGeminiConfig,
  setProviderEnabled,
  setProviderOrder,
  setSelectedProvider,
} from "@/core/store/mutations.ts";
import { initializeConfigWithDetection } from "@/core/detection/provider-detection.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type AppStoreConfig = AppStoreState["config"];
type LoginActionResult = Awaited<ReturnType<typeof dispatchLoginAction>>;
type ProviderAdapters = ReturnType<typeof createDefaultProviderAdapters>;
type RecoveryActionResult = Awaited<ReturnType<typeof dispatchRecoveryAction>>;
type RefreshActionResult = Awaited<ReturnType<typeof dispatchRefreshAction>>;
interface BinaryLocator {
  findBinary: (binaryName: "claude" | "codex" | "gemini") => string | null;
  isInstalled: (binaryName: "claude" | "codex" | "gemini") => boolean;
}

interface ConfigStore {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<AppStoreConfig | null>;
  loadOrCreateDefault: () => Promise<{
    config: AppStoreConfig;
    created: boolean;
  }>;
  save: (config: AppStoreConfig) => Promise<AppStoreConfig>;
}

type ProviderId = AppStoreState["selectedProviderId"];
type ProviderView = ReturnType<typeof getProviderView>;
type StoreListener = (state: AppStoreState) => void;

interface AppStore {
  getProviderView: (providerId: ProviderId) => ProviderView;
  getState: () => AppStoreState;
  initialize: (options?: { forceRedetection?: boolean }) => Promise<AppStoreState>;
  loginProvider: (providerId: ProviderId) => Promise<LoginActionResult>;
  repairProvider: (providerId: ProviderId) => Promise<RecoveryActionResult>;
  refreshProvider: (providerId: ProviderId) => Promise<RefreshActionResult>;
  selectProvider: (providerId: ProviderId) => Promise<AppStoreState>;
  setClaudeConfig: (
    updater: (
      providerConfig: AppStoreConfig["providers"]["claude"],
    ) => AppStoreConfig["providers"]["claude"],
  ) => Promise<AppStoreState>;
  setCodexConfig: (
    updater: (
      providerConfig: AppStoreConfig["providers"]["codex"],
    ) => AppStoreConfig["providers"]["codex"],
  ) => Promise<AppStoreState>;
  setGeminiConfig: (
    updater: (
      providerConfig: AppStoreConfig["providers"]["gemini"],
    ) => AppStoreConfig["providers"]["gemini"],
  ) => Promise<AppStoreState>;
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) => Promise<AppStoreState>;
  setProviderOrder: (providerOrder: ProviderId[]) => Promise<AppStoreState>;
  subscribe: (listener: StoreListener) => () => void;
}

interface CreateAppStoreOptions {
  binaryLocator: BinaryLocator;
  configStore: ConfigStore;
  providerAdapters?: ProviderAdapters;
}

interface AppStoreRuntime {
  currentState: AppStoreState;
  listeners: Set<StoreListener>;
}

const notifyListeners = (runtime: AppStoreRuntime): void => {
  for (const listener of runtime.listeners) {
    listener(runtime.currentState);
  }
};

const createStateSetter =
  (runtime: AppStoreRuntime) =>
  (config: AppStoreConfig): AppStoreState => {
    runtime.currentState = createAppStoreState(config);
    notifyListeners(runtime);

    return runtime.currentState;
  };

const createAppStoreRuntime = (): AppStoreRuntime => ({
  currentState: createInitialAppStoreState(),
  listeners: new Set<StoreListener>(),
});

const createInitialize = (options: CreateAppStoreOptions, runtime: AppStoreRuntime) => {
  const setCurrentConfig = createStateSetter(runtime);

  return async (initializeOptions?: { forceRedetection?: boolean }): Promise<AppStoreState> => {
    const initializationOptions: {
      binaryLocator: BinaryLocator;
      configStore: ConfigStore;
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

const createPersistConfig = (configStore: ConfigStore, runtime: AppStoreRuntime) => {
  const setCurrentConfig = createStateSetter(runtime);

  return async (config: AppStoreConfig): Promise<AppStoreState> => {
    setCurrentConfig(config);

    const savedConfig = await configStore.save(config);

    return setCurrentConfig(savedConfig);
  };
};

const createSelectProvider =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (providerId: ProviderId): Promise<AppStoreState> => {
    const nextState = await persistConfig(
      setSelectedProvider(runtime.currentState.config, providerId),
    );

    return nextState;
  };

const createSetClaudeConfig =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (
    updater: (
      providerConfig: AppStoreConfig["providers"]["claude"],
    ) => AppStoreConfig["providers"]["claude"],
  ): Promise<AppStoreState> => {
    const nextState = await persistConfig(setClaudeConfig(runtime.currentState.config, updater));

    return nextState;
  };

const createSetCodexConfig =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (
    updater: (
      providerConfig: AppStoreConfig["providers"]["codex"],
    ) => AppStoreConfig["providers"]["codex"],
  ): Promise<AppStoreState> => {
    const nextState = await persistConfig(setCodexConfig(runtime.currentState.config, updater));

    return nextState;
  };

const createSetGeminiConfig =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (
    updater: (
      providerConfig: AppStoreConfig["providers"]["gemini"],
    ) => AppStoreConfig["providers"]["gemini"],
  ): Promise<AppStoreState> => {
    const nextState = await persistConfig(setGeminiConfig(runtime.currentState.config, updater));

    return nextState;
  };

const createSetProviderEnabled =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (providerId: ProviderId, enabled: boolean): Promise<AppStoreState> => {
    const nextState = await persistConfig(
      setProviderEnabled(runtime.currentState.config, providerId, enabled),
    );

    return nextState;
  };

const createSetProviderOrder =
  (persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>, runtime: AppStoreRuntime) =>
  async (providerOrder: ProviderId[]): Promise<AppStoreState> => {
    const nextState = await persistConfig(
      setProviderOrder(runtime.currentState.config, providerOrder),
    );

    return nextState;
  };

const createLoginProvider =
  (providerAdapters: ProviderAdapters) =>
  async (providerId: ProviderId): Promise<LoginActionResult> => {
    const actionResult = await dispatchLoginAction(providerAdapters, providerId);

    return actionResult;
  };

const createRefreshProvider =
  (providerAdapters: ProviderAdapters) =>
  async (providerId: ProviderId): Promise<RefreshActionResult> => {
    const actionResult = await dispatchRefreshAction(providerAdapters, providerId);

    return actionResult;
  };

const createRepairProvider =
  (providerAdapters: ProviderAdapters) =>
  async (providerId: ProviderId): Promise<RecoveryActionResult> => {
    const actionResult = await dispatchRecoveryAction(providerAdapters, providerId);

    return actionResult;
  };

const createAppStore = (options: CreateAppStoreOptions): AppStore => {
  const providerAdapters = options.providerAdapters ?? createDefaultProviderAdapters();
  const runtime = createAppStoreRuntime();
  const initialize = createInitialize(options, runtime);
  const persistConfig = createPersistConfig(options.configStore, runtime);

  return {
    getProviderView: (providerId: ProviderId): ProviderView =>
      getProviderView(runtime.currentState.config, providerId),
    getState: (): AppStoreState => runtime.currentState,
    initialize,
    loginProvider: createLoginProvider(providerAdapters),
    refreshProvider: createRefreshProvider(providerAdapters),
    repairProvider: createRepairProvider(providerAdapters),
    selectProvider: createSelectProvider(persistConfig, runtime),
    setClaudeConfig: createSetClaudeConfig(persistConfig, runtime),
    setCodexConfig: createSetCodexConfig(persistConfig, runtime),
    setGeminiConfig: createSetGeminiConfig(persistConfig, runtime),
    setProviderEnabled: createSetProviderEnabled(persistConfig, runtime),
    setProviderOrder: createSetProviderOrder(persistConfig, runtime),
    subscribe: (listener: StoreListener): (() => void) => {
      runtime.listeners.add(listener);

      return (): void => {
        runtime.listeners.delete(listener);
      };
    },
  };
};

export { createAppStore, type AppStore, type CreateAppStoreOptions, type StoreListener };
