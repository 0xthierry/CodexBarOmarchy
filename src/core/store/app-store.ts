import { createErrorProviderActionResult } from "@/core/actions/action-result.ts";
import type { ProviderActionName } from "@/core/actions/action-result.ts";
import {
  createDefaultProviderAdapters,
  createRefreshActionResult,
  dispatchLoginAction,
  dispatchOpenTokenFileAction,
  dispatchRecoveryAction,
  dispatchRefreshAction,
  dispatchReloadTokenFileAction,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import {
  createConfigMutation,
  createInitialize,
  createPersistConfig,
} from "@/core/store/app-store-config.ts";
import { applyActionResult, markProviderActionRunning } from "@/core/store/app-store-actions.ts";
import { createAppStoreRuntime } from "@/core/store/app-store-runtime.ts";
import type { AppStoreRuntime, StoreListener } from "@/core/store/app-store-runtime.ts";
import {
  createRefreshEnabledProviders,
  createStartRefreshScheduler,
  createStopRefreshScheduler,
} from "@/core/store/app-store-scheduler.ts";
import {
  setClaudeConfig,
  setCodexConfig,
  setGeminiConfig,
  setProviderEnabled,
  setProviderOrder,
  setSelectedProvider,
} from "@/core/store/mutations.ts";
import { getProviderView } from "@/core/store/state.ts";
import type { createInitialAppStoreState } from "@/core/store/state.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type AppStoreConfig = AppStoreState["config"];
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
type LoginActionResult = Awaited<ReturnType<typeof dispatchLoginAction>>;
type OpenTokenFileActionResult = Awaited<ReturnType<typeof dispatchOpenTokenFileAction>>;
type ProviderAdapters = ReturnType<typeof createDefaultProviderAdapters>;
type ProviderId = AppStoreState["selectedProviderId"];
type ProviderView = ReturnType<typeof getProviderView>;
type RecoveryActionResult = Awaited<ReturnType<typeof dispatchRecoveryAction>>;
type RefreshActionResult = Awaited<ReturnType<typeof dispatchRefreshAction>>;
type ReloadTokenFileActionResult = Awaited<ReturnType<typeof dispatchReloadTokenFileAction>>;
type StoreNonRefreshActionName = Exclude<ProviderActionName, "refresh">;
type StoreNonRefreshActionResult =
  | LoginActionResult
  | OpenTokenFileActionResult
  | RecoveryActionResult
  | ReloadTokenFileActionResult;

interface AppStore {
  getProviderView: (providerId: ProviderId) => ProviderView;
  getState: () => AppStoreState;
  initialize: (options?: { forceRedetection?: boolean }) => Promise<AppStoreState>;
  loginProvider: (providerId: ProviderId) => Promise<LoginActionResult>;
  openClaudeTokenFile: () => Promise<OpenTokenFileActionResult>;
  refreshEnabledProviders: () => Promise<RefreshActionResult[]>;
  refreshProvider: (providerId: ProviderId) => Promise<RefreshActionResult>;
  reloadClaudeTokenFile: () => Promise<ReloadTokenFileActionResult>;
  repairProvider: (providerId: ProviderId) => Promise<RecoveryActionResult>;
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
  startRefreshScheduler: (intervalMs: number) => AppStoreState;
  stopRefreshScheduler: () => AppStoreState;
  subscribe: (listener: StoreListener) => () => void;
}

interface CreateAppStoreOptions {
  binaryLocator: BinaryLocator;
  configStore: ConfigStore;
  providerAdapters?: ProviderAdapters;
}

const createSelectProvider = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setSelectedProvider);

const createSetClaudeConfig = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setClaudeConfig);

const createSetCodexConfig = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setCodexConfig);

const createSetGeminiConfig = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setGeminiConfig);

const createSetProviderEnabled = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setProviderEnabled);

const createSetProviderOrder = (
  persistConfig: (config: AppStoreConfig) => Promise<AppStoreState>,
  runtime: AppStoreRuntime,
) => createConfigMutation(persistConfig, runtime, setProviderOrder);

const createProviderActionExecutor =
  <ActionName extends StoreNonRefreshActionName, ActionResult extends StoreNonRefreshActionResult>(
    runtime: AppStoreRuntime,
    actionName: ActionName,
    dispatchAction: (config: AppStoreConfig, providerId: ProviderId) => Promise<ActionResult>,
  ) =>
  async (providerId: ProviderId): Promise<ActionResult> => {
    markProviderActionRunning(runtime, providerId, actionName);
    const actionResult = await dispatchAction(runtime.currentState.config, providerId);

    applyActionResult(runtime, providerId, actionResult);

    return actionResult;
  };

const setRefreshOperation = (
  runtime: AppStoreRuntime,
  providerId: ProviderId,
  refreshOperation: Promise<RefreshActionResult> | null,
): void => {
  runtime.refreshOperations = {
    ...runtime.refreshOperations,
    [providerId]: refreshOperation,
  };
};

