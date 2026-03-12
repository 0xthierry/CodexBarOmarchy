import { getSettingsItems } from "@/ui/tui/descriptors.ts";
import {
  appendClaudeTokenAccountEditorText,
  cancelClaudeTokenAccountEditor,
  closeClaudeTokenAccountEditor,
  deleteClaudeTokenAccountEditorText,
  openClaudeTokenAccountEditor,
  setClaudeTokenAccountEditorError,
  switchClaudeTokenAccountEditorField,
} from "@/ui/tui/token-account-editor.ts";
import type { AppStore } from "@/core/store/app-store.ts";
import type { AppStoreState } from "@/core/store/state.ts";
import type {
  ProviderId,
  ProviderView,
  TuiKeyInput,
  TuiLocalState,
  TuiSettingsChoice,
  TuiSettingsItemDescriptor,
} from "@/ui/tui/types.ts";

interface TuiControllerSnapshot {
  localState: TuiLocalState;
  state: AppStoreState;
}

interface TuiController {
  activateSelectedSettingsItem: () => Promise<void>;
  applySelectedChoice: () => Promise<void>;
  closeSettings: () => void;
  destroy: () => void;
  focusModalChoices: () => void;
  focusModalItems: () => void;
  getSnapshot: () => TuiControllerSnapshot;
  handleKeyPress: (key: TuiKeyInput) => boolean;
  openSettings: () => void;
  refreshSelectedProvider: () => Promise<void>;
  requestQuit: () => void;
  selectProvider: (providerId: ProviderId) => Promise<void>;
  setSelectedChoiceIndex: (index: number) => void;
  setSelectedSettingsIndex: (index: number) => void;
  subscribe: (listener: (snapshot: TuiControllerSnapshot) => void) => () => void;
}

interface CreateTuiControllerOptions {
  appStore: AppStore;
}

type TuiSettingsChoiceHandler = (choice: TuiSettingsChoice) => Promise<void>;
type TuiSettingsActionHandler = () => Promise<void>;
type TuiSettingsItemActivationHandler = (item: TuiSettingsItemDescriptor) => Promise<void>;

const createInitialLocalState = (): TuiLocalState => ({
  focusedProviderId: null,
  footerMessage: null,
  isSettingsOpen: false,
  modalFocus: "items",
  quitRequested: false,
  selectedChoiceIndex: 0,
  selectedSettingsIndex: 0,
  tokenAccountEditor: null,
});

const isDigitShortcut = (key: TuiKeyInput): boolean => /^[1-9]$/.test(key.name);
const isEnterKey = (key: TuiKeyInput): boolean => key.name === "enter" || key.name === "return";
const isTabKey = (key: TuiKeyInput): boolean => key.name === "tab";
const isBackspaceKey = (key: TuiKeyInput): boolean => key.name === "backspace";
const isArrowKey = (key: TuiKeyInput): boolean =>
  key.name === "down" || key.name === "left" || key.name === "right" || key.name === "up";
const isPrintableKey = (key: TuiKeyInput): boolean =>
  !key.ctrl && !key.meta && key.sequence.length === 1 && key.name !== "escape";
const normalizeCodexSource = (value: string): "auto" | "cli" | "oauth" => {
  if (value === "cli" || value === "oauth") {
    return value;
  }

  return "auto";
};

const normalizeCodexCookieSource = (value: string): "auto" | "manual" | "off" => {
  if (value === "auto" || value === "manual") {
    return value;
  }

  return "off";
};

const normalizeClaudeSource = (value: string): "auto" | "cli" | "oauth" | "web" => {
  if (value === "cli" || value === "oauth" || value === "web") {
    return value;
  }

  return "auto";
};

const normalizeClaudeCookieSource = (value: string): "auto" | "manual" =>
  value === "manual" ? value : "auto";

