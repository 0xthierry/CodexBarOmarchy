import type { ProviderMetricKind } from "@/core/store/runtime-state.ts";
import {
  appendProviderSpecificDetailRows,
  createProviderDetailUsageLines,
  formatProviderCostLabel,
  getOrderedUsageMetrics,
  getProviderCostPercent,
} from "@/ui/tui/provider-presentation.ts";
import { humanizeValue } from "@/ui/tui/presenter-formatters.ts";
import type { ProviderView, TuiUsageBannerViewModel } from "@/ui/tui/types.ts";

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

const describeMetric = (
  metric: { kind?: ProviderMetricKind; label: string },
  detail: string | null,
): string | null => {
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

  const metricKind = metric.kind ?? "custom";

  if (metricKind === "session") {
    return "Current session window";
  }

  if (metricKind === "weekly") {
    return "Current weekly window";
  }

  if (metricKind === "credits") {
    return "OpenAI credit balance";
  }

  if (metricKind === "sonnet") {
    return "Current Sonnet window";
  }

  if (metricKind === "flash" || metricKind === "pro") {
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

const createUsageLines = (providerView: ProviderView): string[] => {
  const displayMetrics = getOrderedUsageMetrics(providerView);
  const detailLines = createProviderDetailUsageLines(providerView);

  if (displayMetrics.length === 0) {
    return detailLines.length === 0
      ? ["No usage data yet, try another source in the settings."]
      : detailLines;
  }

  const lines = displayMetrics.flatMap((metric, metricIndex) => {
    const previousMetric = metricIndex === 0 ? null : (displayMetrics[metricIndex - 1] ?? null);
    const detail = describeMetric(metric, metric.detail);
    const ratioMatch = /^(\d+)(?:\.\d+)?%$/.exec(metric.value.trim());
    const ratio =
      metric.meterPercent !== undefined
        ? Math.max(0, Math.min(100, metric.meterPercent))
        : (ratioMatch === null
          ? null
          : Math.max(0, Math.min(100, Number(ratioMatch[1]))));
    const filledCount = ratio === null ? 0 : Math.round((ratio / 100) * 16);
    const meter = ratio === null ? "" : `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;
    const includeSeparator = metricIndex !== displayMetrics.length - 1 && meter !== "";
    const previousMetricHasMeter =
      previousMetric !== null &&
      (previousMetric.meterPercent !== undefined ||
        /^(\d+)(?:\.\d+)?%$/.test(previousMetric.value.trim()));
    const prefixLines = metric.sectionBreakBefore === true && !previousMetricHasMeter ? [""] : [];
    const metricLine =
      metric.label.length >= 12
        ? `${metric.label} ${metric.value}`
        : `${metric.label.padEnd(12, " ")}${metric.value}`;

    return [
      ...prefixLines,
      metricLine,
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

  appendProviderSpecificDetailRows(rows, providerView);

  return rows.map(([label, value]) => `${label.padEnd(8, " ")} ${value}`);
};

export {
  createDetailsLines,
  createUsageBanner,
  createUsageLines,
  formatHeaderClockDisplay,
  formatProviderHealthLabel,
  formatUpdatedDisplay,
  maskEmailAddress,
  parseIsoDate,
};
