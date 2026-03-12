import type {
  ProviderCostSnapshot,
  ProviderMetricView,
  TokenCostSnapshot,
} from "@/core/store/runtime-state.ts";
import type { ProviderView } from "@/ui/tui/types.ts";

interface OrderedUsageMetric extends ProviderMetricView {
  meterPercent?: number;
  sectionBreakBefore?: boolean;
}

const formatDecimalAmount = (value: number): string =>
  value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const formatCurrencyAmount = (value: number, currencyCode: string): string =>
  `${currencyCode} ${formatDecimalAmount(value)}`;

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

const invertRemainingPercent = (value: number): number => Math.max(0, 100 - value);

const createTokenCostDetailLines = (tokenCost: TokenCostSnapshot | null): string[] => {
  if (tokenCost === null) {
    return [];
  }

  const lines = ["", "Cost:"];

  if (tokenCost.today !== null) {
    lines.push(
      tokenCost.today.costUsd === null
        ? "Estimated token cost today: unavailable"
        : `Estimated token cost today: USD ${formatDecimalAmount(tokenCost.today.costUsd)}`,
    );
  }

  if (tokenCost.last30Days !== null) {
    lines.push(
      tokenCost.last30Days.costUsd === null
        ? "Estimated token cost 30d: unavailable"
        : `Estimated token cost 30d: USD ${formatDecimalAmount(tokenCost.last30Days.costUsd)}`,
    );
  }

  return lines;
};

const getOrderedUsageMetrics = (providerView: ProviderView): OrderedUsageMetric[] => {
  const metrics: OrderedUsageMetric[] = [];
  const { usage } = providerView.status;
  const { providerDetails } = providerView.status;

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

  const isCodexProvider = providerDetails?.kind === "codex";

  if (!isCodexProvider && usage.balances.credits !== null) {
    metrics.push(usage.balances.credits);
  }

  metrics.push(...usage.additional);

  if (isCodexProvider) {
    const { dashboard } = providerDetails;

    for (const rateLimit of dashboard?.additionalRateLimits ?? []) {
      if (rateLimit.remainingPercent === null) {
        continue;
      }

      const usedPercent = invertRemainingPercent(rateLimit.remainingPercent);

      metrics.push({
        detail: rateLimit.resetAt,
        label: rateLimit.label,
        meterPercent: usedPercent,
        value: `${String(usedPercent)}%`,
      });
    }

    const codeReviewWindow = dashboard?.codeReviewWindow ?? null;

    if (codeReviewWindow !== null && codeReviewWindow.remainingPercent !== null) {
      const usedPercent = invertRemainingPercent(codeReviewWindow.remainingPercent);

      metrics.push({
        detail: codeReviewWindow.resetAt,
        label: codeReviewWindow.label,
        meterPercent: usedPercent,
        value: `${String(usedPercent)}%`,
      });
    }

    if (usage.balances.credits !== null) {
      metrics.push({
        ...usage.balances.credits,
        sectionBreakBefore: true,
      });
    }
  }

  return metrics;
};

const createProviderDetailUsageLines = (providerView: ProviderView): string[] => {
  const { providerDetails } = providerView.status;

  if (providerDetails === null) {
    return [];
  }

  if (providerDetails.kind === "codex") {
    const lines: string[] = [];

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

    lines.push(...createTokenCostDetailLines(providerDetails.tokenCost));
    return lines;
  }

  if (providerDetails.kind === "claude") {
    return createTokenCostDetailLines(providerDetails.tokenCost);
  }

  if (providerDetails.incidents.length === 0) {
    return [];
  }

  return ["", `Incidents ${String(providerDetails.incidents.length)}`];
};

const appendProviderSpecificDetailRows = (
  rows: [string, string][],
  providerView: ProviderView,
): void => {
  if (providerView.status.providerDetails?.kind === "claude") {
    if (providerView.status.providerDetails.accountOrg !== null) {
      rows.push(["org", providerView.status.providerDetails.accountOrg]);
    }

    return;
  }

  if (providerView.status.providerDetails?.kind === "gemini") {
    if (providerView.status.providerDetails.incidents.length > 0) {
      rows.push([
        "incident",
        providerView.status.providerDetails.incidents[0]?.summary ?? "active",
      ]);
    }
  }
};

export {
  appendProviderSpecificDetailRows,
  createProviderDetailUsageLines,
  formatDecimalAmount,
  formatProviderCostLabel,
  getOrderedUsageMetrics,
  getProviderCostPercent,
  type OrderedUsageMetric,
};
