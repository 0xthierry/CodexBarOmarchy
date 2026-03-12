import type { RefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { createProviderMap, explicitNull } from "@/core/providers/shared.ts";
import type { ProviderMap } from "@/core/providers/shared.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import type { ProviderRuntimeState, ProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import {
  createAppStoreState,
  createInitialAppStoreState,
  defaultSchedulerState,
} from "@/core/store/state.ts";
import type { SchedulerState } from "@/core/store/state.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type AppStoreConfig = AppStoreState["config"];
type ProviderId = AppStoreState["selectedProviderId"];
type SchedulerHandle = ReturnType<typeof globalThis.setInterval>;
type StoreListener = (state: AppStoreState) => void;

interface AppStoreRuntime {
  currentState: AppStoreState;
  listeners: Set<StoreListener>;
  persistenceChain: Promise<void>;
  persistenceVersion: number;
  providerRuntimeStates: ProviderRuntimeStateMap;
  refreshOperations: ProviderMap<Promise<RefreshActionResult> | null>;
  scheduler: SchedulerState;
  schedulerHandle: SchedulerHandle | null;
}

const createResolvedPromise = async (): Promise<void> => {
  await Promise.resolve();
};

const notifyListeners = (runtime: AppStoreRuntime): void => {
  for (const listener of runtime.listeners) {
    listener(runtime.currentState);
  }
};

const rebuildCurrentState = (runtime: AppStoreRuntime, config: AppStoreConfig): AppStoreState => {
  runtime.currentState = createAppStoreState(
    config,
    runtime.providerRuntimeStates,
    runtime.scheduler,
  );
  notifyListeners(runtime);

  return runtime.currentState;
};

const createStateSetter =
  (runtime: AppStoreRuntime) =>
  (config: AppStoreConfig): AppStoreState =>
    rebuildCurrentState(runtime, config);

const updateProviderRuntimeState = (
  runtime: AppStoreRuntime,
  providerId: ProviderId,
  updater: (providerRuntimeState: ProviderRuntimeState) => ProviderRuntimeState,
): AppStoreState => {
  runtime.providerRuntimeStates = {
    ...runtime.providerRuntimeStates,
    [providerId]: updater(runtime.providerRuntimeStates[providerId]),
  };

  return rebuildCurrentState(runtime, runtime.currentState.config);
};

const updateSchedulerState = (
  runtime: AppStoreRuntime,
  scheduler: SchedulerState,
): AppStoreState => {
  runtime.scheduler = scheduler;

  return rebuildCurrentState(runtime, runtime.currentState.config);
};

const createAppStoreRuntime = (): AppStoreRuntime => ({
  currentState: createInitialAppStoreState(),
  listeners: new Set<StoreListener>(),
  persistenceChain: createResolvedPromise(),
  persistenceVersion: 0,
  providerRuntimeStates: createDefaultProviderRuntimeStateMap(),
  refreshOperations: createProviderMap(() => explicitNull),
  scheduler: defaultSchedulerState,
  schedulerHandle: explicitNull,
});

export {
  createAppStoreRuntime,
  createStateSetter,
  updateProviderRuntimeState,
  updateSchedulerState,
  type AppStoreRuntime,
  type StoreListener,
};
