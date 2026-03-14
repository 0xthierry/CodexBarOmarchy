import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import { createRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type {
  ProviderCostSnapshot,
  ProviderDetailsSnapshot,
  ProviderMetricKind,
  ProviderMetricView,
  ProviderQuotaBucketSnapshot,
  ProviderRateWindowSnapshot,
  ProviderRuntimeSnapshot,
  ProviderUsageSnapshot,
} from "@/core/store/runtime-state.ts";

type ProviderId = "claude" | "codex" | "gemini";

interface ProviderMetricInput {
  detail?: string | null;
  kind?: ProviderMetricKind;
  label: string;
  value: string;
}

interface ProviderRefreshSeed {
  accountEmail?: string | null;
  latestError?: string | null;
  metrics?: ProviderMetricInput[];
  planLabel?: string | null;
  providerCost?: ProviderCostSnapshot | null;
  providerDetails?: ProviderDetailsSnapshot | null;
  quotaBuckets?: ProviderQuotaBucketSnapshot[];
  sourceLabel: string;
  updatedAt?: string | null;
  version?: string | null;
}

type ProviderDetailsKind = ProviderDetailsSnapshot["kind"];
type ProviderDetailsOf<Kind extends ProviderDetailsKind> = Extract<
  ProviderDetailsSnapshot,
  { kind: Kind }
>;

const isProviderDetailsOfKind = <Kind extends ProviderDetailsKind>(
  providerDetails: ProviderDetailsSnapshot | null,
  kind: Kind,
): providerDetails is ProviderDetailsOf<Kind> => providerDetails?.kind === kind;

const formatPercent = (value: number): string => `${Math.round(value)}%`;
const formatFractionPercent = (value: number): string => formatPercent(value * 100);

const createMetric = (input: ProviderMetricInput): ProviderMetricView => ({
  detail: input.detail ?? explicitNull,
  kind: input.kind ?? "custom",
  label: input.label,
  value: input.value,
});

const parsePercentValue = (value: string): number | null => {
  const matchedPercent = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)%$/u)?.[1];

  if (typeof matchedPercent !== "string") {
    return explicitNull;
  }

  const parsedPercent = Number(matchedPercent);

  return Number.isFinite(parsedPercent) ? parsedPercent : explicitNull;
};

const createRateWindowSnapshot = (input: {
  label: string;
  resetAt?: string | null;
  usedPercent: number;
}): ProviderRateWindowSnapshot => ({
  label: input.label,
  resetAt: input.resetAt ?? explicitNull,
  usedPercent: input.usedPercent,
});

const createProviderCostSnapshot = (input: {
  currencyCode: string;
  limit: number;
  periodLabel?: string | null;
  resetsAt?: string | null;
  updatedAt?: string | null;
  used: number;
}): ProviderCostSnapshot => ({
  currencyCode: input.currencyCode,
  limit: input.limit,
  periodLabel: input.periodLabel ?? explicitNull,
  resetsAt: input.resetsAt ?? explicitNull,
  updatedAt: input.updatedAt ?? explicitNull,
  used: input.used,
});

const createProviderQuotaBucketSnapshot = (input: {
  modelId: string;
  remainingFraction: number;
  resetTime?: string | null;
}): ProviderQuotaBucketSnapshot => ({
  modelId: input.modelId,
  remainingFraction: input.remainingFraction,
  resetTime: input.resetTime ?? explicitNull,
});

