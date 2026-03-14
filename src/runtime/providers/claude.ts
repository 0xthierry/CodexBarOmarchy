import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import type {
  ClaudeProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeCommandResult, RuntimeHost } from "@/runtime/host.ts";
import { resolveClaudeWebSession } from "@/runtime/providers/claude-web-auth.ts";
import type { ClaudeWebSessionSnapshot } from "@/runtime/providers/claude-web-models.ts";
import { finalizeClaudeRefresh } from "@/runtime/providers/claude/enrich.ts";
import {
  createProviderCostSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatPercent,
  isRecord,
  joinPath,
  parseJsonText,
  readBoolean,
  readCommandVersion,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  runResolvedRefresh,
  withProviderDetails,
  writeJsonFile,
} from "@/runtime/providers/shared.ts";
import type { ProviderMetricInput } from "@/runtime/providers/shared.ts";

const claudeOAuthRefreshEndpoint = "https://platform.claude.com/v1/oauth/token";
const claudeOAuthUsageEndpoint = "https://api.anthropic.com/api/oauth/usage";
const claudeTimeoutMs = 8000;
const claudeCliUsageTimeoutMs = 18_000;
const claudeCliStatusTimeoutMs = 10_000;
const claudeTokenFileNames = ["session-token.json", "session.json"] as const;
const fallbackClaudeCodeVersion = "2.1.0";
const oauthUsageBetaHeader = "oauth-2025-04-20";

type ClaudeResolvedSource = "cli" | "oauth" | "web";

interface ClaudeProviderConfig {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  source: "auto" | "cli" | "oauth" | "web";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}

interface ClaudeCredentialRecord {
  accessToken: string;
  expiresAt: number | null;
  rawRecord: Record<string, unknown>;
  refreshToken: string | null;
  subscriptionType: string | null;
}

interface ClaudeOAuthUsageWindow {
  resetsAt: string | null;
  utilization: number | null;
}

interface ClaudeOAuthUsageResponse {
  extraUsage: Record<string, unknown> | null;
  fiveHour: ClaudeOAuthUsageWindow | null;
  sevenDay: ClaudeOAuthUsageWindow | null;
  sevenDaySonnet: ClaudeOAuthUsageWindow | null;
}

interface ClaudeExtraUsageSnapshot {
  currencyCode: string;
  limit: number;
  used: number;
}

interface ClaudeWebUsageResponse {
  accountEmail: string | null;
  metrics: ProviderMetricInput[];
}

interface ClaudeAuthStatusResponse {
  email: string | null;
  loggedIn: boolean | null;
  subscriptionType: string | null;
}

const isEmailLike = (value: string | null): boolean => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  const trimmedValue = value.trim();
  const separatorIndex = trimmedValue.indexOf("@");

  return (
    separatorIndex > 0 && separatorIndex < trimmedValue.length - 1 && !trimmedValue.includes(" ")
  );
};

const containsEmailLikeSegment = (value: string | null): boolean => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  return /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(value);
};

const sanitizeClaudeIdentityLabel = (
  value: string | null,
  accountEmail: string | null,
): string | null => {
  if (typeof value !== "string" || value.trim() === "") {
    return explicitNull;
  }

  if (isEmailLike(value)) {
    return explicitNull;
  }

  if (containsEmailLikeSegment(value)) {
    return explicitNull;
  }

  if (
    typeof accountEmail === "string" &&
    accountEmail.trim() !== "" &&
    value.trim().toLowerCase().includes(accountEmail.trim().toLowerCase())
  ) {
    return explicitNull;
  }

  return value.trim();
};

const humanizeClaudePlanToken = (value: string): string =>
  value
    .split(/[_-]+/u)
    .filter((segment) => segment !== "")
    .map((segment) => {
      if (/^\d+x$/u.test(segment.toLowerCase())) {
        return segment.toLowerCase();
      }

      return `${segment.slice(0, 1).toUpperCase()}${segment.slice(1).toLowerCase()}`;
    })
    .join(" ");

const normalizeClaudePlanLabel = (
  value: string | null,
  accountEmail: string | null,
): string | null => {
  const sanitizedValue = sanitizeClaudeIdentityLabel(value, accountEmail);

  if (sanitizedValue === null) {
    return explicitNull;
  }

  const normalizedKey = sanitizedValue.trim().toLowerCase();

  if (normalizedKey === "max" || normalizedKey === "default_claude_max") {
    return "Max";
  }

  if (normalizedKey === "pro" || normalizedKey === "default_claude_pro") {
    return "Pro";
  }

  if (normalizedKey === "plus" || normalizedKey === "default_claude_plus") {
    return "Plus";
  }

  if (normalizedKey.startsWith("manual_tier_")) {
    const tierNumber = normalizedKey.slice("manual_tier_".length);

    return /^\d+$/u.test(tierNumber)
      ? `Tier ${tierNumber}`
      : humanizeClaudePlanToken(normalizedKey);
  }

  if (normalizedKey.startsWith("default_claude_")) {
    return humanizeClaudePlanToken(normalizedKey.slice("default_claude_".length));
  }

  if (normalizedKey.startsWith("claude_")) {
    return humanizeClaudePlanToken(normalizedKey.slice("claude_".length));
  }

  if (
    sanitizedValue.includes(" ") &&
    !sanitizedValue.includes("_") &&
    !sanitizedValue.includes("-")
  ) {
    return sanitizedValue;
  }

  return humanizeClaudePlanToken(sanitizedValue);
};

const readClaudeOrganizationName = (
  tokenPayload: Record<string, unknown>,
  accountRecord: Record<string, unknown> | null = null,
): string | null => {
  const organizationRecord =
    readNestedRecord(tokenPayload, "organization") ??
    (accountRecord ? readNestedRecord(accountRecord, "organization") : explicitNull);

  return (
    readString(tokenPayload, "organizationName") ??
    (organizationRecord ? readString(organizationRecord, "name") : explicitNull)
  );
};

const quoteShellArgument = (value: string): string => `'${value.replaceAll("'", "'\"'\"'")}'`;