const createRefreshFailureResult = (providerId: ProviderId, error: unknown): RefreshActionResult =>
  createRefreshActionResult(
    createErrorProviderActionResult(
      providerId,
      "refresh",
      error instanceof Error ? error.message : `${providerId} refresh failed.`,
    ),
  );

const dispatchRefreshActionSafely = async (
  providerAdapters: ProviderAdapters,
  config: AppStoreConfig,
  providerId: ProviderId,
): Promise<RefreshActionResult> => {
  try {
    return await dispatchRefreshAction(providerAdapters, config, providerId);
  } catch (error) {
    return createRefreshFailureResult(providerId, error);
  }
};

const createLoginProvider = (providerAdapters: ProviderAdapters, runtime: AppStoreRuntime) =>
  createProviderActionExecutor(runtime, "login", (config, providerId) =>
    dispatchLoginAction(providerAdapters, config, providerId),
  );

const createOpenClaudeTokenFile = (
  providerAdapters: ProviderAdapters,
  runtime: AppStoreRuntime,
) => {
  const executeOpenTokenFile = createProviderActionExecutor(
    runtime,
    "openTokenFile",
    (config, providerId) => dispatchOpenTokenFileAction(providerAdapters, config, providerId),
  );

  return (): Promise<OpenTokenFileActionResult> => executeOpenTokenFile("claude");
};

const createRefreshProvider =
  (providerAdapters: ProviderAdapters, runtime: AppStoreRuntime) =>
  async (providerId: ProviderId): Promise<RefreshActionResult> => {
    const pendingOperation = runtime.refreshOperations[providerId];

    if (pendingOperation !== null) {
      return pendingOperation;
    }

    markProviderActionRunning(runtime, providerId, "refresh");
    const refreshOperation = (async (): Promise<RefreshActionResult> => {
      try {
        const actionResult = await dispatchRefreshActionSafely(
          providerAdapters,
          runtime.currentState.config,
          providerId,
        );

        applyActionResult(runtime, providerId, actionResult);

        return actionResult;
      } finally {
        setRefreshOperation(runtime, providerId, explicitNull);
      }
    })();

    setRefreshOperation(runtime, providerId, refreshOperation);

    return refreshOperation;
  };

const createReloadClaudeTokenFile = (
  providerAdapters: ProviderAdapters,
  runtime: AppStoreRuntime,
) => {
  const executeReloadTokenFile = createProviderActionExecutor(
    runtime,
    "reloadTokenFile",
    (config, providerId) => dispatchReloadTokenFileAction(providerAdapters, config, providerId),
  );

  return (): Promise<ReloadTokenFileActionResult> => executeReloadTokenFile("claude");
};

const createRepairProvider = (providerAdapters: ProviderAdapters, runtime: AppStoreRuntime) =>
  createProviderActionExecutor(runtime, "repair", (config, providerId) =>
    dispatchRecoveryAction(providerAdapters, config, providerId),
  );

const createAppStore = (options: CreateAppStoreOptions): AppStore => {
  const providerAdapters = options.providerAdapters ?? createDefaultProviderAdapters();
  const runtime = createAppStoreRuntime();
  const initialize = createInitialize(options, runtime);
  const persistConfig = createPersistConfig(options.configStore, runtime);
  const refreshProvider = createRefreshProvider(providerAdapters, runtime);
  const refreshEnabledProviders = createRefreshEnabledProviders(refreshProvider, runtime);

  return {
    getProviderView: (providerId: ProviderId): ProviderView =>
      getProviderView(runtime.currentState.config, providerId, runtime.providerRuntimeStates),
    getState: (): AppStoreState => runtime.currentState,
    initialize,
    loginProvider: createLoginProvider(providerAdapters, runtime),
    openClaudeTokenFile: createOpenClaudeTokenFile(providerAdapters, runtime),
    refreshEnabledProviders,
    refreshProvider,
    reloadClaudeTokenFile: createReloadClaudeTokenFile(providerAdapters, runtime),
    repairProvider: createRepairProvider(providerAdapters, runtime),
    selectProvider: createSelectProvider(persistConfig, runtime),
    setClaudeConfig: createSetClaudeConfig(persistConfig, runtime),
    setCodexConfig: createSetCodexConfig(persistConfig, runtime),
    setGeminiConfig: createSetGeminiConfig(persistConfig, runtime),
    setProviderEnabled: createSetProviderEnabled(persistConfig, runtime),
    setProviderOrder: createSetProviderOrder(persistConfig, runtime),
    startRefreshScheduler: createStartRefreshScheduler(refreshEnabledProviders, runtime),
    stopRefreshScheduler: createStopRefreshScheduler(runtime),
    subscribe: (listener: StoreListener): (() => void) => {
      runtime.listeners.add(listener);

      return (): void => {
        runtime.listeners.delete(listener);
      };
    },
  };
};

export { createAppStore, type AppStore, type CreateAppStoreOptions, type StoreListener };
