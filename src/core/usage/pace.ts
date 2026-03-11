import type { PaceSnapshot, ProviderRateWindowSnapshot } from "@/core/store/runtime-state.ts";
import { formatPaceStatusText } from "@/core/usage/pace-text.ts";

const millisecondsPerDay = 86_400_000;

const createPaceSnapshot = (
  rateWindow: ProviderRateWindowSnapshot,
  updatedAt: string | null,
  now: Date = new Date(),
): PaceSnapshot | null => {
  if (rateWindow.resetAt === null) {
    return null;
  }

  const resetAt = new Date(rateWindow.resetAt);
  const updatedAtDate = updatedAt === null ? now : new Date(updatedAt);

  if (
    Number.isNaN(resetAt.valueOf()) ||
    Number.isNaN(updatedAtDate.valueOf()) ||
    resetAt.valueOf() <= updatedAtDate.valueOf()
  ) {
    return null;
  }

  const daysUntilReset = (resetAt.valueOf() - updatedAtDate.valueOf()) / millisecondsPerDay;

  if (daysUntilReset <= 0 || rateWindow.usedPercent <= 0 || rateWindow.usedPercent >= 100) {
    return null;
  }

  const remainingPercent = 100 - rateWindow.usedPercent;
  const pacePerDay = rateWindow.usedPercent / Math.max(0.1, 7 - daysUntilReset);

  if (!Number.isFinite(pacePerDay) || pacePerDay <= 0) {
    return null;
  }

  const daysRemaining = remainingPercent / pacePerDay;

  return {
    daysRemaining,
    statusText: formatPaceStatusText({
      daysRemaining,
      windowLabel: rateWindow.label,
    }),
    windowLabel: rateWindow.label,
  };
};

const findRateWindow = (
  rateWindows: readonly ProviderRateWindowSnapshot[],
  label: string,
): ProviderRateWindowSnapshot | null =>
  rateWindows.find((rateWindow) => rateWindow.label === label) ?? null;

const createWeeklyPaceSnapshot = (
  rateWindows: readonly ProviderRateWindowSnapshot[],
  updatedAt: string | null,
  now: Date = new Date(),
): PaceSnapshot | null => {
  const weeklyWindow = findRateWindow(rateWindows, "Weekly");

  if (weeklyWindow !== null) {
    return createPaceSnapshot(weeklyWindow, updatedAt, now);
  }

  const sonnetWindow = findRateWindow(rateWindows, "Sonnet");

  return sonnetWindow === null ? null : createPaceSnapshot(sonnetWindow, updatedAt, now);
};

export { createPaceSnapshot, createWeeklyPaceSnapshot, findRateWindow };
