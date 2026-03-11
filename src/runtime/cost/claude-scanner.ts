import { homedir } from "node:os";
import { join } from "node:path";
import type { TokenCostDailyPoint, TokenUsageByModel } from "@/runtime/cost/models.ts";
import {
  dayKeyFromTimestamp,
  enumerateJsonlFiles,
  readJsonlRecords,
  roundUsd,
} from "@/runtime/cost/jsonl.ts";
import { claudeCostUsd } from "@/runtime/cost/pricing.ts";

interface ClaudeScanOptions {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
  projectRoots?: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null => {
  const value = record[key];
  return isRecord(value) ? value : null;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

const readInteger = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  return 0;
};

const compareStrings = (left: string, right: string): number => left.localeCompare(right);

const addModelUsage = (
  usageByDay: Map<string, Map<string, TokenUsageByModel>>,
  dayKey: string,
  model: string,
  usage: TokenUsageByModel,
): void => {
  const dayUsage = usageByDay.get(dayKey) ?? new Map<string, TokenUsageByModel>();
  const modelUsage = dayUsage.get(model) ?? {
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  modelUsage.inputTokens += usage.inputTokens;
  modelUsage.cacheReadTokens += usage.cacheReadTokens;
  modelUsage.cacheWriteTokens += usage.cacheWriteTokens;
  modelUsage.outputTokens += usage.outputTokens;
  dayUsage.set(model, modelUsage);
  usageByDay.set(dayKey, dayUsage);
};

const claudeProjectRoots = (options: ClaudeScanOptions): readonly string[] => {
  if (options.projectRoots !== undefined) {
    return options.projectRoots;
  }

  const homeDirectory = options.homeDirectory ?? homedir();
  const configuredRoots = options.env?.["CLAUDE_CONFIG_DIR"]?.trim();

  if (configuredRoots && configuredRoots !== "") {
    return configuredRoots
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part) => (part.endsWith("/projects") ? part : join(part, "projects")));
  }

  return [
    join(homeDirectory, ".config", "claude", "projects"),
    join(homeDirectory, ".claude", "projects"),
  ];
};

const toDailyPoints = (
  usageByDay: Map<string, Map<string, TokenUsageByModel>>,
): TokenCostDailyPoint[] =>
  [...usageByDay.entries()]
    .toSorted(([leftDay], [rightDay]) => compareStrings(leftDay, rightDay))
    .map(([dayKey, models]) => {
      let inputTokens = 0;
      let cacheReadTokens = 0;
      let cacheWriteTokens = 0;
      let outputTokens = 0;
      let costUsd = 0;
      const unpricedModels: string[] = [];
      const modelsUsed = [...models.keys()].toSorted(compareStrings);

      for (const [model, usage] of models.entries()) {
        inputTokens += usage.inputTokens;
        cacheReadTokens += usage.cacheReadTokens;
        cacheWriteTokens += usage.cacheWriteTokens;
        outputTokens += usage.outputTokens;
        const modelCost = claudeCostUsd({
          cacheCreationInputTokens: usage.cacheWriteTokens,
          cacheReadInputTokens: usage.cacheReadTokens,
          inputTokens: usage.inputTokens,
          model,
          outputTokens: usage.outputTokens,
        });

        if (modelCost === null) {
          unpricedModels.push(model);
        } else {
          costUsd += modelCost;
        }
      }

      return {
        cacheReadTokens,
        cacheWriteTokens,
        costUsd: roundUsd(costUsd),
        date: dayKey,
        inputTokens,
        modelsUsed,
        outputTokens,
        totalTokens: inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens,
        unpricedModels,
      };
    });

const scanClaudeTokenCostDaily = async (
  options: ClaudeScanOptions = {},
): Promise<TokenCostDailyPoint[]> => {
  const filePaths = await enumerateJsonlFiles(claudeProjectRoots(options));
  const usageByDay = new Map<string, Map<string, TokenUsageByModel>>();

  for (const filePath of filePaths) {
    const records = await readJsonlRecords(filePath);
    const seenStreamingKeys = new Set<string>();

    for (const recordValue of records) {
      if (!isRecord(recordValue) || readString(recordValue, "type") !== "assistant") {
        continue;
      }

      const timestamp = readString(recordValue, "timestamp");
      const message = readRecord(recordValue, "message");
      const usage = message ? readRecord(message, "usage") : null;
      const model = message ? readString(message, "model") : null;
      const dayKey = timestamp ? dayKeyFromTimestamp(timestamp) : null;

      if (message === null || usage === null || model === null || dayKey === null) {
        continue;
      }

      const messageId = readString(message, "id");
      const requestId = readString(recordValue, "requestId");

      if (messageId !== null && requestId !== null) {
        const streamingKey = `${messageId}:${requestId}`;

        if (seenStreamingKeys.has(streamingKey)) {
          continue;
        }

        seenStreamingKeys.add(streamingKey);
      }

      const tokenUsage: TokenUsageByModel = {
        cacheReadTokens: readInteger(usage, "cache_read_input_tokens"),
        cacheWriteTokens: readInteger(usage, "cache_creation_input_tokens"),
        inputTokens: readInteger(usage, "input_tokens"),
        outputTokens: readInteger(usage, "output_tokens"),
      };

      if (
        tokenUsage.inputTokens === 0 &&
        tokenUsage.cacheReadTokens === 0 &&
        tokenUsage.cacheWriteTokens === 0 &&
        tokenUsage.outputTokens === 0
      ) {
        continue;
      }

      addModelUsage(usageByDay, dayKey, model, tokenUsage);
    }
  }

  return toDailyPoints(usageByDay);
};

export { claudeProjectRoots, scanClaudeTokenCostDaily };
export type { ClaudeScanOptions };
