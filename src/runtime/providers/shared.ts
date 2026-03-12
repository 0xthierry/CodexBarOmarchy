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

type ProviderId = "claude" | "codex" | "gemini";

interface JsonFileReadInvalidResult {
  status: "invalid";
}

interface JsonFileReadMissingResult {
  status: "missing";
}

interface JsonFileReadOkResult {
  status: "ok";
  value: unknown;
}

interface ProviderMetricInput {
  detail?: string | null;
  kind?: ProviderMetricKind;
  label: string;
  value: string;
}

type JsonFileReadResult =
  | JsonFileReadInvalidResult
  | JsonFileReadMissingResult
  | JsonFileReadOkResult;

const joinPath = (...segments: string[]): string => segments.join("/");

const parseJsonText = (value: string): unknown => JSON.parse(value) as unknown;

const readJsonFile = async (host: RuntimeHost, filePath: string): Promise<JsonFileReadResult> => {
  if (!(await host.fileSystem.fileExists(filePath))) {
    return { status: "missing" };
  }

  try {
    const fileContents = await host.fileSystem.readTextFile(filePath);

    return {
      status: "ok",
      value: parseJsonText(fileContents),
    };
  } catch {
    return { status: "invalid" };
  }
};

const writeJsonFile = async (
  host: RuntimeHost,
  filePath: string,
  value: unknown,
): Promise<void> => {
  await host.fileSystem.writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNestedRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null => {
  const value = record[key];

  if (isRecord(value)) {
    return value;
  }

  return explicitNull;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  if (typeof value === "string" && value !== "") {
    return value;
  }

  return explicitNull;
};

const readBoolean = (record: Record<string, unknown>, key: string): boolean | null => {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  return explicitNull;
};

const readArray = (record: Record<string, unknown>, key: string): unknown[] | null => {
  const value = record[key];

  if (Array.isArray(value)) {
    return value;
  }

  return explicitNull;
};

const readNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return explicitNull;
};

const readStringArray = (record: Record<string, unknown>, key: string): string[] | null => {
  const value = readArray(record, key);

  if (value === null) {
    return explicitNull;
  }

  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && entry !== "",
  );

  return strings.length === value.length ? strings : explicitNull;
};

const readFiniteNumber = (record: Record<string, unknown>, key: string): number | null => {
  const numericValue = readNumber(record, key);

  if (numericValue !== null) {
    return numericValue;
  }

  const value = record[key];

  if (typeof value === "string" && value !== "") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return explicitNull;
};

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

const decodeBase64Url = (value: string): string | null => {
  const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
  const requiredPadding = (4 - (normalizedValue.length % 4)) % 4;

  try {
    return atob(`${normalizedValue}${"=".repeat(requiredPadding)}`);
  } catch {
    return explicitNull;
  }
};

const decodeJwtPayloadRecord = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];

  if (typeof payload !== "string" || payload === "") {
    return explicitNull;
  }

  const decodedPayload = decodeBase64Url(payload);

  if (decodedPayload === null) {
    return explicitNull;
  }

  try {
    const parsedValue: unknown = JSON.parse(decodedPayload);

    return isRecord(parsedValue) ? parsedValue : explicitNull;
  } catch {
    return explicitNull;
  }
};

const readJwtEmail = (record: Record<string, unknown>, key: string): string | null => {
  const token = readString(record, key);

  if (token === null) {
    return explicitNull;
  }

  const payload = decodeJwtPayloadRecord(token);

  if (payload === null) {
    return explicitNull;
  }

  return readString(payload, "email");
};

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
  withProviderDetails,
  writeJsonFile,
  type JsonFileReadResult,
  type ProviderMetricInput,
};
