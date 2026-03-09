import type { ProviderAdapters } from "@/core/actions/provider-adapter.ts";
import { createConfigStore } from "@/core/config/store.ts";
import type { ConfigStore } from "@/core/config/store.ts";
import { createBinaryLocator } from "@/core/detection/binary-locator.ts";
import type { BinaryLocator } from "@/core/detection/binary-locator.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import type { AppStore } from "@/core/store/app-store.ts";
import {
  defaultRefreshSchedulerIntervalMs,
  normalizeRefreshSchedulerIntervalMs,
} from "@/core/store/scheduler.ts";
import { createRuntimeHost } from "@/runtime/node-host.ts";
import { createRuntimeProviderAdapters } from "@/runtime/provider-adapters.ts";
import type { RuntimeHost } from "@/runtime/host.ts";

type AppStoreState = ReturnType<AppStore["getState"]>;

interface HeadlessAppRuntime {
  appStore: AppStore;
  start: (options?: { forceRedetection?: boolean }) => Promise<AppStoreState>;
  stop: () => AppStoreState;
}

interface CreateHeadlessAppRuntimeOptions {
  binaryLocator?: BinaryLocator;
  configStore?: ConfigStore;
  host?: RuntimeHost;
  providerAdapters?: ProviderAdapters;
  schedulerEnabled?: boolean;
  schedulerIntervalMs?: number;
}

const createHeadlessAppRuntime = (
  options: CreateHeadlessAppRuntimeOptions = {},
): HeadlessAppRuntime => {
  const runtimeHost = options.host ?? createRuntimeHost();
  const providerAdapters = options.providerAdapters ?? createRuntimeProviderAdapters(runtimeHost);
  const appStore = createAppStore({
    binaryLocator: options.binaryLocator ?? createBinaryLocator(),
    configStore: options.configStore ?? createConfigStore(),
    providerAdapters,
  });
  const schedulerEnabled = options.schedulerEnabled !== false;
  const schedulerIntervalMs = normalizeRefreshSchedulerIntervalMs(
    options.schedulerIntervalMs ?? defaultRefreshSchedulerIntervalMs,
  );

  return {
    appStore,
    start: async (startOptions?: { forceRedetection?: boolean }): Promise<AppStoreState> => {
      await appStore.initialize(startOptions);

      if (schedulerEnabled) {
        appStore.startRefreshScheduler(schedulerIntervalMs);
      }

      return appStore.getState();
    },
    stop: (): AppStoreState => appStore.stopRefreshScheduler(),
  };
};

export { createHeadlessAppRuntime, type CreateHeadlessAppRuntimeOptions, type HeadlessAppRuntime };
