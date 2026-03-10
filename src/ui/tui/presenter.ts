import { findCurrentChoiceLabel, getSettingsItems } from "@/ui/tui/descriptors.ts";
import type {
  ProviderId,
  ProviderView,
  TuiLocalState,
  TuiSettingsItemDescriptor,
} from "@/ui/tui/types.ts";
import type { TuiModalViewModel, TuiTabViewModel, TuiViewModel } from "@/ui/tui/types.ts";
import type { AppStoreState } from "@/core/store/state.ts";

const appTitle = "omarchy-agent-bar";

const formatTimestamp = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatShortTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatMonthDayTime = (value: Date): string =>
  `${value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} ${formatShortTime(value)}`;

const isSameLocalDate = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const parseIsoDate = (value: string): Date | null => {
  if (!value.includes("T")) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const humanizeValue = (value: string): string => {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "oauth") {
    return "OAuth";
  }

  if (normalizedValue === "cli") {
    return "CLI";
  }

  if (normalizedValue === "api") {
    return "API";
  }

  if (normalizedValue === "web") {
    return "Web";
  }

  if (normalizedValue === "on") {
    return "On";
  }

  if (normalizedValue === "off") {
    return "Off";
  }

  if (normalizedValue === "auto") {
    return "Auto";
  }

  if (normalizedValue === "manual") {
    return "Manual";
  }

  if (normalizedValue === "run") {
    return "Run";
  }

  if (normalizedValue === "ready") {
    return "Ready";
  }

  if (normalizedValue === "idle") {
    return "Idle";
  }

  if (normalizedValue === "refreshing") {
    return "Refreshing";
  }

  if (normalizedValue === "error") {
    return "Error";
  }

  if (normalizedValue === "none") {
    return "None";
  }

  return value;
};

const describeMetric = (label: string, detail: string | null): string | null => {
  if (typeof detail === "string" && detail.trim() !== "") {
    const parsed = parseIsoDate(detail);

    if (parsed !== null) {
      const now = new Date();

      if (isSameLocalDate(parsed, now)) {
        return `Resets today ${formatShortTime(parsed)}`;
      }

      return `Resets ${formatMonthDayTime(parsed)}`;
    }

    return detail;
  }

  if (label === "Session") {
    return "Current session window";
  }

  if (label === "Weekly") {
    return "Current weekly window";
  }

  if (label === "Credits") {
    return "OpenAI credit balance";
  }

  if (label === "Sonnet") {
    return "Current Sonnet window";
  }

  if (label === "Flash" || label === "Pro") {
    return "Current Gemini quota window";
  }

  return null;
};

const formatUpdatedDisplay = (value: string | null): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return "Never refreshed";
  }

  const parsed = parseIsoDate(value);

  if (parsed === null) {
    return value;
  }

  const now = new Date();

  if (isSameLocalDate(parsed, now)) {
    return `Today ${formatTimestamp(parsed)}`;
  }

  return formatMonthDayTime(parsed);
};

const getSelectedProvider = (state: AppStoreState): ProviderView => {
  const selectedProvider = state.providerViews.find(
    (providerView) => providerView.id === state.selectedProviderId,
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

const createTabs = (state: AppStoreState): TuiTabViewModel[] =>
  state.providerViews.map((providerView) => ({
    enabled: providerView.enabled,
    id: providerView.id,
    label: providerView.enabled ? providerView.id : `${providerView.id} off`,
    selected: providerView.id === state.selectedProviderId,
  }));

const createHeaderLines = (providerView: ProviderView): string[] => {
  const summaryParts = [
    formatUpdatedDisplay(providerView.status.updatedAt),
    humanizeValue(providerView.status.planLabel ?? "unknown"),
    humanizeValue(providerView.status.state),
  ];

  return [
    `${providerView.id.toUpperCase()}  ${providerView.status.sourceLabel ?? "awaiting refresh"}`,
    summaryParts.join("  •  "),
  ];
};

const createUsageLines = (providerView: ProviderView): string[] => {
  if (providerView.status.metrics.length === 0) {
    return ["No usage data yet.", "Press r to refresh the selected provider."];
  }

  const lines = providerView.status.metrics.flatMap((metric, metricIndex) => {
    const detail = describeMetric(metric.label, metric.detail);
    const ratioMatch = /^(\d+)(?:\.\d+)?%$/.exec(metric.value.trim());
    const ratio = ratioMatch === null ? null : Math.max(0, Math.min(100, Number(ratioMatch[1])));
    const filledCount = ratio === null ? 0 : Math.round((ratio / 100) * 16);
    const meter = ratio === null ? "" : `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;

    return [
      `${metric.label.padEnd(12, " ")}${metric.value}`,
      ...(meter === "" ? [] : [meter]),
      ...(detail === null ? [] : [detail]),
      ...(metricIndex === providerView.status.metrics.length - 1 ? [] : [""]),
    ];
  });

  if (providerView.status.latestError !== null) {
    lines.push("", `Latest error: ${providerView.status.latestError}`);
  }

  return lines;
};

const createDetailsLines = (providerView: ProviderView): string[] => {
  const rows: [string, string][] = [
    ["state", humanizeValue(providerView.status.state)],
    ["source", humanizeValue(providerView.status.sourceLabel ?? "unknown")],
    ["version", providerView.status.version ?? "unknown"],
    ["updated", formatUpdatedDisplay(providerView.status.updatedAt)],
    ["account", providerView.status.accountEmail ?? "unknown"],
    ["plan", providerView.status.planLabel ?? "unknown"],
  ];

  if (providerView.status.latestError !== null) {
    rows.push(["error", providerView.status.latestError]);
  }

  return rows.map(([label, value]) => `${label.padEnd(8, " ")} ${value}`);
};

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

const createMenuLines = (selectedProviderId: ProviderId): string[] => [
  `provider  1-3 select  •  h/l move  •  current ${selectedProviderId}`,
  "provider  , settings  •  r refresh",
  "app       q quit  •  Ctrl+C emergency exit",
];

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
      `${humanizeValue(providerView.status.planLabel ?? "unknown")}  •  ${providerView.enabled ? "enabled" : "disabled"}`,
    ],
    title: `settings • ${providerView.id}`,
  };
};

const createFooter = (state: AppStoreState, localState: TuiLocalState): string => {
  if (typeof localState.footerMessage === "string" && localState.footerMessage !== "") {
    return localState.footerMessage;
  }

  const selectedProvider = getSelectedProvider(state);

  if (selectedProvider.actions.refresh.status === "running") {
    return `Refreshing ${selectedProvider.id}...`;
  }

  if (selectedProvider.actions.refresh.status === "error") {
    return selectedProvider.actions.refresh.message ?? `${selectedProvider.id} refresh failed.`;
  }

  return "Keyboard-first runtime view over the headless app store.";
};

const createTuiViewModel = (state: AppStoreState, localState: TuiLocalState): TuiViewModel => {
  const selectedProvider = getSelectedProvider(state);

  return {
    configLines: createConfigLines(selectedProvider),
    detailsLines: createDetailsLines(selectedProvider),
    footer: createFooter(state, localState),
    headerLines: createHeaderLines(selectedProvider),
    menuLines: createMenuLines(selectedProvider.id),
    modal: localState.isSettingsOpen ? createModalViewModel(selectedProvider, localState) : null,
    tabs: createTabs(state),
    title: appTitle,
    usageLines: createUsageLines(selectedProvider),
  };
};

export { createTuiViewModel, formatUpdatedDisplay, humanizeValue, parseIsoDate, truncate };
