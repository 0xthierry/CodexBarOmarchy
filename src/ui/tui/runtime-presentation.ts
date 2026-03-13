import {
  appendProviderSpecificDetailRows,
  createProviderDetailUsageLines,
  formatProviderCostLabel,
  getOrderedUsageMetrics,
  getProviderCostPercent,
} from "@/ui/tui/provider-presentation.ts";
import { humanizeValue } from "@/ui/tui/presenter-formatters.ts";
import {
  describeMetric,
  formatHeaderClockDisplay,
  formatNonAccountIdentityValue,
  formatProviderHealthLabel,
  formatUpdatedDisplay,
  maskEmailAddress,
  parseIsoDate,
} from "@/ui/tui/runtime-formatters.ts";
import type { ProviderView, TuiUsageBannerViewModel } from "@/ui/tui/types.ts";

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
    ["plan", formatNonAccountIdentityValue(providerView.status.identity.planLabel)],
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
