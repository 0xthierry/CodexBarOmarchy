type TokenCostProviderId = "claude" | "codex";

interface TokenCostAggregateSnapshot {
  costUsd: number | null;
  tokens: number;
  unpricedModels: string[];
}

interface TokenCostDailyPoint {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
  date: string;
  inputTokens: number;
  modelsUsed: string[];
  outputTokens: number;
  totalTokens: number;
  unpricedModels: string[];
}

interface TokenCostSnapshot {
  daily: TokenCostDailyPoint[];
  last30Days: TokenCostAggregateSnapshot | null;
  today: TokenCostAggregateSnapshot | null;
  updatedAt: string;
}

interface TokenUsageByModel {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
}

export {
  type TokenCostAggregateSnapshot,
  type TokenCostDailyPoint,
  type TokenCostProviderId,
  type TokenCostSnapshot,
  type TokenUsageByModel,
};