const createUsageSnapshot = (
  metrics: ProviderMetricInput[] = [],
  providerCost: ProviderCostSnapshot | null = explicitNull,
  quotaBuckets: ProviderQuotaBucketSnapshot[] = [],
): ProviderUsageSnapshot => {
  const usage: ProviderUsageSnapshot = {
    additional: [],
    balances: {
      credits: explicitNull,
    },
    providerCost,
    quotaBuckets,
    rateWindows: [],
    windows: {
      flash: explicitNull,
      pro: explicitNull,
      session: explicitNull,
      sonnet: explicitNull,
      weekly: explicitNull,
    },
  };

  for (const metricInput of metrics) {
    const metric = createMetric(metricInput);
    const usedPercent = parsePercentValue(metric.value);

    if (metric.kind === "session") {
      usage.windows.session = metric;

      if (usedPercent !== null) {
        usage.rateWindows.push(
          createRateWindowSnapshot({
            label: metric.label,
            resetAt: metric.detail,
            usedPercent,
          }),
        );
      }

      continue;
    }

    if (metric.kind === "weekly") {
      usage.windows.weekly = metric;

      if (usedPercent !== null) {
        usage.rateWindows.push(
          createRateWindowSnapshot({
            label: metric.label,
            resetAt: metric.detail,
            usedPercent,
          }),
        );
      }

      continue;
    }

    if (metric.kind === "sonnet") {
      usage.windows.sonnet = metric;

      if (usedPercent !== null) {
        usage.rateWindows.push(
          createRateWindowSnapshot({
            label: metric.label,
            resetAt: metric.detail,
            usedPercent,
          }),
        );
      }

      continue;
    }

    if (metric.kind === "pro") {
      usage.windows.pro = metric;

      if (usedPercent !== null) {
        usage.rateWindows.push(
          createRateWindowSnapshot({
            label: metric.label,
            resetAt: metric.detail,
            usedPercent,
          }),
        );
      }

      continue;
    }

    if (metric.kind === "flash") {
      usage.windows.flash = metric;

      if (usedPercent !== null) {
        usage.rateWindows.push(
          createRateWindowSnapshot({
            label: metric.label,
            resetAt: metric.detail,
            usedPercent,
          }),
        );
      }

      continue;
    }

    if (metric.kind === "credits") {
      usage.balances.credits = metric;
      continue;
    }

    usage.additional.push(metric);
  }

  return usage;
};

const createSnapshot = (input: ProviderRefreshSeed): ProviderRuntimeSnapshot => ({
  identity: {
    accountEmail: input.accountEmail ?? explicitNull,
    planLabel: input.planLabel ?? explicitNull,
  },
  latestError: input.latestError ?? explicitNull,
  providerDetails: input.providerDetails ?? explicitNull,
  serviceStatus: explicitNull,
  sourceLabel: input.sourceLabel,
  state: "ready",
  updatedAt: input.updatedAt ?? new Date().toISOString(),
  usage: createUsageSnapshot(
    input.metrics,
    input.providerCost ?? explicitNull,
    input.quotaBuckets ?? [],
  ),
  version: input.version ?? explicitNull,
});

const createRefreshSuccess = <ProviderValue extends ProviderId>(
  providerId: ProviderValue,
  message: string,
  snapshot: ProviderRuntimeSnapshot,
): ProviderRefreshActionResult<ProviderValue> =>
  createRefreshActionResult(
    createSuccessfulProviderActionResult(providerId, "refresh", message),
    snapshot,
  );

const createRefreshSuccessFromSeed = <ProviderValue extends ProviderId>(
  providerId: ProviderValue,
  message: string,
  seed: ProviderRefreshSeed,
): ProviderRefreshActionResult<ProviderValue> =>
  createRefreshSuccess(providerId, message, createSnapshot(seed));

const createRefreshError = <ProviderValue extends ProviderId>(
  providerId: ProviderValue,
  message: string,
): ProviderRefreshActionResult<ProviderValue> =>
  createRefreshActionResult(createErrorProviderActionResult(providerId, "refresh", message));

const withProviderDetails = (
  snapshot: ProviderRuntimeSnapshot,
  providerDetails: ProviderDetailsSnapshot,
): ProviderRuntimeSnapshot => ({
  ...snapshot,
  providerDetails,
});

const updateProviderDetails = <Kind extends ProviderDetailsKind>(
  snapshot: ProviderRuntimeSnapshot,
  kind: Kind,
  createDefault: () => ProviderDetailsOf<Kind>,
  update: (details: ProviderDetailsOf<Kind>) => ProviderDetailsOf<Kind>,
): ProviderRuntimeSnapshot => {
  const currentDetails = isProviderDetailsOfKind(snapshot.providerDetails, kind)
    ? snapshot.providerDetails
    : createDefault();

  return {
    ...snapshot,
    providerDetails: update(currentDetails),
  };
};

export {
  createProviderCostSnapshot,
  createProviderQuotaBucketSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createRefreshSuccessFromSeed,
  createSnapshot,
  createUsageSnapshot,
  formatFractionPercent,
  formatPercent,
  updateProviderDetails,
  withProviderDetails,
  type ProviderDetailsOf,
  type ProviderId,
  type ProviderMetricInput,
  type ProviderRefreshSeed,
};
