const codexPricing = {
  "gpt-5": {
    cacheReadInputCostPerToken: 1.25e-7,
    inputCostPerToken: 1.25e-6,
    outputCostPerToken: 1e-5,
  },
  "gpt-5-codex": {
    cacheReadInputCostPerToken: 1.25e-7,
    inputCostPerToken: 1.25e-6,
    outputCostPerToken: 1e-5,
  },
  "gpt-5.1": {
    cacheReadInputCostPerToken: 1.25e-7,
    inputCostPerToken: 1.25e-6,
    outputCostPerToken: 1e-5,
  },
  "gpt-5.1-codex-max": {
    cacheReadInputCostPerToken: 1.25e-7,
    inputCostPerToken: 1.25e-6,
    outputCostPerToken: 1e-5,
  },
  "gpt-5.1-codex-mini": {
    cacheReadInputCostPerToken: 2.5e-8,
    inputCostPerToken: 2.5e-7,
    outputCostPerToken: 2e-6,
  },
  "gpt-5.2": {
    cacheReadInputCostPerToken: 1.75e-7,
    inputCostPerToken: 1.75e-6,
    outputCostPerToken: 1.4e-5,
  },
  "gpt-5.2-codex": {
    cacheReadInputCostPerToken: 1.75e-7,
    inputCostPerToken: 1.75e-6,
    outputCostPerToken: 1.4e-5,
  },
  "gpt-5.3": {
    cacheReadInputCostPerToken: 1.75e-7,
    inputCostPerToken: 1.75e-6,
    outputCostPerToken: 1.4e-5,
  },
  "gpt-5.3-codex": {
    cacheReadInputCostPerToken: 1.75e-7,
    inputCostPerToken: 1.75e-6,
    outputCostPerToken: 1.4e-5,
  },
  "gpt-5.4": {
    cacheReadInputCostPerToken: 2.5e-7,
    inputCostPerToken: 2.5e-6,
    outputCostPerToken: 1.5e-5,
  },
} as const;

const claudePricing = {
  "claude-haiku-4-5": {
    cacheCreationInputCostPerToken: 1.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 1e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 1e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 5e-6,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-haiku-4-5-20251001": {
    cacheCreationInputCostPerToken: 1.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 1e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 1e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 5e-6,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-1": {
    cacheCreationInputCostPerToken: 1.875e-5,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 1.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 1.5e-5,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 7.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-20250514": {
    cacheCreationInputCostPerToken: 1.875e-5,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 1.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 1.5e-5,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 7.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-5": {
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 5e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 5e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 2.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-5-20251101": {
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 5e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 5e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 2.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-6": {
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 5e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 5e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 2.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-opus-4-6-20260205": {
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheCreationInputCostPerTokenAboveThreshold: null,
    cacheReadInputCostPerToken: 5e-7,
    cacheReadInputCostPerTokenAboveThreshold: null,
    inputCostPerToken: 5e-6,
    inputCostPerTokenAboveThreshold: null,
    outputCostPerToken: 2.5e-5,
    outputCostPerTokenAboveThreshold: null,
    thresholdTokens: null,
  },
  "claude-sonnet-4-20250514": {
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerToken: 3e-7,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
    inputCostPerToken: 3e-6,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerToken: 1.5e-5,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    thresholdTokens: 200_000,
  },
  "claude-sonnet-4-5": {
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerToken: 3e-7,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
    inputCostPerToken: 3e-6,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerToken: 1.5e-5,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    thresholdTokens: 200_000,
  },
  "claude-sonnet-4-5-20250929": {
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerToken: 3e-7,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
    inputCostPerToken: 3e-6,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerToken: 1.5e-5,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    thresholdTokens: 200_000,
  },
  "claude-sonnet-4-6": {
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerToken: 3e-7,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
    inputCostPerToken: 3e-6,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerToken: 1.5e-5,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    thresholdTokens: 200_000,
  },
} as const;

