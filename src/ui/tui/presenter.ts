import type { ProviderId, ProviderView, TuiLocalState } from "@/ui/tui/types.ts";
import type { TuiTabViewModel, TuiViewModel } from "@/ui/tui/types.ts";
import type { AppStoreState } from "@/core/store/state.ts";
import { humanizeValue, truncate } from "@/ui/tui/presenter-formatters.ts";
import {
  createDetailsLines,
  createUsageBanner,
  createUsageLines,
  formatHeaderClockDisplay,
  formatProviderHealthLabel,
  formatUpdatedDisplay,
  maskEmailAddress,
  parseIsoDate,
} from "@/ui/tui/runtime-presentation.ts";
import { createConfigLines, createModalViewModel } from "@/ui/tui/settings-presentation.ts";

const appTitle = "agent-stats";

const getSelectedProvider = (state: AppStoreState, localState: TuiLocalState): ProviderView => {
  const focusedProviderId = localState.focusedProviderId ?? state.selectedProviderId;
  const selectedProvider = state.providerViews.find(
    (providerView) => providerView.id === focusedProviderId,
  );

  if (selectedProvider !== undefined) {
    return selectedProvider;
  }

  const fallbackProvider = state.providerViews[0];

  if (fallbackProvider === undefined) {
    throw new Error("Expected at least one provider view.");
  }

  return fallbackProvider;
};

const createTabs = (state: AppStoreState, localState: TuiLocalState): TuiTabViewModel[] =>
  state.providerViews.map((providerView) => ({
    enabled: providerView.enabled,
    id: providerView.id,
    label: providerView.enabled ? providerView.id : `${providerView.id} off`,
    selected: providerView.id === (localState.focusedProviderId ?? state.selectedProviderId),
  }));

const createHeaderLines = (providerView: ProviderView, now: Date): string[] => {
  const summaryParts = [
    formatHeaderClockDisplay(now),
    humanizeValue(providerView.status.identity.planLabel ?? "unknown"),
    humanizeValue(providerView.status.state),
  ];

  return [
    `${providerView.id.toUpperCase()}  ${providerView.status.sourceLabel ?? "awaiting refresh"}`,
    summaryParts.join("  •  "),
  ];
};

const createMenuLines = (selectedProviderId: ProviderId): string[] => [
  `provider  1-3 select  •  h/l move  •  current ${selectedProviderId}`,
  "provider  , settings  •  r refresh",
  "app       q quit  •  Ctrl+C emergency exit",
];

const createFooter = (state: AppStoreState, localState: TuiLocalState): string => {
  if (typeof localState.footerMessage === "string" && localState.footerMessage !== "") {
    return localState.footerMessage;
  }

  const selectedProvider = getSelectedProvider(state, localState);

  if (selectedProvider.actions.refresh.status === "running") {
    return `Refreshing ${selectedProvider.id}...`;
  }

  if (selectedProvider.actions.refresh.status === "error") {
    return selectedProvider.actions.refresh.message ?? `${selectedProvider.id} refresh failed.`;
  }

  return "Keyboard-first runtime view over the headless app store.";
};

const createTuiViewModel = (
  state: AppStoreState,
  localState: TuiLocalState,
  now: Date = new Date(),
): TuiViewModel => {
  const selectedProvider = getSelectedProvider(state, localState);

  return {
    configLines: createConfigLines(selectedProvider),
    detailsLines: createDetailsLines(selectedProvider, now),
    footer: createFooter(state, localState),
    headerLines: createHeaderLines(selectedProvider, now),
    menuLines: createMenuLines(selectedProvider.id),
    modal: localState.isSettingsOpen ? createModalViewModel(selectedProvider, localState) : null,
    tabs: createTabs(state, localState),
    title: appTitle,
    usageBanner: createUsageBanner(selectedProvider),
    usageLines: createUsageLines(selectedProvider, now),
  };
};

export {
  createTuiViewModel,
  formatHeaderClockDisplay,
  formatUpdatedDisplay,
  humanizeValue,
  maskEmailAddress,
  formatProviderHealthLabel,
  parseIsoDate,
  truncate,
};