const createTuiController = (options: CreateTuiControllerOptions): TuiController => {
  let localState: TuiLocalState = {
    ...createInitialLocalState(),
    focusedProviderId: options.appStore.getState().selectedProviderId,
  };
  const listeners = new Set<(snapshot: TuiControllerSnapshot) => void>();
  const getState = (): AppStoreState => options.appStore.getState();

  const getFocusedProvider = (): ProviderView => {
    const focusedProviderId = localState.focusedProviderId ?? getState().selectedProviderId;
    const selectedProvider = getState().providerViews.find(
      (providerView) => providerView.id === focusedProviderId,
    );

    if (selectedProvider !== undefined) {
      return selectedProvider;
    }

    const fallbackProvider = getState().providerViews[0];

    if (fallbackProvider === undefined) {
      throw new Error("Expected at least one provider view.");
    }

    return fallbackProvider;
  };

  const getSelectedSettingsItems = (): TuiSettingsItemDescriptor[] =>
    getSettingsItems(getFocusedProvider());

  const getSelectedSettingsItem = (): TuiSettingsItemDescriptor | null => {
    const selectedSettingsItems = getSelectedSettingsItems();

    return selectedSettingsItems[localState.selectedSettingsIndex] ?? null;
  };

  const emit = (): void => {
    const snapshot = {
      localState,
      state: getState(),
    };

    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const clampSelection = (): void => {
    const settingsItems = getSelectedSettingsItems();
    const selectedSettingsIndex = Math.max(
      0,
      Math.min(localState.selectedSettingsIndex, Math.max(0, settingsItems.length - 1)),
    );
    const selectedItem = settingsItems[selectedSettingsIndex];
    const selectedChoiceIndex = (() => {
      if (selectedItem === undefined || selectedItem.choices.length === 0) {
        return 0;
      }

      const currentChoiceIndex = selectedItem.choices.findIndex(
        (choice) => choice.value === selectedItem.currentValue,
      );

      if (currentChoiceIndex !== -1) {
        return currentChoiceIndex;
      }

      return Math.max(0, Math.min(localState.selectedChoiceIndex, selectedItem.choices.length - 1));
    })();

    localState = {
      ...localState,
      focusedProviderId: getFocusedProvider().id,
      selectedChoiceIndex,
      selectedSettingsIndex,
    };
  };

  const syncChoiceIndex = (): void => {
    clampSelection();
  };

  const setLocalState = (nextLocalState: TuiLocalState): void => {
    localState = nextLocalState;
  };

  const setFooterMessage = (footerMessage: string | null): void => {
    setLocalState({
      ...localState,
      footerMessage,
    });
  };

  const runStoreMutation = async (
    operation: () => Promise<unknown>,
    successMessage: string,
  ): Promise<void> => {
    try {
      await operation();
      syncChoiceIndex();
      setFooterMessage(successMessage);
      emit();
    } catch (error) {
      setFooterMessage(error instanceof Error ? error.message : String(error));
      emit();
    }
  };

  const selectProvider = async (providerId: ProviderId): Promise<void> => {
    const providerView = getState().providerViews.find(
      (candidateProviderView) => candidateProviderView.id === providerId,
    );

    if (providerView !== undefined && !providerView.enabled) {
      setLocalState({
        ...localState,
        focusedProviderId: providerId,
      });
      syncChoiceIndex();
      setFooterMessage(`Viewing disabled ${providerId}. Open settings to re-enable it.`);
      emit();
      return;
    }

    try {
      await options.appStore.selectProvider(providerId);
      setLocalState({
        ...localState,
        focusedProviderId: getState().selectedProviderId,
      });
      syncChoiceIndex();
      setFooterMessage(`Selected ${getState().selectedProviderId}.`);
      emit();
    } catch (error) {
      setFooterMessage(error instanceof Error ? error.message : String(error));
      emit();
    }
  };

  const selectProviderByOffset = async (offset: -1 | 1): Promise<void> => {
    const providerIds = getState().providerViews.map((providerView) => providerView.id);
    const currentIndex = providerIds.indexOf(getFocusedProvider().id);
    const nextIndex = (currentIndex + offset + providerIds.length) % providerIds.length;
    const nextProviderId = providerIds[nextIndex];

    if (nextProviderId !== undefined) {
      await selectProvider(nextProviderId);
    }
  };

  const setSelectedSettingsIndex = (index: number): void => {
    setLocalState({
      ...localState,
      modalFocus: localState.tokenAccountEditor === null ? "items" : "editor",
      selectedSettingsIndex: index,
    });
    syncChoiceIndex();
    emit();
  };

  const setSelectedChoiceIndex = (index: number): void => {
    setLocalState({
      ...localState,
      selectedChoiceIndex: index,
    });
    emit();
  };

  const focusModalItems = (): void => {
    setLocalState({
      ...localState,
      modalFocus: localState.tokenAccountEditor === null ? "items" : "editor",
    });
    emit();
  };

  const focusModalChoices = (): void => {
    const selectedItem = getSelectedSettingsItem();

    if (
      selectedItem === null ||
      selectedItem.choices.length === 0 ||
      localState.tokenAccountEditor !== null
    ) {
      return;
    }

    setLocalState({
      ...localState,
      modalFocus: "choices",
    });
    syncChoiceIndex();
    emit();
  };

  const openSettings = (): void => {
    setLocalState({
      ...localState,
      focusedProviderId: getFocusedProvider().id,
      footerMessage: null,
      isSettingsOpen: true,
      modalFocus: "items",
      tokenAccountEditor: null,
    });
    syncChoiceIndex();
    emit();
  };

  const closeSettings = (): void => {
    setLocalState({
      ...localState,
      footerMessage: "Closed settings.",
      isSettingsOpen: false,
      modalFocus: "items",
      tokenAccountEditor: null,
    });
    emit();
  };

  const requestQuit = (): void => {
    setLocalState({
      ...localState,
      quitRequested: true,
    });
    emit();
  };

  const refreshSelectedProvider = async (): Promise<void> => {
    const providerId = getFocusedProvider().id;

    if (!getFocusedProvider().enabled) {
      setFooterMessage(`Enable ${providerId} before refreshing it.`);
      emit();
      return;
    }

    setFooterMessage(`Refreshing ${providerId}...`);
    emit();

    try {
      const refreshResult = await options.appStore.refreshProvider(providerId);

      setFooterMessage(refreshResult.message ?? `Refreshed ${providerId}.`);
      emit();
    } catch (error) {
      setFooterMessage(error instanceof Error ? error.message : String(error));
      emit();
    }
  };

  const updateCurrentProviderEnabled = async (enabled: boolean): Promise<void> => {
    const providerId = getFocusedProvider().id;

    try {
      await options.appStore.setProviderEnabled(providerId, enabled);

      if (enabled) {
        await options.appStore.selectProvider(providerId);
      }

      setLocalState({
        ...localState,
        focusedProviderId: providerId,
      });
      syncChoiceIndex();
      setFooterMessage(`${enabled ? "Enabled" : "Disabled"} ${providerId}.`);
      emit();
    } catch (error) {
      setFooterMessage(error instanceof Error ? error.message : String(error));
      emit();
    }
  };

  const choiceHandlers: Record<string, TuiSettingsChoiceHandler> = {
    "claude:active-token-account": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setClaudeConfig((providerConfig) => ({
            ...providerConfig,
            activeTokenAccountIndex: Number(choice.value),
          })),
        `Selected Claude token account ${choice.label}.`,
      ),
    "claude:cookie-source": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setClaudeConfig((providerConfig) => ({
            ...providerConfig,
            cookieSource: normalizeClaudeCookieSource(choice.value),
          })),
        `Set Claude cookie mode to ${choice.label}.`,
      ),
    "claude:source": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setClaudeConfig((providerConfig) => ({
            ...providerConfig,
            source: normalizeClaudeSource(choice.value),
          })),
        `Set Claude usage source to ${choice.label}.`,
      ),
    "codex:cookie-source": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setCodexConfig((providerConfig) => ({
            ...providerConfig,
            cookieSource: normalizeCodexCookieSource(choice.value),
          })),
        `Set Codex cookie mode to ${choice.label}.`,
      ),
    "codex:historical-tracking": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setCodexConfig((providerConfig) => ({
            ...providerConfig,
            historicalTrackingEnabled: choice.value === "on",
          })),
        `${choice.value === "on" ? "Enabled" : "Disabled"} Codex historical tracking.`,
      ),
    "codex:source": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setCodexConfig((providerConfig) => ({
            ...providerConfig,
            source: normalizeCodexSource(choice.value),
          })),
        `Set Codex usage source to ${choice.label}.`,
      ),
    "codex:web-extras": async (choice) =>
      runStoreMutation(
        () =>
          options.appStore.setCodexConfig((providerConfig) => ({
            ...providerConfig,
            extrasEnabled: choice.value === "on",
          })),
        `${choice.value === "on" ? "Enabled" : "Disabled"} Codex web extras.`,
      ),
    "shared:enabled": async (choice) => updateCurrentProviderEnabled(choice.value === "on"),
  };

  const updateSelectedChoice = async (
    item: TuiSettingsItemDescriptor,
    choice: TuiSettingsChoice,
  ): Promise<void> => {
    const choiceHandler = choiceHandlers[item.id];

    if (choiceHandler !== undefined) {
      await choiceHandler(choice);
    }
  };

  const startClaudeTokenAccountEditor = (): void => {
    setLocalState(openClaudeTokenAccountEditor(localState));
    emit();
  };

  const removeActiveClaudeTokenAccount = async (): Promise<void> => {
    const providerView = getFocusedProvider();

    if (providerView.id !== "claude" || providerView.settings.tokenAccounts.length === 0) {
      return;
    }

    const activeTokenAccount =
      providerView.settings.tokenAccounts[providerView.settings.activeTokenAccountIndex];

    await runStoreMutation(
      () =>
        options.appStore.setClaudeConfig((providerConfig) => ({
          ...providerConfig,
          tokenAccounts: providerConfig.tokenAccounts.filter(
            (_tokenAccount, index) => index !== providerConfig.activeTokenAccountIndex,
          ),
        })),
      `Removed Claude token account ${activeTokenAccount?.label ?? "account"}.`,
    );
  };

  const actionHandlers: Record<string, TuiSettingsActionHandler> = {
    "claude:add-token-account": async () => {
      startClaudeTokenAccountEditor();
    },
    "claude:remove-token-account": removeActiveClaudeTokenAccount,
  };

  const itemActivationHandlers: Record<
    TuiSettingsItemDescriptor["kind"],
    TuiSettingsItemActivationHandler
  > = {
    action: async (item) => {
      const actionHandler = actionHandlers[item.id];

      if (actionHandler !== undefined) {
        await actionHandler();
      }
    },
    readonly: async () => {},
    select: async () => {
      focusModalChoices();
    },
    toggle: async (item) => {
      const nextChoice = item.choices.find((choice) => choice.value !== item.currentValue);

      if (nextChoice !== undefined) {
        await updateSelectedChoice(item, nextChoice);
      }
    },
  };

  const activateSelectedSettingsItem = async (): Promise<void> => {
    const selectedItem = getSelectedSettingsItem();

    if (selectedItem === null || !selectedItem.enabled) {
      return;
    }

    await itemActivationHandlers[selectedItem.kind](selectedItem);
  };

  const applySelectedChoice = async (): Promise<void> => {
    const selectedItem = getSelectedSettingsItem();

    if (
      selectedItem === null ||
      selectedItem.kind !== "select" ||
      selectedItem.choices.length === 0 ||
      !selectedItem.enabled
    ) {
      return;
    }

    const selectedChoice = selectedItem.choices[localState.selectedChoiceIndex];

    if (selectedChoice === undefined) {
      return;
    }

    await updateSelectedChoice(selectedItem, selectedChoice);
    setLocalState({
      ...localState,
      modalFocus: "items",
    });
    emit();
  };

  const cancelTokenAccountEditor = (): void => {
    setLocalState(cancelClaudeTokenAccountEditor(localState));
    emit();
  };

  const switchTokenAccountEditorField = (): void => {
    setLocalState(switchClaudeTokenAccountEditorField(localState));
    emit();
  };

  const appendTokenAccountEditorText = (value: string): void => {
    setLocalState(appendClaudeTokenAccountEditorText(localState, value));
    emit();
  };

  const deleteTokenAccountEditorText = (): void => {
    setLocalState(deleteClaudeTokenAccountEditorText(localState));
    emit();
  };

  const submitTokenAccountEditor = async (): Promise<void> => {
    if (localState.tokenAccountEditor === null) {
      return;
    }

    const trimmedLabel = localState.tokenAccountEditor.label.trim();
    const trimmedToken = localState.tokenAccountEditor.token.trim();

    if (trimmedLabel === "" || trimmedToken === "") {
      setLocalState(
        setClaudeTokenAccountEditorError(localState, "Both label and token are required."),
      );
      emit();
      return;
    }

    await runStoreMutation(
      () =>
        options.appStore.setClaudeConfig((providerConfig) => ({
          ...providerConfig,
          activeTokenAccountIndex: providerConfig.tokenAccounts.length,
          tokenAccounts: [
            ...providerConfig.tokenAccounts,
            {
              label: trimmedLabel,
              token: trimmedToken,
            },
          ],
        })),
      `Added Claude token account ${trimmedLabel}.`,
    );
    setLocalState(closeClaudeTokenAccountEditor(localState));
    emit();
  };

  const handleEditorKeyPress = (key: TuiKeyInput): boolean => {
    if (localState.tokenAccountEditor === null) {
      return false;
    }

    if (key.name === "escape") {
      cancelTokenAccountEditor();
      return true;
    }

    if (isTabKey(key)) {
      switchTokenAccountEditorField();
      return true;
    }

    if (isBackspaceKey(key)) {
      deleteTokenAccountEditorText();
      return true;
    }

    if (isEnterKey(key)) {
      if (localState.tokenAccountEditor.field === "label") {
        switchTokenAccountEditorField();
      } else {
        void submitTokenAccountEditor();
      }
      return true;
    }

    if (isPrintableKey(key)) {
      appendTokenAccountEditorText(key.sequence);
      return true;
    }

    if (isArrowKey(key)) {
      return true;
    }

    return false;
  };

  const handleSettingsModalKeyPress = (key: TuiKeyInput): boolean => {
    if (!localState.isSettingsOpen) {
      return false;
    }

    if (
      isDigitShortcut(key) ||
      key.name === "h" ||
      key.name === "l" ||
      key.name === "left" ||
      key.name === "right"
    ) {
      return true;
    }

    if (key.name === "escape") {
      closeSettings();
      return true;
    }

    if (isTabKey(key)) {
      if (localState.modalFocus === "choices") {
        focusModalItems();
      } else {
        focusModalChoices();
      }

      return true;
    }

    if (isEnterKey(key)) {
      if (localState.modalFocus === "choices") {
        void applySelectedChoice();
      } else {
        void activateSelectedSettingsItem();
      }

      return true;
    }

    if (key.name === "space") {
      void activateSelectedSettingsItem();
      return true;
    }

    return false;
  };

  const handleProviderNavigationKeyPress = (key: TuiKeyInput): boolean => {
    if (key.name === "h" || key.name === "left") {
      void selectProviderByOffset(-1);
      return true;
    }

    if (key.name === "l" || key.name === "right") {
      void selectProviderByOffset(1);
      return true;
    }

    if (!isDigitShortcut(key)) {
      return false;
    }

    const providerIndex = Number(key.name) - 1;
    const providerId = options.appStore.getState().providerViews[providerIndex]?.id;

    if (providerId === undefined) {
      return false;
    }

    void selectProvider(providerId);
    return true;
  };

  const handleKeyPress = (key: TuiKeyInput): boolean => {
    if (key.ctrl && key.name === "c") {
      requestQuit();
      return true;
    }

    if (handleEditorKeyPress(key)) {
      return true;
    }

    if (key.name === "q") {
      requestQuit();
      return true;
    }

    if (key.name === "r") {
      void refreshSelectedProvider();
      return true;
    }

    if (key.name === ",") {
      openSettings();
      return true;
    }

    if (handleSettingsModalKeyPress(key)) {
      return true;
    }

    return handleProviderNavigationKeyPress(key);
  };

  const unsubscribeFromStore = options.appStore.subscribe(() => {
    clampSelection();
    emit();
  });

  return {
    activateSelectedSettingsItem,
    applySelectedChoice,
    closeSettings,
    destroy: (): void => {
      unsubscribeFromStore();
      listeners.clear();
    },
    focusModalChoices,
    focusModalItems,
    getSnapshot: (): TuiControllerSnapshot => ({
      localState,
      state: getState(),
    }),
    handleKeyPress,
    openSettings,
    refreshSelectedProvider,
    requestQuit,
    selectProvider,
    setSelectedChoiceIndex,
    setSelectedSettingsIndex,
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
