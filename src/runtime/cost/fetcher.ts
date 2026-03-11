import { scanClaudeTokenCostDaily } from "@/runtime/cost/claude-scanner.ts";
import { scanCodexTokenCostDaily } from "@/runtime/cost/codex-scanner.ts";
import type {
  TokenCostAggregateSnapshot,
  TokenCostDailyPoint,
  TokenCostProviderId,
  TokenCostSnapshot,
} from "@/runtime/cost/models.ts";

interface TokenCostFetchOptions {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  now?: Date;
}

const addDays = (value: Date, days: number): Date => {
  const nextValue = new Date(value);
  nextValue.setUTCDate(nextValue.getUTCDate() + days);
  return nextValue;
};

const createAggregate = (
  dailyPoints: readonly TokenCostDailyPoint[],
): TokenCostAggregateSnapshot | null => {
  if (dailyPoints.length === 0) {
    return null;
  }

  let costUsd = 0;
  let hasUnpricedUsage = false;
  let tokens = 0;
  const unpricedModels = new Set<string>();

  for (const dailyPoint of dailyPoints) {
    if (dailyPoint.costUsd === null) {
      hasUnpricedUsage = true;
      for (const model of dailyPoint.unpricedModels) {
        unpricedModels.add(model);
      }
    } else {
      costUsd += dailyPoint.costUsd;
    }

    tokens += dailyPoint.totalTokens;
  }

  return {
    costUsd: hasUnpricedUsage ? null : Math.round(costUsd * 1_000_000) / 1_000_000,
    tokens,
    unpricedModels: [...unpricedModels].toSorted(),
  };
};

const createTokenCostSnapshot = (
  dailyPoints: readonly TokenCostDailyPoint[],
  now: Date,
): TokenCostSnapshot => {
  const todayKey = now.toISOString().slice(0, 10);
  const last30StartKey = addDays(now, -29).toISOString().slice(0, 10);
  const todayPoints = dailyPoints.filter((dailyPoint) => dailyPoint.date === todayKey);
  const last30Points = dailyPoints.filter(
    (dailyPoint) => dailyPoint.date >= last30StartKey && dailyPoint.date <= todayKey,
  );

  return {
    daily: [...dailyPoints],
    last30Days: createAggregate(last30Points),
    today: createAggregate(todayPoints),
    updatedAt: now.toISOString(),
  };
};

const fetchTokenCostSnapshot = async (
  provider: TokenCostProviderId,
  options: TokenCostFetchOptions = {},
): Promise<TokenCostSnapshot> => {
  const now = options.now ?? new Date();
  const daily =
    provider === "claude"
      ? await scanClaudeTokenCostDaily(options)
      : await scanCodexTokenCostDaily(options);

  return createTokenCostSnapshot(daily, now);
};

export { createTokenCostSnapshot, fetchTokenCostSnapshot };
export type { TokenCostFetchOptions };
