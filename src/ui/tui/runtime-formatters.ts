import type { ProviderMetricKind } from "@/core/store/runtime-state.ts";
import type { ProviderView } from "@/ui/tui/types.ts";

const formatTimestamp = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatShortTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatMonthDayTime = (value: Date): string =>
  `${value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} ${formatShortTime(value)}`;

const isSameLocalDate = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const parseIsoDate = (value: string): Date | null => {
  if (!value.includes("T")) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isEmailAddress = (value: string | null): boolean => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  const trimmedValue = value.trim();
  const separatorIndex = trimmedValue.indexOf("@");

  return (
    separatorIndex > 0 && separatorIndex < trimmedValue.length - 1 && !trimmedValue.includes(" ")
  );
};

const containsEmailAddress = (value: string | null): boolean => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  return /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(value);
};

const maskEmailAddress = (value: string | null): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return "unknown";
  }

  if (!isEmailAddress(value)) {
    return value;
  }

  const separatorIndex = value.indexOf("@");

  const localPart = value.slice(0, separatorIndex);
  const domainPart = value.slice(separatorIndex + 1);
  const targetPrefixLength = 3;
  const targetSuffixLength = 2;
  const visiblePrefixLength = Math.max(
    1,
    Math.min(targetPrefixLength, localPart.length - targetSuffixLength - 1),
  );
  const remainingLength = localPart.length - visiblePrefixLength;
  const visibleSuffixLength =
    remainingLength <= 1 ? 0 : Math.min(targetSuffixLength, remainingLength - 1);
  const visibleSuffix =
    visibleSuffixLength === 0 ? "" : localPart.slice(localPart.length - visibleSuffixLength);

  return `${localPart.slice(0, visiblePrefixLength)}****${visibleSuffix}@${domainPart}`;
};

const formatNonAccountIdentityValue = (value: string | null): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return "unknown";
  }

  return containsEmailAddress(value) ? "unknown" : value;
};

const formatProviderHealthLabel = (value: ProviderView["status"]["serviceStatus"]): string => {
  if (value === null) {
    return "Unknown";
  }

  if (value.indicator === "none") {
    return "Operational";
  }

  if (value.indicator === "maintenance") {
    return "Maintenance";
  }

  if (value.indicator === "minor") {
    return "Minor issue";
  }

  if (value.indicator === "major") {
    return "Major issue";
  }

  if (value.indicator === "critical") {
    return "Critical outage";
  }

  return "Unknown";
};

const describeMetric = (
  metric: { kind?: ProviderMetricKind; label: string },
  detail: string | null,
): string | null => {
  if (typeof detail === "string" && detail.trim() !== "") {
    const parsed = parseIsoDate(detail);

    if (parsed !== null) {
      const now = new Date();

      if (isSameLocalDate(parsed, now)) {
        return `Resets today ${formatShortTime(parsed)}`;
      }

      return `Resets ${formatMonthDayTime(parsed)}`;
    }

    return detail;
  }

  const metricKind = metric.kind ?? "custom";

  if (metricKind === "session") {
    return "Current session window";
  }

  if (metricKind === "weekly") {
    return "Current weekly window";
  }

  if (metricKind === "credits") {
    return "OpenAI credit balance";
  }

  if (metricKind === "sonnet") {
    return "Current Sonnet window";
  }

  if (metricKind === "flash" || metricKind === "pro") {
    return "Current Gemini quota window";
  }

  return null;
};

const formatUpdatedDisplay = (value: string | null): string => {
  if (typeof value !== "string" || value.trim() === "") {
    return "Never refreshed";
  }

  const parsed = parseIsoDate(value);

  if (parsed === null) {
    return value;
  }

  const now = new Date();

  if (isSameLocalDate(parsed, now)) {
    return `Today ${formatTimestamp(parsed)}`;
  }

  return formatMonthDayTime(parsed);
};

const formatHeaderClockDisplay = (value: Date): string => `Today ${formatTimestamp(value)}`;

export {
  describeMetric,
  formatNonAccountIdentityValue,
  formatHeaderClockDisplay,
  formatProviderHealthLabel,
  formatUpdatedDisplay,
  containsEmailAddress,
  isEmailAddress,
  maskEmailAddress,
  parseIsoDate,
};
