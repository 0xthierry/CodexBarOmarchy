import type { AppStore } from "@/core/store/app-store.ts";
import type { ProviderId } from "@/core/store/state.ts";

interface TuiStartupRefresh {
  abort: () => void;
  completion: Promise<void>;
}

type StartupRefreshAppStore = Pick<AppStore, "getState" | "refreshProvider">;

const getStartupRefreshOrder = (appStore: StartupRefreshAppStore): ProviderId[] => {
  const { enabledProviderIds, selectedProviderId } = appStore.getState();
  const selectedProvider = enabledProviderIds.includes(selectedProviderId)
    ? selectedProviderId
    : null;

  if (selectedProvider === null) {
    return [...enabledProviderIds];
  }

  return [
    selectedProvider,
    ...enabledProviderIds.filter((providerId) => providerId !== selectedProvider),
  ];
};

const startStartupRefresh = (appStore: StartupRefreshAppStore): TuiStartupRefresh => {
  let aborted = false;
  const [selectedProviderId, ...remainingProviderIds] = getStartupRefreshOrder(appStore);

  const completion = (async (): Promise<void> => {
    if (selectedProviderId === undefined) {
      return;
    }

    await appStore.refreshProvider(selectedProviderId);

    if (aborted || remainingProviderIds.length === 0) {
      return;
    }

    await Promise.all(
      remainingProviderIds.map((providerId) => appStore.refreshProvider(providerId)),
    );
  })();

  return {
    abort: (): void => {
      aborted = true;
    },
    completion,
  };
};

export { getStartupRefreshOrder, startStartupRefresh, type TuiStartupRefresh };