const ansiOscPattern = new RegExp(String.raw`\u001B\][^\u0007]*(?:\u0007|\u001B\\)`, "gu");
const ansiCsiPattern = new RegExp(String.raw`\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])`, "gu");

const stripAnsiAndControlSequences = (value: string): string =>
  value
    .replaceAll(ansiOscPattern, "")
    .replaceAll(ansiCsiPattern, "")
    .replaceAll("\r", "\n")
    .replaceAll("\b", "")
    .replaceAll("\0", "");

const normalizeCliText = (value: string): string =>
  stripAnsiAndControlSequences(value)
    .replaceAll("\u00A0", " ")
    .replaceAll(/[ \t]+/gu, " ")
    .replaceAll(/ *\n */gu, "\n");

const normalizeCliLine = (value: string): string => value.trim().replaceAll(/[ \t]+/gu, " ");

const compactCliToken = (value: string): string =>
  normalizeCliLine(value)
    .replaceAll(/[ \t]+/gu, "")
    .toLowerCase();

const normalizeClaudeCliResetDetail = (value: string): string =>
  value
    .trim()
    .replaceAll(/([A-Za-z]{3})(\d)/gu, "$1 $2")
    .replaceAll(/,(\d)/gu, ", $1")
    .replaceAll(/([ap]m)\(/giu, "$1 (");

const claudeCliMonthIndexes = new Map<string, number>([
  ["jan", 0],
  ["feb", 1],
  ["mar", 2],
  ["apr", 3],
  ["may", 4],
  ["jun", 5],
  ["jul", 6],
  ["aug", 7],
  ["sep", 8],
  ["oct", 9],
  ["nov", 10],
  ["dec", 11],
]);

const readTimeZoneDateParts = (
  value: Date,
  timeZone: string,
): {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
} | null => {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone,
      year: "numeric",
    });
    const parts = formatter.formatToParts(value);
    const readPart = (type: Intl.DateTimeFormatPartTypes): number | null => {
      const partValue = parts.find((part) => part.type === type)?.value;
      const parsedValue = partValue === undefined ? NaN : Number(partValue);

      return Number.isFinite(parsedValue) ? parsedValue : explicitNull;
    };
    const year = readPart("year");
    const month = readPart("month");
    const day = readPart("day");
    const hour = readPart("hour");
    const minute = readPart("minute");
    const second = readPart("second");

    return year !== null &&
      month !== null &&
      day !== null &&
      hour !== null &&
      minute !== null &&
      second !== null
      ? { day, hour, minute, month, second, year }
      : explicitNull;
  } catch {
    return explicitNull;
  }
};

const resolveDateInTimeZone = (
  input: { day: number; hour: number; minute: number; month: number; year: number },
  timeZone: string,
): Date | null => {
  try {
    let timestamp = Date.UTC(input.year, input.month, input.day, input.hour, input.minute, 0);

    for (let iteration = 0; iteration < 2; iteration += 1) {
      const zonedParts = readTimeZoneDateParts(new Date(timestamp), timeZone);

      if (zonedParts === null) {
        return explicitNull;
      }

      const desiredTimestamp = Date.UTC(
        input.year,
        input.month,
        input.day,
        input.hour,
        input.minute,
        0,
      );
      const observedTimestamp = Date.UTC(
        zonedParts.year,
        zonedParts.month - 1,
        zonedParts.day,
        zonedParts.hour,
        zonedParts.minute,
        0,
      );

      timestamp += desiredTimestamp - observedTimestamp;
    }

    return new Date(timestamp);
  } catch {
    return explicitNull;
  }
};

const formatClaudeCliResetTimestamp = (value: Date): string => value.toISOString();

const addUtcDays = (
  input: { day: number; month: number; year: number },
  days: number,
): { day: number; month: number; year: number } => {
  const date = new Date(Date.UTC(input.year, input.month, input.day));

  date.setUTCDate(date.getUTCDate() + days);

  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  };
};

const parseClaudeCliClockTime = (value: string): { hour: number; minute: number } | null => {
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/iu);

  if (match === null) {
    return explicitNull;
  }

  const rawHour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || meridiem === undefined) {
    return explicitNull;
  }

  const normalizedHour = rawHour % 12;

  return {
    hour: meridiem === "pm" ? normalizedHour + 12 : normalizedHour,
    minute,
  };
};

