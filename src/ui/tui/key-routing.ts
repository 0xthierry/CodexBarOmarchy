import type { ProviderId, ProviderView, TuiKeyInput, TuiLocalState } from "@/ui/tui/types.ts";

interface ActivateSelectedSettingsItemAction {
  type: "activateSelectedSettingsItem";
}

interface ApplySelectedChoiceAction {
  type: "applySelectedChoice";
}

interface CloseSettingsAction {
  type: "closeSettings";
}

interface FocusModalChoicesAction {
  type: "focusModalChoices";
}

interface FocusModalItemsAction {
  type: "focusModalItems";
}

interface OpenSettingsAction {
  type: "openSettings";
}

interface RefreshSelectedProviderAction {
  type: "refreshSelectedProvider";
}

interface RequestQuitAction {
  type: "requestQuit";
}

interface SelectProviderAction {
  providerId: ProviderId;
  type: "selectProvider";
}

interface SelectProviderByOffsetAction {
  offset: -1 | 1;
  type: "selectProviderByOffset";
}

interface SuppressNavigationAction {
  type: "suppressNavigation";
}

type TuiControllerKeyAction =
  | ActivateSelectedSettingsItemAction
  | ApplySelectedChoiceAction
  | CloseSettingsAction
  | FocusModalChoicesAction
  | FocusModalItemsAction
  | OpenSettingsAction
  | RefreshSelectedProviderAction
  | RequestQuitAction
  | SelectProviderAction
  | SelectProviderByOffsetAction
  | SuppressNavigationAction;

const isDigitShortcut = (key: TuiKeyInput): boolean => /^[1-9]$/.test(key.name);
const isEnterKey = (key: TuiKeyInput): boolean => key.name === "enter" || key.name === "return";
const isTabKey = (key: TuiKeyInput): boolean => key.name === "tab";

const resolveSettingsModalKeyAction = (
  localState: TuiLocalState,
  key: TuiKeyInput,
): TuiControllerKeyAction | null => {
  if (!localState.isSettingsOpen) {
    return null;
  }

  if (
    isDigitShortcut(key) ||
    key.name === "h" ||
    key.name === "l" ||
    key.name === "left" ||
    key.name === "right"
  ) {
    return { type: "suppressNavigation" };
  }

  if (key.name === "escape") {
    return { type: "closeSettings" };
  }

  if (isTabKey(key)) {
    return {
      type: localState.modalFocus === "choices" ? "focusModalItems" : "focusModalChoices",
    };
  }

  if (isEnterKey(key)) {
    return {
      type:
        localState.modalFocus === "choices"
          ? "applySelectedChoice"
          : "activateSelectedSettingsItem",
    };
  }

  if (key.name === "space") {
    return { type: "activateSelectedSettingsItem" };
  }

  return null;
};

const resolveProviderNavigationKeyAction = (
  providerViews: ProviderView[],
  key: TuiKeyInput,
): TuiControllerKeyAction | null => {
  if (key.name === "h" || key.name === "left") {
    return { offset: -1, type: "selectProviderByOffset" };
  }

  if (key.name === "l" || key.name === "right") {
    return { offset: 1, type: "selectProviderByOffset" };
  }

  if (!isDigitShortcut(key)) {
    return null;
  }

  const providerId = providerViews[Number(key.name) - 1]?.id;

  if (providerId === undefined) {
    return null;
  }

  return { providerId, type: "selectProvider" };
};

const resolveTuiControllerKeyAction = (input: {
  key: TuiKeyInput;
  localState: TuiLocalState;
  providerViews: ProviderView[];
}): TuiControllerKeyAction | null => {
  if (input.key.ctrl && input.key.name === "c") {
    return { type: "requestQuit" };
  }

  if (input.key.name === "q") {
    return { type: "requestQuit" };
  }

  if (input.key.name === "r") {
    return { type: "refreshSelectedProvider" };
  }

  if (input.key.name === ",") {
    return { type: "openSettings" };
  }

  return (
    resolveSettingsModalKeyAction(input.localState, input.key) ??
    resolveProviderNavigationKeyAction(input.providerViews, input.key)
  );
};

export { resolveTuiControllerKeyAction, type TuiControllerKeyAction };
