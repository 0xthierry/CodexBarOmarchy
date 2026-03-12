import { getSettingsItems } from "@/ui/tui/descriptors.ts";
import { resolveTuiControllerKeyAction } from "@/ui/tui/key-routing.ts";
import {
  appendClaudeTokenAccountEditorText,
  cancelClaudeTokenAccountEditor,
  closeClaudeTokenAccountEditor,
  deleteClaudeTokenAccountEditorText,
  openClaudeTokenAccountEditor,
  readClaudeTokenAccountEditorSubmission,
  resolveClaudeTokenAccountEditorKeyAction,
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
    const submission = readClaudeTokenAccountEditorSubmission(localState);

    if (submission === null) {
      return;
    }

    if (!submission.ok) {
      setLocalState(setClaudeTokenAccountEditorError(localState, submission.errorMessage));
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
              label: submission.label,
              token: submission.token,
            },
          ],
        })),
      `Added Claude token account ${submission.label}.`,
    );
    setLocalState(closeClaudeTokenAccountEditor(localState));
    emit();
  };

  const handleEditorKeyPress = (key: TuiKeyInput): boolean => {
    const action = resolveClaudeTokenAccountEditorKeyAction(localState, key);

    if (action === null) {
      return false;
    }

    if (action.type === "cancel") {
      cancelTokenAccountEditor();
      return true;
    }

    if (action.type === "switchField") {
      switchTokenAccountEditorField();
      return true;
    }

    if (action.type === "deleteText") {
      deleteTokenAccountEditorText();
      return true;
    }

    if (action.type === "submit") {
      void submitTokenAccountEditor();
      return true;
    }

    if (action.type === "appendText") {
      appendTokenAccountEditorText(action.value);
      return true;
    }

    if (action.type === "ignore") {
      return true;
    }

    return false;
  };

  const handleKeyPress = (key: TuiKeyInput): boolean => {
    if (handleEditorKeyPress(key)) {
      return true;
    }
    const action = resolveTuiControllerKeyAction({
      key,
      localState,
      providerViews: getState().providerViews,
    });

    if (action === null) {
      return false;
    }

    if (action.type === "requestQuit") {
      requestQuit();
      return true;
    }

    if (action.type === "refreshSelectedProvider") {
      void refreshSelectedProvider();
      return true;
    }

    if (action.type === "openSettings") {
      openSettings();
      return true;
    }

    if (action.type === "closeSettings") {
      closeSettings();
      return true;
    }

    if (action.type === "focusModalItems") {
      focusModalItems();
      return true;
    }

    if (action.type === "focusModalChoices") {
      focusModalChoices();
      return true;
    }

    if (action.type === "activateSelectedSettingsItem") {
      void activateSelectedSettingsItem();
      return true;
    }

    if (action.type === "applySelectedChoice") {
      void applySelectedChoice();
      return true;
    }

    if (action.type === "selectProviderByOffset") {
      void selectProviderByOffset(action.offset);
      return true;
    }

    if (action.type === "selectProvider") {
      void selectProvider(action.providerId);
      return true;
    }

    if (action.type === "suppressNavigation") {
      return true;
    }

    return false;
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