const formatClaudeCliResetAt = (detail: string | null, referenceAt: string): string | null => {
  if (typeof detail !== "string" || detail.trim() === "") {
    return explicitNull;
  }

  const referenceDate = new Date(referenceAt);

  if (Number.isNaN(referenceDate.getTime())) {
    return detail;
  }

  const normalizedDetail = normalizeClaudeCliResetDetail(detail);
  const timeZoneMatch = normalizedDetail.match(/^(.*?)\s*\(([^()]+)\)\s*$/u);
  const valueWithoutTimeZone = (timeZoneMatch?.[1] ?? normalizedDetail).trim();
  const timeZone = timeZoneMatch?.[2]?.trim() ?? explicitNull;
  const relativeMatch = valueWithoutTimeZone.match(
    /^(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/iu,
  );

  if (
    relativeMatch !== null &&
    (relativeMatch[1] !== undefined ||
      relativeMatch[2] !== undefined ||
      relativeMatch[3] !== undefined)
  ) {
    return explicitNull;
  }

  const monthDayMatch = valueWithoutTimeZone.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/iu,
  );

  if (monthDayMatch !== null) {
    const [, monthToken = "", dayToken = "", hourToken = "", minuteToken, meridiemToken = ""] =
      monthDayMatch;
    const monthIndex = claudeCliMonthIndexes.get(monthToken.toLowerCase());
    const day = Number(dayToken);
    const timeValue = parseClaudeCliClockTime(
      `${hourToken}:${minuteToken ?? "00"}${meridiemToken}`,
    );

    if (monthIndex !== undefined && Number.isFinite(day) && timeValue !== null) {
      if (timeZone !== null) {
        const referenceParts = readTimeZoneDateParts(referenceDate, timeZone);
        const resolvedDate = resolveDateInTimeZone(
          {
            day,
            hour: timeValue.hour,
            minute: timeValue.minute,
            month: monthIndex,
            year: referenceParts?.year ?? referenceDate.getUTCFullYear(),
          },
          timeZone,
        );

        return resolvedDate ? formatClaudeCliResetTimestamp(resolvedDate) : normalizedDetail;
      }

      return formatClaudeCliResetTimestamp(
        new Date(referenceDate.getFullYear(), monthIndex, day, timeValue.hour, timeValue.minute, 0),
      );
    }
  }

  const timeOnly = parseClaudeCliClockTime(valueWithoutTimeZone);

  if (timeOnly !== null) {
    if (timeZone !== null) {
      const referenceParts = readTimeZoneDateParts(referenceDate, timeZone);

      if (referenceParts !== null) {
        const sameDayDate = resolveDateInTimeZone(
          {
            day: referenceParts.day,
            hour: timeOnly.hour,
            minute: timeOnly.minute,
            month: referenceParts.month - 1,
            year: referenceParts.year,
          },
          timeZone,
        );

        if (sameDayDate !== null) {
          const thresholdMs = 60_000;

          if (sameDayDate.getTime() >= referenceDate.getTime() - thresholdMs) {
            return formatClaudeCliResetTimestamp(sameDayDate);
          }

          const nextDay = addUtcDays(
            {
              day: referenceParts.day,
              month: referenceParts.month - 1,
              year: referenceParts.year,
            },
            1,
          );
          const nextDayDate = resolveDateInTimeZone(
            {
              day: nextDay.day,
              hour: timeOnly.hour,
              minute: timeOnly.minute,
              month: nextDay.month,
              year: nextDay.year,
            },
            timeZone,
          );

          return nextDayDate ? formatClaudeCliResetTimestamp(nextDayDate) : normalizedDetail;
        }
      }
    }

    const localDate = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
      timeOnly.hour,
      timeOnly.minute,
      0,
    );

    if (localDate.getTime() < referenceDate.getTime() - 60_000) {
      localDate.setDate(localDate.getDate() + 1);
    }

    return formatClaudeCliResetTimestamp(localDate);
  }

  return normalizedDetail;
};

const findClaudeCliMetric = (
  lines: string[],
  labels: string[],
): { resetAt: string | null; usedPercent: string | null } => {
  const normalizedLabels = labels.map((label) => compactCliToken(label));
  const normalizedBoundaryLabels = [
    "Current session",
    "Curret session",
    "Current week (all models)",
    "Current week",
    "Current week (Sonnet only)",
    "Current week (Sonnet)",
    "Current week (Opus)",
  ].map((label) => compactCliToken(label));
  const labelIndex = lines.findIndex((line) => {
    const normalizedLine = compactCliToken(line);

    return normalizedLabels.some((label) => normalizedLine.includes(label));
  });

  if (labelIndex === -1) {
    return {
      resetAt: explicitNull,
      usedPercent: explicitNull,
    };
  }

  let resetAt: string | null = explicitNull;
  let usedPercent: string | null = explicitNull;

  for (const line of lines.slice(labelIndex + 1, labelIndex + 5)) {
    const normalizedLine = compactCliToken(line);

    if (normalizedBoundaryLabels.some((label) => normalizedLine.includes(label))) {
      break;
    }

    if (usedPercent === null) {
      const percentMatch = line.match(/([0-9]{1,3})%\s*used/iu) ?? line.match(/([0-9]{1,3})%/u);

      if (typeof percentMatch?.[1] === "string") {
        usedPercent = `${percentMatch[1]}%`;
      }
    }

    if (resetAt === null) {
      const resetMatch = line.match(/^(?:Resets?|Reset|Reses|Rese|Res)\s*(.+)$/iu);

      if (typeof resetMatch?.[1] === "string") {
        resetAt = normalizeClaudeCliResetDetail(resetMatch[1]);
      }
    }
  }

  return { resetAt, usedPercent };
};

const readClaudeCliPanelValue = (text: string, labels: string[]): string | null => {
  const lines = text
    .split(/\n+/u)
    .map((line) => normalizeCliLine(line))
    .filter((line) => line !== "");

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const compactLine = compactCliToken(line.slice(0, separatorIndex));

    for (const label of labels) {
      if (compactLine !== compactCliToken(label)) {
        continue;
      }

      const value = line.slice(separatorIndex + 1).trim();

      if (value !== "") {
        return value;
      }
    }
  }

  return explicitNull;
};

const normalizeClaudeCliPlanLabel = (
  value: string | null,
  accountEmail: string | null,
): string | null => {
  const sanitizedValue = sanitizeClaudeIdentityLabel(value, accountEmail);

  if (sanitizedValue === null) {
    return explicitNull;
  }

  let normalizedValue = sanitizedValue;

  if (normalizedValue.toLowerCase().startsWith("claude ")) {
    normalizedValue = normalizedValue.slice("claude ".length);
  } else if (normalizedValue.toLowerCase().startsWith("claude")) {
    normalizedValue = normalizedValue.slice("claude".length);
  }

  if (normalizedValue.toLowerCase().endsWith(" account")) {
    normalizedValue = normalizedValue.slice(0, -" account".length);
  } else if (normalizedValue.toLowerCase().endsWith("account")) {
    normalizedValue = normalizedValue.slice(0, -"account".length);
  }

  return normalizeClaudePlanLabel(normalizedValue, accountEmail);
};

const buildClaudeCliProbeCommand = (
  binaryPath: string,
  subcommand: "/status" | "/usage",
  timeoutMs: number,
): string => {
  const writes =
    subcommand === "/usage"
      ? [`${subcommand}\\r`, String.raw`\r`, String.raw`\r`]
      : [`${subcommand}\\r`, String.raw`\r`, String.raw`\r`, String.raw`\r`];
  const commandSegments = writes.map((write, index) =>
    index === writes.length - 1 ? `printf '${write}'` : `printf '${write}'; sleep 1`,
  );
  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  const probeCommand = `{ ${commandSegments.join("; ")}; } | script -qefc ${quoteShellArgument(
    `${binaryPath} --allowed-tools ""`,
  )} /dev/null`;

  return [
    `setsid sh -lc ${quoteShellArgument(probeCommand)} & pid=$!`,
    `{ sleep ${timeoutSeconds}; kill -TERM -- -"$pid" 2>/dev/null || true; } & sleeper=$!`,
    `wait "$pid" || true`,
    `kill "$sleeper" 2>/dev/null || true`,
  ].join("; ");
};

