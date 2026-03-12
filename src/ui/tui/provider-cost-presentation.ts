import type { ProviderCostSnapshot } from "@/core/store/runtime-state.ts";

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

export { formatDecimalAmount, formatProviderCostLabel, getProviderCostPercent };
