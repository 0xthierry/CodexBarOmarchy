import type { ProviderMetricView } from "@/core/store/runtime-state.ts";
import type { ProviderView } from "@/ui/tui/types.ts";

interface OrderedUsageMetric extends ProviderMetricView {
  meterPercent?: number;
  sectionBreakBefore?: boolean;
}

const invertRemainingPercent = (value: number): number => Math.max(0, 100 - value);

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

export { getOrderedUsageMetrics, type OrderedUsageMetric };