const runClaudeCliProbe = async (
  host: RuntimeHost,
  binaryPath: string,
  subcommand: "/status" | "/usage",
  timeoutMs: number,
): Promise<string> => {
  const commandResult = await host.commands.run("sh", [
    "-lc",
    buildClaudeCliProbeCommand(binaryPath, subcommand, timeoutMs),
  ]);
  const output = commandResult.stdout.trim();

  if (output !== "") {
    return output;
  }

  if (commandResult.stderr.trim() !== "") {
    return commandResult.stderr.trim();
  }

  return "";
};

const isProviderMetricInput = (value: unknown): value is ProviderMetricInput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["label"] === "string" &&
    value["label"] !== "" &&
    typeof value["value"] === "string" &&
    value["value"] !== "" &&
    (value["detail"] === undefined ||
      value["detail"] === null ||
      typeof value["detail"] === "string")
  );
};

const readProviderMetrics = (
  record: Record<string, unknown>,
  key: string,
): ProviderMetricInput[] | null => {
  const metrics = record[key];

  if (!Array.isArray(metrics)) {
    return explicitNull;
  }

  return metrics.every((metric) => isProviderMetricInput(metric)) ? metrics : explicitNull;
};

const resolveClaudeOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", ".credentials.json");

const resolveClaudeDefaultTokenFilePath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", claudeTokenFileNames[0]);

const resolveClaudeBinaryPath = async (host: RuntimeHost): Promise<string | null> => {
  const binaryPath = await host.commands.which("claude");

  if (binaryPath === null) {
    return explicitNull;
  }

  return host.fileSystem.realPath(binaryPath);
};

const resolveClaudeOAuthClientId = async (host: RuntimeHost): Promise<string> => {
  const binaryPath = await resolveClaudeBinaryPath(host);

  if (binaryPath === null) {
    throw new Error("Claude CLI is unavailable for OAuth refresh.");
  }

  const stringsResult = await host.commands.run("strings", [binaryPath], {
    timeoutMs: claudeTimeoutMs,
  });

  if (stringsResult.exitCode !== 0) {
    throw new Error("Failed to inspect the Claude CLI binary for OAuth metadata.");
  }

  const clientId =
    stringsResult.stdout.match(
      /TOKEN_URL:"https:\/\/platform\.claude\.com\/v1\/oauth\/token"[\s\S]{0,400}?CLIENT_ID:"([0-9a-f-]{36})"/u,
    )?.[1] ?? explicitNull;

  if (clientId === null) {
    throw new Error("Failed to discover Claude OAuth client metadata from the installed CLI.");
  }

  return clientId;
};

const resolveClaudeTokenFilePath = async (host: RuntimeHost): Promise<string | null> => {
  for (const fileName of claudeTokenFileNames) {
    const filePath = joinPath(host.homeDirectory, ".claude", fileName);

    if (await host.fileSystem.fileExists(filePath)) {
      return filePath;
    }
  }

  return explicitNull;
};

const resolveClaudeVersion = async (host: RuntimeHost): Promise<string | null> =>
  readCommandVersion(host, "claude", ["--version"], claudeTimeoutMs);

const collectClaudeMetrics = (usageRecord: ClaudeOAuthUsageResponse): ProviderMetricInput[] => {
  const metrics: ProviderMetricInput[] = [];

  if (
    usageRecord.fiveHour?.utilization !== null &&
    usageRecord.fiveHour?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.fiveHour.resetsAt,
      kind: "session",
      label: "Session",
      value: formatPercent(usageRecord.fiveHour.utilization),
    });
  }

  if (
    usageRecord.sevenDay?.utilization !== null &&
    usageRecord.sevenDay?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.sevenDay.resetsAt,
      kind: "weekly",
      label: "Weekly",
      value: formatPercent(usageRecord.sevenDay.utilization),
    });
  }

  if (
    usageRecord.sevenDaySonnet?.utilization !== null &&
    usageRecord.sevenDaySonnet?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.sevenDaySonnet.resetsAt,
      kind: "sonnet",
      label: "Sonnet",
      value: formatPercent(usageRecord.sevenDaySonnet.utilization),
    });
  }

  return metrics;
};

const normalizeClaudeExtraUsageAmounts = (
  usedCredits: number,
  monthlyLimit: number,
): { limit: number; used: number } => ({
  // Claude OAuth extra-usage amounts are returned in minor currency units.
  limit: monthlyLimit / 100,
  used: usedCredits / 100,
});

const parseClaudeExtraUsage = (
  extraUsageRecord: Record<string, unknown> | null,
): ClaudeExtraUsageSnapshot | null => {
  if (extraUsageRecord === null) {
    return explicitNull;
  }

  const isEnabled = readBoolean(extraUsageRecord, "is_enabled");

  if (isEnabled !== true) {
    return explicitNull;
  }

  const monthlyLimit = readFiniteNumber(extraUsageRecord, "monthly_limit");
  const usedCredits = readFiniteNumber(extraUsageRecord, "used_credits");

  if (monthlyLimit === null || usedCredits === null) {
    return explicitNull;
  }

  const normalizedAmounts = normalizeClaudeExtraUsageAmounts(usedCredits, monthlyLimit);

  return {
    currencyCode: readString(extraUsageRecord, "currency") ?? "USD",
    limit: normalizedAmounts.limit,
    used: normalizedAmounts.used,
  };
};

