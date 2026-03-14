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
import type { RuntimeHost } from "@/runtime/host.ts";
import { isRecord, joinPath, parseJsonText, readArray, readBoolean, readFiniteNumber, readJsonFile, readNestedRecord, readString, readStringArray, writeJsonFile } from '@/runtime/providers/collection/io.ts';
import type { JsonFileReadResult } from '@/runtime/providers/collection/io.ts';
import { readJwtEmail } from "@/runtime/providers/collection/jwt.ts";

type ProviderId = "claude" | "codex" | "gemini";

interface ProviderMetricInput {
  detail?: string | null;
  kind?: ProviderMetricKind;
  label: string;
  value: string;
}

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

const createSnapshot = (input: {
  accountEmail?: string | null;
  latestError?: string | null;
  metrics?: ProviderMetricInput[];
  planLabel?: string | null;
  providerDetails?: ProviderDetailsSnapshot | null;
  providerCost?: ProviderCostSnapshot | null;
  quotaBuckets?: ProviderQuotaBucketSnapshot[];
  sourceLabel: string;
  updatedAt?: string | null;
  version?: string | null;
}): ProviderRuntimeSnapshot => ({
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

const readCommandVersion = async (
  host: RuntimeHost,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<string | null> => {
  if ((await host.commands.which(command)) === null) {
    return explicitNull;
  }

  const commandResult = await host.commands.run(command, args, {
    timeoutMs,
  });

  if (commandResult.exitCode !== 0) {
    return explicitNull;
  }

  const versionToken = commandResult.stdout.match(/([0-9]+(?:\.[0-9]+){1,}[0-9A-Za-z.-]*)/u)?.[1];

  return typeof versionToken === "string" && versionToken !== "" ? versionToken : explicitNull;
};

const runResolvedRefresh = async <ProviderValue extends ProviderId, ResolvedSource>(input: {
  finalizeResult?: (
    result: ProviderRefreshActionResult<ProviderValue>,
  ) => Promise<ProviderRefreshActionResult<ProviderValue>>;
  providerId: ProviderValue;
  refreshFromResolvedSource: (
    resolvedSource: ResolvedSource,
  ) => Promise<ProviderRefreshActionResult<ProviderValue>>;
  resolveSource: () => Promise<ResolvedSource | null>;
  unavailableMessage: string;
}): Promise<ProviderRefreshActionResult<ProviderValue>> => {
  const resolvedSource = await input.resolveSource();

  if (resolvedSource === null) {
    return createRefreshError(input.providerId, input.unavailableMessage);
  }

  const result = await input.refreshFromResolvedSource(resolvedSource);

  if (input.finalizeResult !== undefined) {
    return input.finalizeResult(result);
  }

  return result;
};

export {
  createRefreshError,
  createRefreshSuccess,
  createProviderCostSnapshot,
  createProviderQuotaBucketSnapshot,
  createSnapshot,
  createUsageSnapshot,
  formatFractionPercent,
  formatPercent,
  isRecord,
  joinPath,
  parseJsonText,
  readArray,
  readBoolean,
  readCommandVersion,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  readStringArray,
  runResolvedRefresh,
  withProviderDetails,
  writeJsonFile,
  type JsonFileReadResult,
  type ProviderMetricInput,
};
