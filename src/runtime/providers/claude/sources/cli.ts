import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  createRateWindowMetricInput,
  createRefreshSuccessFromSeed,
} from "@/runtime/providers/collection/snapshot.ts";
import type { ProviderMetricInput } from "@/runtime/providers/collection/snapshot.ts";
import {
  normalizeClaudePlanLabel,
  sanitizeClaudeIdentityLabel,
} from "@/runtime/providers/claude/normalize.ts";
import {
  claudeCliStatusTimeoutMs,
  claudeCliUsageTimeoutMs,
  resolveClaudeVersion,
} from "@/runtime/providers/claude/runtime.ts";
import type { ClaudeCliSourceHandle } from "@/runtime/providers/claude/source-plan.ts";
import { createRefreshError } from "@/runtime/providers/shared.ts";

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
): { resetAt: string | null; usedPercent: number | null } => {
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
  let usedPercent: number | null = explicitNull;

  for (const line of lines.slice(labelIndex + 1, labelIndex + 5)) {
    const normalizedLine = compactCliToken(line);

    if (normalizedBoundaryLabels.some((label) => normalizedLine.includes(label))) {
      break;
    }

    if (usedPercent === null) {
      const percentMatch = line.match(/([0-9]{1,3})%\s*used/iu) ?? line.match(/([0-9]{1,3})%/u);

      if (typeof percentMatch?.[1] === "string") {
        const parsedPercent = Number(percentMatch[1]);

        if (Number.isFinite(parsedPercent)) {
          usedPercent = parsedPercent;
        }
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
    metrics.push(
      createRateWindowMetricInput({
        detail: formatClaudeCliResetAt(sessionMetric.resetAt, updatedAt),
        kind: "session",
        label: "Session",
        usedPercent: sessionMetric.usedPercent,
      }),
    );
  }

  if (weeklyMetric.usedPercent !== null) {
    metrics.push(
      createRateWindowMetricInput({
        detail: formatClaudeCliResetAt(weeklyMetric.resetAt, updatedAt),
        kind: "weekly",
        label: "Weekly",
        usedPercent: weeklyMetric.usedPercent,
      }),
    );
  }

  if (sonnetMetric.usedPercent !== null) {
    metrics.push(
      createRateWindowMetricInput({
        detail: formatClaudeCliResetAt(sonnetMetric.resetAt, updatedAt),
        kind: "sonnet",
        label: "Sonnet",
        usedPercent: sonnetMetric.usedPercent,
      }),
    );
  }

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
  }

  return createRefreshSuccessFromSeed("claude", "Claude refreshed via CLI.", {
    accountEmail,
    metrics,
    planLabel,
    providerDetails: {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    },
    sourceLabel: "cli",
    updatedAt,
    version,
  });
};

const refreshClaudeViaCli = async (
  host: RuntimeHost,
  resolvedSource: ClaudeCliSourceHandle,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const version = await resolveClaudeVersion(host);

  if (resolvedSource.scriptBinaryPath === null) {
    return createRefreshError("claude", "Claude CLI PTY probing requires the script command.");
  }

  try {
    const usageOutput = await runClaudeCliProbe(
      host,
      resolvedSource.claudeBinaryPath,
      "/usage",
      claudeCliUsageTimeoutMs,
    );
    const statusOutput = await runClaudeCliProbe(
      host,
      resolvedSource.claudeBinaryPath,
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

export { refreshClaudeViaCli };