const parseClaudeCredentials = (value: unknown): ClaudeCredentialRecord | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const oauthRecord = readNestedRecord(value, "claudeAiOauth") ?? value;
  const accessToken = readString(oauthRecord, "accessToken");

  if (accessToken === null) {
    return explicitNull;
  }

  return {
    accessToken,
    expiresAt: readFiniteNumber(oauthRecord, "expiresAt"),
    rawRecord: value,
    refreshToken: readString(oauthRecord, "refreshToken"),
    subscriptionType:
      readString(oauthRecord, "subscriptionType") ??
      readString(oauthRecord, "rateLimitTier") ??
      readString(value, "plan") ??
      explicitNull,
  };
};

const parseClaudeAuthStatus = (value: unknown): ClaudeAuthStatusResponse | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  return {
    email: readString(value, "email"),
    loggedIn: readBoolean(value, "loggedIn"),
    subscriptionType: readString(value, "subscriptionType"),
  };
};

const readClaudeAuthStatus = async (
  host: RuntimeHost,
): Promise<{
  authStatus: ClaudeAuthStatusResponse | null;
  commandResult: RuntimeCommandResult;
}> => {
  const commandResult = await host.commands.run("claude", ["auth", "status", "--json"], {
    timeoutMs: claudeTimeoutMs,
  });

  if (commandResult.exitCode !== 0) {
    return {
      authStatus: explicitNull,
      commandResult,
    };
  }

  try {
    return {
      authStatus: parseClaudeAuthStatus(parseJsonText(commandResult.stdout)),
      commandResult,
    };
  } catch {
    return {
      authStatus: explicitNull,
      commandResult,
    };
  }
};

const updateClaudeCredentialRecord = (
  rawRecord: Record<string, unknown>,
  updates: {
    accessToken: string;
    expiresAt: number | null;
    accountEmail?: string | null;
    refreshToken: string | null;
    scopes?: string[] | null;
  },
): Record<string, unknown> => {
  const oauthRecord = readNestedRecord(rawRecord, "claudeAiOauth");
  const accountEmail = updates.accountEmail ?? readString(rawRecord, "email");
  const scopes =
    updates.scopes ??
    (oauthRecord && Array.isArray(oauthRecord["scopes"]) ? oauthRecord["scopes"] : explicitNull);

  if (oauthRecord !== null) {
    return {
      ...rawRecord,
      ...(accountEmail === null ? {} : { email: accountEmail }),
      claudeAiOauth: {
        ...oauthRecord,
        accessToken: updates.accessToken,
        expiresAt: updates.expiresAt,
        refreshToken: updates.refreshToken ?? readString(oauthRecord, "refreshToken"),
        ...(Array.isArray(scopes) ? { scopes } : {}),
      },
    };
  }

  return {
    ...rawRecord,
    ...(accountEmail === null ? {} : { email: accountEmail }),
    accessToken: updates.accessToken,
    expiresAt: updates.expiresAt,
    refreshToken: updates.refreshToken,
    ...(Array.isArray(scopes) ? { scopes } : {}),
  };
};

const refreshClaudeAccessToken = async (
  host: RuntimeHost,
  credentials: ClaudeCredentialRecord,
): Promise<ClaudeCredentialRecord> => {
  if (credentials.refreshToken === null || credentials.refreshToken === "") {
    throw new Error("Claude OAuth refresh token is unavailable.");
  }

  const oauthClientId = await resolveClaudeOAuthClientId(host);
  const refreshResponse = await host.http.request(claudeOAuthRefreshEndpoint, {
    body: new URLSearchParams({
      client_id: oauthClientId,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }).toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    timeoutMs: claudeTimeoutMs,
  });

  if (refreshResponse.statusCode !== 200) {
    throw new Error(`Claude OAuth refresh failed with HTTP ${refreshResponse.statusCode}.`);
  }

  const refreshPayload = parseJsonText(refreshResponse.bodyText);
  const accountRecord = isRecord(refreshPayload)
    ? readNestedRecord(refreshPayload, "account")
    : explicitNull;

  if (!isRecord(refreshPayload)) {
    throw new Error("Claude OAuth refresh returned invalid JSON.");
  }

  const expiresIn = readFiniteNumber(refreshPayload, "expires_in");
  const updatedRecord = updateClaudeCredentialRecord(credentials.rawRecord, {
    accessToken: readString(refreshPayload, "access_token") ?? credentials.accessToken,
    accountEmail:
      (accountRecord ? readString(accountRecord, "email_address") : explicitNull) ??
      (accountRecord ? readString(accountRecord, "email") : explicitNull),
    expiresAt: expiresIn === null ? credentials.expiresAt : host.now().valueOf() + expiresIn * 1000,
    refreshToken: readString(refreshPayload, "refresh_token") ?? credentials.refreshToken,
    scopes:
      readString(refreshPayload, "scope")
        ?.split(/\s+/u)
        .filter((value) => value !== "") ?? explicitNull,
  });

  await writeJsonFile(host, resolveClaudeOauthPath(host), updatedRecord);

  const nextCredentials = parseClaudeCredentials(updatedRecord);

  if (nextCredentials === null) {
    throw new Error("Claude OAuth refresh wrote an invalid credentials file.");
  }

  return nextCredentials;
};

const createClaudeOAuthUsageResponse = (value: unknown): ClaudeOAuthUsageResponse | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const readWindow = (key: string): ClaudeOAuthUsageWindow | null => {
    const window = readNestedRecord(value, key);

    if (window === null) {
      return explicitNull;
    }

    return {
      resetsAt: readString(window, "resets_at"),
      utilization: readFiniteNumber(window, "utilization"),
    };
  };

  return {
    extraUsage: readNestedRecord(value, "extra_usage"),
    fiveHour: readWindow("five_hour"),
    sevenDay: readWindow("seven_day"),
    sevenDaySonnet: readWindow("seven_day_sonnet"),
  };
};

const getActiveClaudeSessionToken = (providerConfig: {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}): string | null => {
  const activeTokenAccount = providerConfig.tokenAccounts[providerConfig.activeTokenAccountIndex];
  const sessionToken = activeTokenAccount?.token.trim();

  if (typeof sessionToken === "string" && sessionToken !== "") {
    return sessionToken;
  }

  return explicitNull;
};

