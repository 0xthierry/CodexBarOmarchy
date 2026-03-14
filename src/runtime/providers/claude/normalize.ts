import { explicitNull } from "@/core/providers/shared.ts";
import { createRateWindowMetricInput } from "@/runtime/providers/collection/snapshot.ts";
import {
  isRecord,
  readBoolean,
  readFiniteNumber,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";
import type { ProviderMetricInput } from "@/runtime/providers/shared.ts";

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

const collectClaudeMetrics = (usageRecord: ClaudeOAuthUsageResponse): ProviderMetricInput[] => {
  const metrics: ProviderMetricInput[] = [];

  if (
    usageRecord.fiveHour?.utilization !== null &&
    usageRecord.fiveHour?.utilization !== undefined
  ) {
    metrics.push(
      createRateWindowMetricInput({
        detail: usageRecord.fiveHour.resetsAt,
        kind: "session",
        label: "Session",
        usedPercent: usageRecord.fiveHour.utilization,
      }),
    );
  }

  if (
    usageRecord.sevenDay?.utilization !== null &&
    usageRecord.sevenDay?.utilization !== undefined
  ) {
    metrics.push(
      createRateWindowMetricInput({
        detail: usageRecord.sevenDay.resetsAt,
        kind: "weekly",
        label: "Weekly",
        usedPercent: usageRecord.sevenDay.utilization,
      }),
    );
  }

  if (
    usageRecord.sevenDaySonnet?.utilization !== null &&
    usageRecord.sevenDaySonnet?.utilization !== undefined
  ) {
    metrics.push(
      createRateWindowMetricInput({
        detail: usageRecord.sevenDaySonnet.resetsAt,
        kind: "sonnet",
        label: "Sonnet",
        usedPercent: usageRecord.sevenDaySonnet.utilization,
      }),
    );
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

export {
  collectClaudeMetrics,
  createClaudeOAuthUsageResponse,
  normalizeClaudePlanLabel,
  parseClaudeExtraUsage,
  readClaudeOrganizationName,
  sanitizeClaudeIdentityLabel,
  type ClaudeExtraUsageSnapshot,
  type ClaudeOAuthUsageResponse,
};
