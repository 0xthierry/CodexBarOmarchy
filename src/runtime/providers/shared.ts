import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import {
  createRefreshActionResult,
  type ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import type { ProviderRuntimeSnapshot } from "@/core/store/runtime-state.ts";

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

const createMetric = (input: ProviderMetricInput): ProviderRuntimeSnapshot["metrics"][number] => ({
  detail: input.detail ?? explicitNull,
  label: input.label,
  value: input.value,
});

const createSnapshot = (input: {
  accountEmail?: string | null;
  latestError?: string | null;
  metrics?: ProviderMetricInput[];
  planLabel?: string | null;
  sourceLabel: string;
  updatedAt?: string | null;
  version?: string | null;
}): ProviderRuntimeSnapshot => ({
  accountEmail: input.accountEmail ?? explicitNull,
  latestError: input.latestError ?? explicitNull,
  metrics: input.metrics?.map((metric) => createMetric(metric)) ?? [],
  planLabel: input.planLabel ?? explicitNull,
  sourceLabel: input.sourceLabel,
  state: "ready",
  updatedAt: input.updatedAt ?? new Date().toISOString(),
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
  createSnapshot,
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
  writeJsonFile,
  type JsonFileReadResult,
  type ProviderMetricInput,
};
