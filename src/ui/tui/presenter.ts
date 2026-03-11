import { findCurrentChoiceLabel, getSettingsItems } from "@/ui/tui/descriptors.ts";
import type { ProviderCostSnapshot } from "@/core/store/runtime-state.ts";
import type {
  ProviderId,
  ProviderView,
  TuiLocalState,
  TuiSettingsItemDescriptor,
  TuiUsageBannerViewModel,
} from "@/ui/tui/types.ts";
import type { TuiModalViewModel, TuiTabViewModel, TuiViewModel } from "@/ui/tui/types.ts";
import type { AppStoreState } from "@/core/store/state.ts";

const appTitle = "agent-stats";

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

const maskEmailAddress = (value: string | null): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return "unknown";
  }

  const separatorIndex = value.indexOf("@");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return value;
  }

  const localPart = value.slice(0, separatorIndex);
  const domainPart = value.slice(separatorIndex + 1);
  const targetPrefixLength = 3;
  const targetSuffixLength = 2;
  const visiblePrefixLength = Math.max(
    1,
    Math.min(targetPrefixLength, localPart.length - targetSuffixLength - 1),
  );
  const remainingLength = localPart.length - visiblePrefixLength;
  const visibleSuffixLength =
    remainingLength <= 1 ? 0 : Math.min(targetSuffixLength, remainingLength - 1);
  const visibleSuffix =
    visibleSuffixLength === 0 ? "" : localPart.slice(localPart.length - visibleSuffixLength);

  return `${localPart.slice(0, visiblePrefixLength)}****${visibleSuffix}@${domainPart}`;
};

const formatProviderHealthLabel = (value: ProviderView["status"]["serviceStatus"]): string => {
  if (value === null) {
    return "Unknown";
  }

  if (value.indicator === "none") {
    return "Operational";
  }

  if (value.indicator === "maintenance") {
    return "Maintenance";
  }

  if (value.indicator === "minor") {
    return "Minor issue";
  }

  if (value.indicator === "major") {
    return "Major issue";
  }

  if (value.indicator === "critical") {
    return "Critical outage";
  }

  return "Unknown";
};

const formatCurrencyAmount = (value: number, currencyCode: string): string =>
  `${currencyCode} ${value.toFixed(2)}`;

const formatProviderCostLabel = (value: ProviderCostSnapshot): string => {
  const periodSuffix =
    value.periodLabel === null || value.periodLabel.trim() === "" ? "" : ` ${value.periodLabel}`;

  return `${formatCurrencyAmount(value.used, value.currencyCode)} / ${formatCurrencyAmount(value.limit, value.currencyCode)}${periodSuffix}`;
};

const getProviderCostPercent = (value: ProviderCostSnapshot): number | null => {
  if (value.limit <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((value.used / value.limit) * 100)));
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

const formatHeaderClockDisplay = (value: Date): string => `Today ${formatTimestamp(value)}`;

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

const getOrderedUsageMetrics = (
  providerView: ProviderView,
): {
  detail: string | null;
  label: string;
  value: string;
}[] => {
  const metrics: {
    detail: string | null;
    label: string;
    value: string;
  }[] = [];
  const { usage } = providerView.status;

  if (usage.windows.session !== null) {
    metrics.push(usage.windows.session);
  }

  if (usage.windows.weekly !== null) {
    metrics.push(usage.windows.weekly);
  }

  if (usage.windows.sonnet !== null) {
    metrics.push(usage.windows.sonnet);
  }

  if (usage.windows.pro !== null) {
    metrics.push(usage.windows.pro);
  }

  if (usage.windows.flash !== null) {
    metrics.push(usage.windows.flash);
  }

  if (usage.balances.credits !== null) {
    metrics.push(usage.balances.credits);
  }

  metrics.push(...usage.additional);

  return metrics;
};

const createProviderDetailUsageLines = (providerView: ProviderView): string[] => {
  const { providerDetails } = providerView.status;

  if (providerDetails === null) {
    return [];
  }

  if (providerDetails.kind === "codex") {
    const lines: string[] = [];

    const codeReviewWindow = providerDetails.dashboard?.codeReviewWindow ?? null;

    if (codeReviewWindow !== null && codeReviewWindow.remainingPercent !== null) {
      const remaining = codeReviewWindow.remainingPercent;

      lines.push("", `Code review ${String(remaining)}% remaining`);
    }

    if (providerDetails.dashboard !== null) {
      if (providerDetails.dashboard.creditHistory.length > 0) {
        lines.push(
          `Credit history ${String(providerDetails.dashboard.creditHistory.length)} events`,
        );
      }

      const { approximateCreditUsage } = providerDetails.dashboard;

      if (
        approximateCreditUsage !== null &&
        (approximateCreditUsage.cloudMessages !== null ||
          approximateCreditUsage.localMessages !== null)
      ) {
        const segments: string[] = [];

        if (approximateCreditUsage.cloudMessages !== null) {
          segments.push(`${String(approximateCreditUsage.cloudMessages)} cloud`);
        }

        if (approximateCreditUsage.localMessages !== null) {
          segments.push(`${String(approximateCreditUsage.localMessages)} local`);
        }

        lines.push(`Credits approx ${segments.join(" / ")}`);
      }
    }

    if (providerDetails.tokenCost !== null) {
      lines.push("", "Cost:");

      if (providerDetails.tokenCost.today !== null) {
        lines.push(
          providerDetails.tokenCost.today.costUsd === null
            ? "Estimated token cost today: unavailable"
            : `Estimated token cost today: USD ${providerDetails.tokenCost.today.costUsd.toFixed(2)}`,
        );
      }

      if (providerDetails.tokenCost.last30Days !== null) {
        lines.push(
          providerDetails.tokenCost.last30Days.costUsd === null
            ? "Estimated token cost 30d: unavailable"
            : `Estimated token cost 30d: USD ${providerDetails.tokenCost.last30Days.costUsd.toFixed(2)}`,
        );
      }
    }

    return lines;
  }

  if (providerDetails.kind === "claude") {
    const lines: string[] = [];

    if (providerDetails.tokenCost !== null) {
      lines.push("", "Cost:");

      if (providerDetails.tokenCost.today !== null) {
        lines.push(
          providerDetails.tokenCost.today.costUsd === null
            ? "Estimated token cost today: unavailable"
            : `Estimated token cost today: USD ${providerDetails.tokenCost.today.costUsd.toFixed(2)}`,
        );
      }

      if (providerDetails.tokenCost.last30Days !== null) {
        lines.push(
          providerDetails.tokenCost.last30Days.costUsd === null
            ? "Estimated token cost 30d: unavailable"
            : `Estimated token cost 30d: USD ${providerDetails.tokenCost.last30Days.costUsd.toFixed(2)}`,
        );
      }
    }

    return lines;
  }

  const lines: string[] = [];

  if (providerDetails.incidents.length > 0) {
    lines.push("");
    lines.push(`Incidents ${String(providerDetails.incidents.length)}`);
  }

  return lines;
};

