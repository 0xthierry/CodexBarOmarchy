import { findCurrentChoiceLabel, getSettingsItems } from "@/ui/tui/descriptors.ts";
import { humanizeValue, truncate } from "@/ui/tui/presenter-formatters.ts";
import type {
  ProviderView,
  TuiLocalState,
  TuiModalViewModel,
  TuiSettingsItemDescriptor,
} from "@/ui/tui/types.ts";

const shortLabel = (label: string): string => {
  if (label === "Historical tracking") {
    return "History";
  }

  if (label === "OpenAI web extras") {
    return "Web extras";
  }

  if (label === "Usage source") {
    return "Usage";
  }

  if (label === "Active token account") {
    return "Active token";
  }

  return label;
};

const formatSummaryValue = (item: TuiSettingsItemDescriptor): string => {
  if (item.kind === "action") {
    return "Run";
  }

  return humanizeValue(findCurrentChoiceLabel(item));
};

const createConfigLines = (providerView: ProviderView): string[] => {
  const summaryItems = getSettingsItems(providerView).filter((item) => item.kind !== "action");

  return summaryItems.map(
    (item) =>
      `${truncate(shortLabel(item.label), 14).padEnd(14, " ")} ${truncate(formatSummaryValue(item), 24)}`,
  );
};

const buildModalDetailLines = (
  providerView: ProviderView,
  item: TuiSettingsItemDescriptor | null,
): string[] => {
  if (item === null) {
    return ["No settings available."];
  }

  if (item.id === "claude:token-account-list" && providerView.id === "claude") {
    return [
      item.note,
      ...providerView.settings.tokenAccounts.map(
        (tokenAccount, index) =>
          `${index === providerView.settings.activeTokenAccountIndex ? ">" : " "} ${tokenAccount.label}`,
      ),
    ];
  }

  if (item.id === "claude:active-token-account" && providerView.id === "claude") {
    return [
      item.note,
      ...(item.choices.length === 0
        ? ["No saved accounts."]
        : item.choices.map((choice) => {
            const marker = choice.value === item.currentValue ? ">" : " ";

            return `${marker} ${choice.label}`;
          })),
    ];
  }

  return [
    item.note,
    `Current: ${humanizeValue(findCurrentChoiceLabel(item))}`,
    `Type: ${item.kind}`,
    item.enabled ? "State: editable" : "State: read-only",
  ];
};

const createEditorLines = (localState: TuiLocalState): string[] => {
  if (localState.tokenAccountEditor === null) {
    return [];
  }

  const labelPrefix = localState.tokenAccountEditor.field === "label" ? ">" : " ";
  const tokenPrefix = localState.tokenAccountEditor.field === "token" ? ">" : " ";

  return [
    "Add Claude token account",
    `${labelPrefix} label  ${localState.tokenAccountEditor.label}`,
    `${tokenPrefix} token  ${"*".repeat(localState.tokenAccountEditor.token.length)}`,
    ...(localState.tokenAccountEditor.errorMessage === null
      ? []
      : [localState.tokenAccountEditor.errorMessage]),
  ];
};

const createModalViewModel = (
  providerView: ProviderView,
  localState: TuiLocalState,
): TuiModalViewModel => {
  const settingsItems = getSettingsItems(providerView);
  const selectedItem =
    settingsItems[
      Math.max(0, Math.min(localState.selectedSettingsIndex, Math.max(0, settingsItems.length - 1)))
    ] ?? null;

  return {
    choices: selectedItem?.choices ?? [],
    detailLines: buildModalDetailLines(providerView, selectedItem),
    editorLines: createEditorLines(localState),
    focus: localState.modalFocus,
    footer:
      localState.tokenAccountEditor === null
        ? "Tab switch focus  •  Enter apply  •  Esc close"
        : "Type to edit  •  Tab switch field  •  Enter save  •  Esc cancel",
    selectedChoiceIndex: localState.selectedChoiceIndex,
    selectedItemIndex: localState.selectedSettingsIndex,
    settingsItems,
    subtitleLines: [
      `${providerView.id.toUpperCase()}  ${providerView.status.sourceLabel ?? "awaiting refresh"}`,
      `${humanizeValue(providerView.status.identity.planLabel ?? "unknown")}  •  ${providerView.enabled ? "enabled" : "disabled"}`,
    ],
    title: `settings • ${providerView.id}`,
  };
};

export { createConfigLines, createModalViewModel };