const hasClaudeWebSession = async (
  host: RuntimeHost,
  providerConfig: {
    activeTokenAccountIndex: number;
    cookieSource: "auto" | "manual";
    tokenAccounts: {
      label: string;
      token: string;
    }[];
  },
): Promise<boolean> => {
  if (providerConfig.cookieSource === "manual") {
    return getActiveClaudeSessionToken(providerConfig) !== null;
  }

  if ((await resolveClaudeTokenFilePath(host)) !== null) {
    return true;
  }

  return (
    (await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    })) !== null
  );
};

const fetchClaudeWebUsage = async (
  host: RuntimeHost,
  session: ClaudeWebSessionSnapshot,
): Promise<ClaudeWebUsageResponse> => {
  const usageResponse = await host.http.request(
    `https://claude.ai/api/organizations/${session.organizationId}/usage`,
    {
      headers: {
        Accept: "application/json",
        Cookie: `sessionKey=${session.sessionToken}`,
      },
      method: "GET",
      timeoutMs: claudeTimeoutMs,
    },
  );

  if (usageResponse.statusCode < 200 || usageResponse.statusCode >= 300) {
    throw new Error(`Claude usage request failed with HTTP ${usageResponse.statusCode}.`);
  }

  const usagePayload = createClaudeOAuthUsageResponse(parseJsonText(usageResponse.bodyText));

  if (usagePayload === null) {
    throw new Error("Claude usage response was invalid.");
  }

  const metrics = collectClaudeMetrics(usagePayload);

  if (metrics.length === 0) {
    throw new Error("Claude web session did not include usage metrics.");
  }

  return {
    accountEmail: session.accountEmail,
    metrics,
  };
};

