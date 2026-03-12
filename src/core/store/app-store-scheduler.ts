import type { RefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import { updateSchedulerState } from "@/core/store/app-store-runtime.ts";
import type { AppStoreRuntime } from "@/core/store/app-store-runtime.ts";
import { normalizeRefreshSchedulerIntervalMs } from "@/core/store/scheduler.ts";
import type { createInitialAppStoreState} from "@/core/store/state.ts";
import { defaultSchedulerState } from "@/core/store/state.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type ProviderId = AppStoreState["selectedProviderId"];

const createRefreshEnabledProviders =
  (
    refreshProvider: (providerId: ProviderId) => Promise<RefreshActionResult>,
    runtime: AppStoreRuntime,
  ) =>
  async (): Promise<RefreshActionResult[]> =>
    Promise.all(
      runtime.currentState.enabledProviderIds.map((providerId) => refreshProvider(providerId)),
    );

const clearRefreshSchedulerHandle = (runtime: AppStoreRuntime): void => {
  if (runtime.schedulerHandle === null) {
    return;
  }

  globalThis.clearInterval(runtime.schedulerHandle);
  runtime.schedulerHandle = explicitNull;
};

const setRefreshSchedulerHandle = (
  runtime: AppStoreRuntime,
  refreshEnabledProviders: () => Promise<RefreshActionResult[]>,
  intervalMs: number,
): void => {
  clearRefreshSchedulerHandle(runtime);
  runtime.schedulerHandle = globalThis.setInterval(() => {
    void refreshEnabledProviders();
  }, intervalMs);
};

const createStartRefreshScheduler =
  (refreshEnabledProviders: () => Promise<RefreshActionResult[]>, runtime: AppStoreRuntime) =>
  (intervalMs: number): AppStoreState => {
    const normalizedIntervalMs = normalizeRefreshSchedulerIntervalMs(intervalMs);
    setRefreshSchedulerHandle(runtime, refreshEnabledProviders, normalizedIntervalMs);

    return updateSchedulerState(runtime, {
      active: true,
      intervalMs: normalizedIntervalMs,
    });
  };

const createStopRefreshScheduler = (runtime: AppStoreRuntime) => (): AppStoreState => {
  clearRefreshSchedulerHandle(runtime);

  return updateSchedulerState(runtime, defaultSchedulerState);
};

export { createRefreshEnabledProviders, createStartRefreshScheduler, createStopRefreshScheduler };
