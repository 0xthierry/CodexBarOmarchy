import { getSettingsItems } from "@/ui/tui/descriptors.ts";
import type { ProviderId, TuiKeyInput, TuiLocalState } from "@/ui/tui/types.ts";
import type { AppStore } from "@/core/store/app-store.ts";
import type { AppStoreState } from "@/core/store/state.ts";

interface TuiControllerSnapshot {
  localState: TuiLocalState;
  state: AppStoreState;
}

interface TuiController {
  closeSettings: () => void;
  destroy: () => void;
  getSnapshot: () => TuiControllerSnapshot;
  handleKeyPress: (key: TuiKeyInput) => boolean;
  openSettings: () => void;
  requestQuit: () => void;
  selectProvider: (providerId: ProviderId) => Promise<void>;
  subscribe: (listener: (snapshot: TuiControllerSnapshot) => void) => () => void;
}

interface CreateTuiControllerOptions {
  appStore: AppStore;
}

const createInitialLocalState = (): TuiLocalState => ({
  footerMessage: null,
  isSettingsOpen: false,
  modalFocus: "items",
  quitRequested: false,
  selectedChoiceIndex: 0,
  selectedSettingsIndex: 0,
  tokenAccountEditor: null,
});

const isDigitShortcut = (key: TuiKeyInput): boolean => /^[1-9]$/.test(key.name);

const createTuiController = (options: CreateTuiControllerOptions): TuiController => {
  let localState = createInitialLocalState();
  const listeners = new Set<(snapshot: TuiControllerSnapshot) => void>();

  const emit = (): void => {
    const snapshot = {
      localState,
      state: options.appStore.getState(),
    };

    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const clampSelection = (): void => {
    const selectedProvider = options.appStore
      .getState()
      .providerViews.find(
        (providerView) => providerView.id === options.appStore.getState().selectedProviderId,
      );

    if (selectedProvider === undefined) {
      localState = {
        ...localState,
        selectedChoiceIndex: 0,
        selectedSettingsIndex: 0,
      };

      return;
    }

    const settingsItems = getSettingsItems(selectedProvider);
    const selectedSettingsIndex = Math.max(
      0,
      Math.min(localState.selectedSettingsIndex, Math.max(0, settingsItems.length - 1)),
    );
    const selectedItem = settingsItems[selectedSettingsIndex];
    const selectedChoiceIndex = Math.max(
      0,
      Math.min(
        localState.selectedChoiceIndex,
        Math.max(0, (selectedItem?.choices.length ?? 1) - 1),
      ),
    );

    localState = {
      ...localState,
      selectedChoiceIndex,
      selectedSettingsIndex,
    };
  };

  const setFooterMessage = (footerMessage: string | null): void => {
    localState = {
      ...localState,
      footerMessage,
    };
  };

  const selectProvider = async (providerId: ProviderId): Promise<void> => {
    try {
      await options.appStore.selectProvider(providerId);
      clampSelection();
      setFooterMessage(`Selected ${providerId}.`);
      emit();
    } catch (error) {
      setFooterMessage(error instanceof Error ? error.message : String(error));
      emit();
    }
  };

  const selectProviderByOffset = async (offset: -1 | 1): Promise<void> => {
    const providerIds = options.appStore
      .getState()
      .providerViews.map((providerView) => providerView.id);
    const currentIndex = providerIds.indexOf(options.appStore.getState().selectedProviderId);
    const nextIndex = (currentIndex + offset + providerIds.length) % providerIds.length;
    const nextProviderId = providerIds[nextIndex];

    if (nextProviderId !== undefined) {
      await selectProvider(nextProviderId);
    }
  };

  const openSettings = (): void => {
    clampSelection();
    localState = {
      ...localState,
      footerMessage: null,
      isSettingsOpen: true,
      modalFocus: "items",
      tokenAccountEditor: null,
    };
    emit();
  };

  const closeSettings = (): void => {
    localState = {
      ...localState,
      footerMessage: "Closed settings.",
      isSettingsOpen: false,
      modalFocus: "items",
      tokenAccountEditor: null,
    };
    emit();
  };

  const requestQuit = (): void => {
    localState = {
      ...localState,
      quitRequested: true,
    };
    emit();
  };

  const handleKeyPress = (key: TuiKeyInput): boolean => {
    if (key.ctrl && key.name === "c") {
      requestQuit();
      return true;
    }

    if (key.name === "q" && localState.tokenAccountEditor === null) {
      requestQuit();
      return true;
    }

    if (key.name === "," && localState.tokenAccountEditor === null) {
      openSettings();
      return true;
    }

    if (key.name === "escape" && localState.isSettingsOpen) {
      closeSettings();
      return true;
    }

    if (key.name === "h" || key.name === "left") {
      void selectProviderByOffset(-1);
      return true;
    }

    if (key.name === "l" || key.name === "right") {
      void selectProviderByOffset(1);
      return true;
    }

    if (isDigitShortcut(key)) {
      const providerIndex = Number(key.name) - 1;
      const providerId = options.appStore.getState().providerViews[providerIndex]?.id;

      if (providerId !== undefined) {
        void selectProvider(providerId);
        return true;
      }
    }

    return false;
  };

  const unsubscribeFromStore = options.appStore.subscribe(() => {
    clampSelection();
    emit();
  });

  return {
    closeSettings,
    destroy: (): void => {
      unsubscribeFromStore();
      listeners.clear();
    },
    getSnapshot: (): TuiControllerSnapshot => ({
      localState,
      state: options.appStore.getState(),
    }),
    handleKeyPress,
    openSettings,
    requestQuit,
    selectProvider,
    subscribe: (listener: (snapshot: TuiControllerSnapshot) => void): (() => void) => {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },
  };
};

export {
  createInitialLocalState,
  createTuiController,
  type TuiController,
  type TuiControllerSnapshot,
};