const hasOwn = <T extends object>(value: T, key: PropertyKey): key is keyof T =>
  Object.hasOwn(value, key);

const normalizeCodexModel = (rawModel: string): string => {
  let normalizedModel = rawModel.trim();

  if (normalizedModel.startsWith("openai/")) {
    normalizedModel = normalizedModel.slice("openai/".length);
  }

  if (normalizedModel.endsWith("-codex")) {
    const baseModel = normalizedModel.slice(0, -"-codex".length);

    if (baseModel in codexPricing) {
      return baseModel;
    }
  }

  return normalizedModel;
};

const normalizeClaudeModel = (rawModel: string): string => {
  let normalizedModel = rawModel.trim();

  if (normalizedModel.startsWith("anthropic.")) {
    normalizedModel = normalizedModel.slice("anthropic.".length);
  }

  const lastDotIndex = normalizedModel.lastIndexOf(".");

  if (lastDotIndex !== -1 && normalizedModel.includes("claude-")) {
    const tail = normalizedModel.slice(lastDotIndex + 1);

    if (tail.startsWith("claude-")) {
      normalizedModel = tail;
    }
  }

  normalizedModel = normalizedModel.replace(/-v\d+:\d+$/u, "");

  const baseModel = normalizedModel.replace(/-\d{8}$/u, "");

  return baseModel in claudePricing ? baseModel : normalizedModel;
};

const codexCostUsd = (
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number | null => {
  const normalizedModel = normalizeCodexModel(model);

  if (!hasOwn(codexPricing, normalizedModel)) {
    return null;
  }

  const pricing = codexPricing[normalizedModel];

  const safeInputTokens = Math.max(0, inputTokens);
  const safeCachedTokens = Math.min(Math.max(0, cachedInputTokens), safeInputTokens);
  const safeOutputTokens = Math.max(0, outputTokens);

  return (
    (safeInputTokens - safeCachedTokens) * pricing.inputCostPerToken +
    safeCachedTokens * pricing.cacheReadInputCostPerToken +
    safeOutputTokens * pricing.outputCostPerToken
  );
};

const tieredClaudeCost = (
  tokens: number,
  baseRate: number,
  thresholdTokens: number | null,
  aboveThresholdRate: number | null,
): number => {
  const safeTokens = Math.max(0, tokens);

  if (thresholdTokens === null || aboveThresholdRate === null) {
    return safeTokens * baseRate;
  }

  const belowThresholdTokens = Math.min(safeTokens, thresholdTokens);
  const aboveThresholdTokens = Math.max(0, safeTokens - thresholdTokens);

  return belowThresholdTokens * baseRate + aboveThresholdTokens * aboveThresholdRate;
};

const claudeCostUsd = (input: {
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  inputTokens: number;
  model: string;
  outputTokens: number;
}): number | null => {
  const normalizedModel = normalizeClaudeModel(input.model);

  if (!hasOwn(claudePricing, normalizedModel)) {
    return null;
  }

  const pricing = claudePricing[normalizedModel];

  return (
    tieredClaudeCost(
      input.inputTokens,
      pricing.inputCostPerToken,
      pricing.thresholdTokens,
      pricing.inputCostPerTokenAboveThreshold,
    ) +
    tieredClaudeCost(
      input.cacheReadInputTokens,
      pricing.cacheReadInputCostPerToken,
      pricing.thresholdTokens,
      pricing.cacheReadInputCostPerTokenAboveThreshold,
    ) +
    tieredClaudeCost(
      input.cacheCreationInputTokens,
      pricing.cacheCreationInputCostPerToken,
      pricing.thresholdTokens,
      pricing.cacheCreationInputCostPerTokenAboveThreshold,
    ) +
    tieredClaudeCost(
      input.outputTokens,
      pricing.outputCostPerToken,
      pricing.thresholdTokens,
      pricing.outputCostPerTokenAboveThreshold,
    )
  );
};

export { claudeCostUsd, codexCostUsd, normalizeClaudeModel, normalizeCodexModel };
