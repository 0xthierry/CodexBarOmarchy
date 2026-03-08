import {
  createErrorProviderActionResult,
  createUnsupportedProviderActionResult,
} from "@/core/actions/action-result.ts";

type ProviderId = "claude" | "codex" | "gemini";
type ClaudeLoginActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "login">
>;
type ClaudeRecoveryActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "repair">
>;
type ClaudeRefreshActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "refresh">
>;
type CodexLoginActionResult = ReturnType<typeof createErrorProviderActionResult<"codex", "login">>;
type CodexRefreshActionResult = ReturnType<
  typeof createErrorProviderActionResult<"codex", "refresh">
>;
type GeminiLoginActionResult = ReturnType<
  typeof createErrorProviderActionResult<"gemini", "login">
>;
type GeminiRefreshActionResult = ReturnType<
  typeof createErrorProviderActionResult<"gemini", "refresh">
>;
type LoginActionResult = ClaudeLoginActionResult | CodexLoginActionResult | GeminiLoginActionResult;
type RecoveryActionResult =
  | ClaudeRecoveryActionResult
  | ReturnType<typeof createUnsupportedProviderActionResult<"codex", "repair">>
  | ReturnType<typeof createUnsupportedProviderActionResult<"gemini", "repair">>;
type RefreshActionResult =
  | ClaudeRefreshActionResult
  | CodexRefreshActionResult
  | GeminiRefreshActionResult;

interface SharedProviderAdapter<ProviderValue extends ProviderId> {
  login: () => Promise<ReturnType<typeof createErrorProviderActionResult<ProviderValue, "login">>>;
  refresh: () => Promise<
    ReturnType<typeof createErrorProviderActionResult<ProviderValue, "refresh">>
  >;
}

interface ClaudeProviderAdapter extends SharedProviderAdapter<"claude"> {
  repair: () => Promise<ReturnType<typeof createErrorProviderActionResult<"claude", "repair">>>;
}

type CodexProviderAdapter = SharedProviderAdapter<"codex">;
type GeminiProviderAdapter = SharedProviderAdapter<"gemini">;

interface ProviderAdapters {
  claude: ClaudeProviderAdapter;
  codex: CodexProviderAdapter;
  gemini: GeminiProviderAdapter;
}

const createDefaultClaudeProviderAdapter = (): ClaudeProviderAdapter => ({
  login: async (): Promise<ClaudeLoginActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("claude", "login", "Claude adapter is not configured.");
  },
  refresh: async (): Promise<ClaudeRefreshActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult(
      "claude",
      "refresh",
      "Claude adapter is not configured.",
    );
  },
  repair: async (): Promise<ClaudeRecoveryActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("claude", "repair", "Claude adapter is not configured.");
  },
});

const createDefaultCodexProviderAdapter = (): CodexProviderAdapter => ({
  login: async (): Promise<CodexLoginActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("codex", "login", "Codex adapter is not configured.");
  },
  refresh: async (): Promise<CodexRefreshActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("codex", "refresh", "Codex adapter is not configured.");
  },
});

const createDefaultGeminiProviderAdapter = (): GeminiProviderAdapter => ({
  login: async (): Promise<GeminiLoginActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("gemini", "login", "Gemini adapter is not configured.");
  },
  refresh: async (): Promise<GeminiRefreshActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult(
      "gemini",
      "refresh",
      "Gemini adapter is not configured.",
    );
  },
});

const createDefaultProviderAdapters = (): ProviderAdapters => ({
  claude: createDefaultClaudeProviderAdapter(),
  codex: createDefaultCodexProviderAdapter(),
  gemini: createDefaultGeminiProviderAdapter(),
});

const dispatchLoginAction = async (
  providerAdapters: ProviderAdapters,
  providerId: ProviderId,
): Promise<LoginActionResult> => {
  if (providerId === "claude") {
    const actionResult = await providerAdapters.claude.login();

    return actionResult;
  }

  if (providerId === "codex") {
    const actionResult = await providerAdapters.codex.login();

    return actionResult;
  }

  const actionResult = await providerAdapters.gemini.login();

  return actionResult;
};

const dispatchRecoveryAction = async (
  providerAdapters: ProviderAdapters,
  providerId: ProviderId,
): Promise<RecoveryActionResult> => {
  if (providerId === "claude") {
    const actionResult = await providerAdapters.claude.repair();

    return actionResult;
  }

  await Promise.resolve();

  return createUnsupportedProviderActionResult(
    providerId,
    "repair",
    `${providerId} does not support a recovery action.`,
  );
};

const dispatchRefreshAction = async (
  providerAdapters: ProviderAdapters,
  providerId: ProviderId,
): Promise<RefreshActionResult> => {
  if (providerId === "claude") {
    const actionResult = await providerAdapters.claude.refresh();

    return actionResult;
  }

  if (providerId === "codex") {
    const actionResult = await providerAdapters.codex.refresh();

    return actionResult;
  }

  const actionResult = await providerAdapters.gemini.refresh();

  return actionResult;
};

export {
  createDefaultProviderAdapters,
  dispatchLoginAction,
  dispatchRecoveryAction,
  dispatchRefreshAction,
  type ClaudeProviderAdapter,
  type CodexProviderAdapter,
  type GeminiProviderAdapter,
  type LoginActionResult,
  type ProviderAdapters,
  type RecoveryActionResult,
  type RefreshActionResult,
};