const parseClaudeOAuthSnapshot = (
  oauthPayload: ClaudeOAuthUsageResponse,
  credentials: ClaudeCredentialRecord,
  rawCredentials: Record<string, unknown>,
  fallbackAccountEmail: string | null,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"claude"> => {
  const metrics = collectClaudeMetrics(oauthPayload);
  const oauthRecord = readNestedRecord(rawCredentials, "claudeAiOauth");
  const extraUsage = parseClaudeExtraUsage(oauthPayload.extraUsage);
  const accountEmail =
    readString(rawCredentials, "email") ??
    (oauthRecord ? readJwtEmail(oauthRecord, "idToken") : explicitNull) ??
    (oauthRecord ? readJwtEmail(oauthRecord, "id_token") : explicitNull) ??
    fallbackAccountEmail;
  const planLabel = normalizeClaudePlanLabel(credentials.subscriptionType, accountEmail);

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude OAuth data did not include usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail,
    metrics,
    planLabel,
    providerCost:
      extraUsage === null
        ? explicitNull
        : createProviderCostSnapshot({
            currencyCode: extraUsage.currencyCode,
            limit: extraUsage.limit,
            periodLabel: "Monthly",
            updatedAt,
            used: extraUsage.used,
          }),
    sourceLabel: "oauth",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via OAuth.",
    withProviderDetails(snapshot, {
      accountOrg: explicitNull,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const parseClaudeCliSnapshot = (
  usageOutput: string,
  statusOutput: string | null,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"claude"> => {
  const cleanUsageOutput = normalizeCliText(usageOutput);
  const cleanStatusOutput = statusOutput === null ? explicitNull : normalizeCliText(statusOutput);
  const usageLines = cleanUsageOutput
    .split(/\n+/u)
    .map((line) => normalizeCliLine(line))
    .filter((line) => line !== "");
  const sessionMetric = findClaudeCliMetric(usageLines, ["Current session", "Curret session"]);
  const weeklyMetric = findClaudeCliMetric(usageLines, [
    "Current week (all models)",
    "Current week",
  ]);
  const sonnetMetric = findClaudeCliMetric(usageLines, [
    "Current week (Sonnet only)",
    "Current week (Sonnet)",
    "Current week (Opus)",
  ]);
  const metrics: ProviderMetricInput[] = [];
  const accountEmail =
    readClaudeCliPanelValue(cleanStatusOutput ?? cleanUsageOutput, ["Email", "Account"]) ??
    explicitNull;
  const accountOrg = sanitizeClaudeIdentityLabel(
    readClaudeCliPanelValue(cleanStatusOutput ?? cleanUsageOutput, ["Organization", "Org"]),
    accountEmail,
  );
  const planLabel = normalizeClaudeCliPlanLabel(
    readClaudeCliPanelValue(cleanStatusOutput ?? cleanUsageOutput, ["Login method"]),
    accountEmail,
  );

  if (sessionMetric.usedPercent !== null) {
    metrics.push({
      detail: formatClaudeCliResetAt(sessionMetric.resetAt, updatedAt),
      kind: "session",
      label: "Session",
      value: sessionMetric.usedPercent,
    });
  }

  if (weeklyMetric.usedPercent !== null) {
    metrics.push({
      detail: formatClaudeCliResetAt(weeklyMetric.resetAt, updatedAt),
      kind: "weekly",
      label: "Weekly",
      value: weeklyMetric.usedPercent,
    });
  }

  if (sonnetMetric.usedPercent !== null) {
    metrics.push({
      detail: formatClaudeCliResetAt(sonnetMetric.resetAt, updatedAt),
      kind: "sonnet",
      label: "Sonnet",
      value: sonnetMetric.usedPercent,
    });
  }

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail,
    metrics,
    planLabel,
    sourceLabel: "cli",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via CLI.",
    withProviderDetails(snapshot, {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const parseClaudeWebSnapshot = (
  tokenPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  const webMetrics = isRecord(tokenPayload) ? readProviderMetrics(tokenPayload, "metrics") : null;

  if (isRecord(tokenPayload) && webMetrics !== null) {
    const accountEmail = readString(tokenPayload, "accountEmail");
    const planLabel = normalizeClaudePlanLabel(readString(tokenPayload, "planLabel"), accountEmail);
    const accountOrg = sanitizeClaudeIdentityLabel(
      readClaudeOrganizationName(tokenPayload),
      accountEmail,
    );
    const snapshot = createSnapshot({
      accountEmail,
      metrics: webMetrics,
      planLabel,
      sourceLabel: "web",
      updatedAt,
      version: explicitNull,
    });

    return createRefreshSuccess(
      "claude",
      "Claude refreshed via web session.",
      withProviderDetails(snapshot, {
        accountOrg,
        kind: "claude",
        tokenCost: explicitNull,
      }),
    );
  }

  if (!isRecord(tokenPayload)) {
    return createRefreshError("claude", "Claude token file is not valid JSON.");
  }

  const usageRecord = createClaudeOAuthUsageResponse(
    readNestedRecord(tokenPayload, "usage") ?? tokenPayload,
  );
  const accountRecord = readNestedRecord(tokenPayload, "account");
  const metrics = usageRecord ? collectClaudeMetrics(usageRecord) : [];

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude web snapshot did not include usage metrics.");
  }

  const accountEmail =
    readString(tokenPayload, "email") ??
    (accountRecord ? readString(accountRecord, "email_address") : explicitNull);
  const planLabel = normalizeClaudePlanLabel(readString(tokenPayload, "plan"), accountEmail);
  const accountOrg = sanitizeClaudeIdentityLabel(
    readClaudeOrganizationName(tokenPayload, accountRecord),
    accountEmail,
  );
  const snapshot = createSnapshot({
    accountEmail,
    metrics,
    planLabel,
    sourceLabel: "web",
    updatedAt,
    version: explicitNull,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via web session.",
    withProviderDetails(snapshot, {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const fetchClaudeOAuthSnapshot = async (
  host: RuntimeHost,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const credentialsPayload = await readJsonFile(host, resolveClaudeOauthPath(host));

  if (credentialsPayload.status !== "ok") {
    return createRefreshError("claude", "Claude OAuth credentials could not be read.");
  }

  let credentials = parseClaudeCredentials(credentialsPayload.value);

  if (credentials === null) {
    return createRefreshError("claude", "Claude OAuth credentials are missing.");
  }

  if (
    credentials.expiresAt !== null &&
    Number.isFinite(credentials.expiresAt) &&
    credentials.expiresAt <= host.now().valueOf()
  ) {
    try {
      credentials = await refreshClaudeAccessToken(host, credentials);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude OAuth refresh failed.");
    }
  }

  const fetchUsage = async (
    accessToken: string,
    allowRefreshRetry: boolean,
  ): Promise<ProviderRefreshActionResult<"claude">> => {
    let usageResponse;

    try {
      usageResponse = await host.http.request(claudeOAuthUsageEndpoint, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": `claude-code/${fallbackClaudeCodeVersion}`,
          "anthropic-beta": oauthUsageBetaHeader,
        },
        method: "GET",
        timeoutMs: claudeTimeoutMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude OAuth request failed.");
    }

    if (usageResponse.statusCode === 401 && allowRefreshRetry && credentials?.refreshToken) {
      try {
        credentials = await refreshClaudeAccessToken(host, credentials);
      } catch (error) {
        if (error instanceof Error) {
          return createRefreshError("claude", error.message);
        }

        return createRefreshError("claude", "Claude OAuth refresh failed.");
      }

      if (credentials.accessToken !== accessToken) {
        return fetchUsage(credentials.accessToken, false);
      }
    }

    if (usageResponse.statusCode < 200 || usageResponse.statusCode >= 300) {
      return createRefreshError(
        "claude",
        `Claude OAuth request failed with HTTP ${usageResponse.statusCode}.`,
      );
    }

    let usagePayload: ClaudeOAuthUsageResponse | null;

    try {
      usagePayload = createClaudeOAuthUsageResponse(parseJsonText(usageResponse.bodyText));
    } catch {
      return createRefreshError("claude", "Claude OAuth response was invalid.");
    }

    if (usagePayload === null) {
      return createRefreshError("claude", "Claude OAuth response was invalid.");
    }

    if (credentials === null) {
      return createRefreshError("claude", "Claude OAuth credentials are missing.");
    }

    const currentCredentials: ClaudeCredentialRecord = credentials;
    const authStatusResult = await readClaudeAuthStatus(host);
    const version = await resolveClaudeVersion(host);

    return parseClaudeOAuthSnapshot(
      usagePayload,
      currentCredentials,
      currentCredentials.rawRecord,
      authStatusResult.authStatus?.email ?? explicitNull,
      host.now().toISOString(),
      version,
    );
  };

  return fetchUsage(credentials.accessToken, true);
};

const resolveClaudeSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth" | "web",
  providerConfig: {
    activeTokenAccountIndex: number;
    cookieSource: "auto" | "manual";
    tokenAccounts: {
      label: string;
      token: string;
    }[];
  },
): Promise<ClaudeResolvedSource | null> => {
  const hasOauth = await host.fileSystem.fileExists(resolveClaudeOauthPath(host));
  const hasCli = (await host.commands.which("claude")) !== null;

  if (selectedSource === "oauth") {
    return hasOauth ? "oauth" : explicitNull;
  }

  if (selectedSource === "cli") {
    return hasCli ? "cli" : explicitNull;
  }

  if (selectedSource === "web") {
    let hasWeb = false;

    try {
      hasWeb = await hasClaudeWebSession(host, providerConfig);
    } catch {
      hasWeb = false;
    }

    return hasWeb ? "web" : explicitNull;
  }

  if (hasOauth) {
    return "oauth";
  }

  if (hasCli) {
    return "cli";
  }

  let hasWeb = false;

  try {
    hasWeb = await hasClaudeWebSession(host, providerConfig);
  } catch {
    hasWeb = false;
  }

  if (hasWeb) {
    return "web";
  }

  return explicitNull;
};

const refreshClaudeViaCli = async (
  host: RuntimeHost,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const claudeBinaryPath = await host.commands.which("claude");
  const scriptBinaryPath = await host.commands.which("script");
  const version = await resolveClaudeVersion(host);

  if (claudeBinaryPath === null) {
    return createRefreshError("claude", "Claude CLI is unavailable.");
  }

  if (scriptBinaryPath === null) {
    return createRefreshError("claude", "Claude CLI PTY probing requires the script command.");
  }

  try {
    const usageOutput = await runClaudeCliProbe(
      host,
      claudeBinaryPath,
      "/usage",
      claudeCliUsageTimeoutMs,
    );
    const statusOutput = await runClaudeCliProbe(
      host,
      claudeBinaryPath,
      "/status",
      claudeCliStatusTimeoutMs,
    );
    const cliResult = parseClaudeCliSnapshot(
      usageOutput,
      statusOutput === "" ? explicitNull : statusOutput,
      host.now().toISOString(),
      version,
    );

    if (cliResult.status !== "error") {
      return cliResult;
    }
  } catch (error) {
    if (error instanceof Error) {
      return createRefreshError("claude", error.message);
    }

    return createRefreshError("claude", "Claude CLI refresh failed.");
  }

  return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
};

const createClaudeBrowserWebResult = async (
  host: RuntimeHost,
  session: ClaudeWebSessionSnapshot,
  updatedAt: string,
  version: string | null,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const webUsage = await fetchClaudeWebUsage(host, session);
  const accountOrg = sanitizeClaudeIdentityLabel(session.organizationName, webUsage.accountEmail);
  const snapshot = createSnapshot({
    accountEmail: webUsage.accountEmail,
    metrics: webUsage.metrics,
    planLabel: normalizeClaudePlanLabel(session.rateLimitTier, webUsage.accountEmail),
    sourceLabel: "web",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via web session.",
    withProviderDetails(snapshot, {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const refreshClaudeViaWeb = async (
  host: RuntimeHost,
  providerConfig: ClaudeProviderConfig,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const updatedAt = host.now().toISOString();
  const version = await resolveClaudeVersion(host);

  if (providerConfig.cookieSource === "manual") {
    const manualSession = await resolveClaudeWebSession(host, {
      cookieSource: "manual",
      manualSessionToken: getActiveClaudeSessionToken(providerConfig),
    });

    if (manualSession === null) {
      return createRefreshError("claude", "Claude manual session token is unavailable.");
    }

    try {
      return await createClaudeBrowserWebResult(host, manualSession, updatedAt, version);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude web session refresh failed.");
    }
  }

  try {
    const autoSession = await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    });

    if (autoSession !== null) {
      return await createClaudeBrowserWebResult(host, autoSession, updatedAt, version);
    }
  } catch {
    // Fall through to the legacy token-file path.
  }

  const tokenFilePath = await resolveClaudeTokenFilePath(host);

  if (tokenFilePath === null) {
    return createRefreshError("claude", "Claude token file is unavailable.");
  }

  const tokenPayload = await readJsonFile(host, tokenFilePath);

  if (tokenPayload.status !== "ok") {
    return createRefreshError("claude", "Claude token file could not be read.");
  }

  const webResult = parseClaudeWebSnapshot(tokenPayload.value, updatedAt);

  if (webResult.snapshot !== null) {
    webResult.snapshot = {
      ...webResult.snapshot,
      version,
    };
  }

  return webResult;
};

const refreshClaudeFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: ClaudeResolvedSource,
  providerConfig: ClaudeProviderConfig,
): Promise<ProviderRefreshActionResult<"claude">> => {
  if (resolvedSource === "oauth") {
    const oauthResult = await fetchClaudeOAuthSnapshot(host);

    if (oauthResult.status !== "error" || providerConfig.source !== "auto") {
      return oauthResult;
    }

    if ((await host.commands.which("claude")) !== null) {
      const cliResult = await refreshClaudeViaCli(host);

      if (cliResult.status !== "error") {
        return cliResult;
      }
    }

    return refreshClaudeViaWeb(host, providerConfig);
  }

  if (resolvedSource === "cli") {
    const cliResult = await refreshClaudeViaCli(host);

    if (cliResult.status !== "error" || providerConfig.source !== "auto") {
      return cliResult;
    }

    return refreshClaudeViaWeb(host, providerConfig);
  }

  return refreshClaudeViaWeb(host, providerConfig);
};

const createClaudeProviderAdapter = (host: RuntimeHost): ClaudeProviderAdapter => ({
  login: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "login">>
  > => {
    await host.spawnTerminal("claude", ["login"]);

    return createSuccessfulProviderActionResult("claude", "login", "Opened Claude login.");
  },
  openTokenFile: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "openTokenFile">>
  > => {
    const tokenFilePath =
      (await resolveClaudeTokenFilePath(host)) ?? resolveClaudeDefaultTokenFilePath(host);

    await host.openPath(tokenFilePath);

    return createSuccessfulProviderActionResult(
      "claude",
      "openTokenFile",
      "Opened the Claude token file.",
    );
  },
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"claude">> =>
    runResolvedRefresh({
      finalizeResult: (result) => finalizeClaudeRefresh(host, result),
      providerId: "claude",
      refreshFromResolvedSource: (resolvedSource) =>
        refreshClaudeFromResolvedSource(host, resolvedSource, providerConfig),
      resolveSource: () => resolveClaudeSource(host, providerConfig.source, providerConfig),
      unavailableMessage: "Claude credentials, CLI, or token file are unavailable.",
    }),
  reloadTokenFile: async (): Promise<
    ReturnType<typeof createErrorProviderActionResult<"claude", "reloadTokenFile">>
  > => {
    const tokenFilePath = await resolveClaudeTokenFilePath(host);

    if (tokenFilePath === null) {
      return createErrorProviderActionResult(
        "claude",
        "reloadTokenFile",
        "Claude token file does not exist.",
      );
    }

    await host.fileSystem.readTextFile(tokenFilePath);

    return createSuccessfulProviderActionResult(
      "claude",
      "reloadTokenFile",
      "Reloaded the Claude token file.",
    );
  },
  repair: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "repair">>
  > => {
    await host.spawnTerminal("claude", []);

    return createSuccessfulProviderActionResult(
      "claude",
      "repair",
      "Opened Claude terminal for repair.",
    );
  },
});

export {
  createClaudeProviderAdapter,
  resolveClaudeOauthPath,
  resolveClaudeSource,
  resolveClaudeTokenFilePath,
};
