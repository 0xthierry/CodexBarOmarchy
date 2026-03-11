import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { TokenCostDailyPoint, TokenUsageByModel } from "@/runtime/cost/models.ts";
import {
  dayKeyFromTimestamp,
  enumerateJsonlFiles,
  readJsonlRecords,
  roundUsd,
} from "@/runtime/cost/jsonl.ts";
import { codexCostUsd } from "@/runtime/cost/pricing.ts";

interface CodexScanOptions {
  env?: Record<string, string | undefined>;
  homeDirectory?: string;
}

interface CodexTokenUsageTotals {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
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

const codexRoots = (options: CodexScanOptions): readonly string[] => {
  const homeDirectory = options.homeDirectory ?? homedir();
  const codexHome = options.env?.["CODEX_HOME"]?.trim();
  const basePath = codexHome && codexHome !== "" ? codexHome : join(homeDirectory, ".codex");

  return [join(basePath, "sessions"), join(basePath, "archived_sessions")];
};

const fallbackDayKeyFromPath = (filePath: string): string | null => {
  const match =
    filePath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//u) ??
    basename(filePath).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/u);

  if (match === null) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
};

const parseCodexUsageDeltas = (
  tokenInfo: Record<string, unknown>,
  previousTotals: CodexTokenUsageTotals | null,
): { nextTotals: CodexTokenUsageTotals | null; usage: TokenUsageByModel | null } => {
  const totalUsage = readRecord(tokenInfo, "total_token_usage");

  if (totalUsage !== null) {
    const nextTotals: CodexTokenUsageTotals = {
      cachedInputTokens:
        readInteger(totalUsage, "cached_input_tokens") ||
        readInteger(totalUsage, "cache_read_input_tokens"),
      inputTokens: readInteger(totalUsage, "input_tokens"),
      outputTokens: readInteger(totalUsage, "output_tokens"),
    };
    const usage: TokenUsageByModel = {
      cacheReadTokens: Math.max(
        0,
        nextTotals.cachedInputTokens - (previousTotals?.cachedInputTokens ?? 0),
      ),
      cacheWriteTokens: 0,
      inputTokens: Math.max(0, nextTotals.inputTokens - (previousTotals?.inputTokens ?? 0)),
      outputTokens: Math.max(0, nextTotals.outputTokens - (previousTotals?.outputTokens ?? 0)),
    };

    if (usage.inputTokens === 0 && usage.cacheReadTokens === 0 && usage.outputTokens === 0) {
      return { nextTotals, usage: null };
    }

    return { nextTotals, usage };
  }

  const lastUsage = readRecord(tokenInfo, "last_token_usage");

  if (lastUsage === null) {
    return { nextTotals: previousTotals, usage: null };
  }

  const usage: TokenUsageByModel = {
    cacheReadTokens:
      readInteger(lastUsage, "cached_input_tokens") ||
      readInteger(lastUsage, "cache_read_input_tokens"),
    cacheWriteTokens: 0,
    inputTokens: readInteger(lastUsage, "input_tokens"),
    outputTokens: readInteger(lastUsage, "output_tokens"),
  };

  if (usage.inputTokens === 0 && usage.cacheReadTokens === 0 && usage.outputTokens === 0) {
    return { nextTotals: previousTotals, usage: null };
  }

  return { nextTotals: previousTotals, usage };
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
        const modelCost = codexCostUsd(
          model,
          usage.inputTokens,
          usage.cacheReadTokens,
          usage.outputTokens,
        );

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

const scanCodexTokenCostDaily = async (
  options: CodexScanOptions = {},
): Promise<TokenCostDailyPoint[]> => {
  const filePaths = await enumerateJsonlFiles(codexRoots(options));
  const usageByDay = new Map<string, Map<string, TokenUsageByModel>>();

  for (const filePath of filePaths) {
    const records = await readJsonlRecords(filePath);
    let currentModel = "gpt-5";
    let previousTotals: CodexTokenUsageTotals | null = null;
    const fallbackDayKey = fallbackDayKeyFromPath(filePath);

    for (const recordValue of records) {
      if (!isRecord(recordValue)) {
        continue;
      }

      const recordType = readString(recordValue, "type");

      if (recordType === "turn_context") {
        const payload = readRecord(recordValue, "payload");
        const info = payload ? readRecord(payload, "info") : null;

        currentModel =
          (payload ? readString(payload, "model") : null) ??
          (info ? readString(info, "model") : null) ??
          currentModel;
        continue;
      }

      if (recordType !== "event_msg") {
        continue;
      }

      const payload = readRecord(recordValue, "payload");
      const tokenInfo = payload ? readRecord(payload, "info") : null;

      if (payload === null || tokenInfo === null || readString(payload, "type") !== "token_count") {
        continue;
      }

      const dayKey =
        dayKeyFromTimestamp(readString(recordValue, "timestamp") ?? "") ?? fallbackDayKey;

      if (dayKey === null) {
        continue;
      }

      const model =
        readString(tokenInfo, "model") ??
        (payload ? readString(payload, "model") : null) ??
        readString(recordValue, "model") ??
        currentModel;
      const { nextTotals, usage } = parseCodexUsageDeltas(tokenInfo, previousTotals);

      previousTotals = nextTotals;

      if (usage === null) {
        continue;
      }

      addModelUsage(usageByDay, dayKey, model, {
        ...usage,
        cacheReadTokens: Math.min(usage.cacheReadTokens, usage.inputTokens),
      });
    }
  }

  return toDailyPoints(usageByDay);
};

export { scanCodexTokenCostDaily };
export type { CodexScanOptions };