const createUsageLines = (providerView: ProviderView): string[] => {
  const displayMetrics = getOrderedUsageMetrics(providerView);
  const detailLines = createProviderDetailUsageLines(providerView);

  if (displayMetrics.length === 0) {
    return detailLines.length === 0
      ? ["No usage data yet, try another source in the settings."]
      : detailLines;
  }

  const lines = displayMetrics.flatMap((metric, metricIndex) => {
    const detail = describeMetric(metric.label, metric.detail);
    const ratioMatch = /^(\d+)(?:\.\d+)?%$/.exec(metric.value.trim());
    const ratio = ratioMatch === null ? null : Math.max(0, Math.min(100, Number(ratioMatch[1])));
    const filledCount = ratio === null ? 0 : Math.round((ratio / 100) * 16);
    const meter = ratio === null ? "" : `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;
    const includeSeparator = metricIndex !== displayMetrics.length - 1 && meter !== "";

    return [
      `${metric.label.padEnd(12, " ")}${metric.value}`,
      ...(meter === "" ? [] : [meter]),
      ...(detail === null ? [] : [detail]),
      ...(includeSeparator ? [""] : []),
    ];
  });

  const { providerCost } = providerView.status.usage;

  if (providerCost !== null) {
    const percentUsed = getProviderCostPercent(providerCost);
    const filledCount = percentUsed === null ? 0 : Math.round((percentUsed / 100) * 16);
    const meter =
      percentUsed === null ? "" : `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;

    lines.push("", `Extra usage ${percentUsed === null ? "" : `${String(percentUsed)}%`}`.trim());

    if (meter !== "") {
      lines.push(meter);
    }

    lines.push(formatProviderCostLabel(providerCost));
  }

  lines.push(...detailLines);

  return lines;
};

const createUsageBanner = (providerView: ProviderView): TuiUsageBannerViewModel | null => {
  if (providerView.status.latestError !== null) {
    return {
      text: providerView.status.latestError,
      tone: "error",
    };
  }

  const { serviceStatus } = providerView.status;

  if (serviceStatus === null || serviceStatus.indicator === "none") {
    return null;
  }

  if (typeof serviceStatus.description === "string" && serviceStatus.description.trim() !== "") {
    return {
      text: serviceStatus.description,
      tone: "status",
    };
  }

  return {
    text: formatProviderHealthLabel(serviceStatus),
    tone: "status",
  };
};

const createDetailsLines = (providerView: ProviderView): string[] => {
  const rows: [string, string][] = [
    ["state", humanizeValue(providerView.status.state)],
    ["source", humanizeValue(providerView.status.sourceLabel ?? "unknown")],
    ["version", providerView.status.version ?? "unknown"],
    ["updated", formatUpdatedDisplay(providerView.status.updatedAt)],
    ["account", maskEmailAddress(providerView.status.identity.accountEmail)],
    ["plan", providerView.status.identity.planLabel ?? "unknown"],
  ];

  if (providerView.status.latestError !== null) {
    rows.push(["error", providerView.status.latestError]);
  }

  if (providerView.status.usage.providerCost !== null) {
    rows.push(["extra", formatProviderCostLabel(providerView.status.usage.providerCost)]);
  }

  if (providerView.status.providerDetails?.kind === "claude") {
    if (providerView.status.providerDetails.accountOrg !== null) {
      rows.push(["org", providerView.status.providerDetails.accountOrg]);
    }
  }

  if (providerView.status.providerDetails?.kind === "codex") {}

  if (providerView.status.providerDetails?.kind === "gemini") {
    if (providerView.status.providerDetails.incidents.length > 0) {
      rows.push([
        "incident",
        providerView.status.providerDetails.incidents[0]?.summary ?? "active",
      ]);
    }
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
      `${humanizeValue(providerView.status.identity.planLabel ?? "unknown")}  •  ${providerView.enabled ? "enabled" : "disabled"}`,
    ],
    title: `settings • ${providerView.id}`,
  };
};

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
    detailsLines: createDetailsLines(selectedProvider),
    footer: createFooter(state, localState),
    headerLines: createHeaderLines(selectedProvider, now),
    menuLines: createMenuLines(selectedProvider.id),
    modal: localState.isSettingsOpen ? createModalViewModel(selectedProvider, localState) : null,
    tabs: createTabs(state, localState),
    title: appTitle,
    usageBanner: createUsageBanner(selectedProvider),
    usageLines: createUsageLines(selectedProvider),
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
