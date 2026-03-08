/* eslint-disable import/consistent-type-specifier-style, no-duplicate-imports, sort-imports, @typescript-eslint/promise-function-async */

import {
  createErrorProviderActionResult,
  createUnsupportedProviderActionResult,
} from "@/core/actions/action-result.ts";
import type { ProviderActionResult } from "@/core/actions/action-result.ts";
import type { createDefaultConfig } from "@/core/config/schema.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { ProviderRuntimeSnapshot } from "@/core/store/runtime-state.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderId = "claude" | "codex" | "gemini";

interface ProviderAdapterContext<ProviderValue extends ProviderId> {
  config: OmarchyAgentBarConfig;
  providerConfig: OmarchyAgentBarConfig["providers"][ProviderValue];
}

interface ProviderRefreshActionResult<
  ProviderValue extends ProviderId,
> extends ProviderActionResult<ProviderValue, "refresh"> {
  snapshot: ProviderRuntimeSnapshot | null;
}

type ClaudeLoginActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "login">
>;
type ClaudeOpenTokenFileActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "openTokenFile">
>;
type ClaudeRecoveryActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "repair">
>;
type ClaudeRefreshActionResult = ProviderRefreshActionResult<"claude">;
type ClaudeReloadTokenFileActionResult = ReturnType<
  typeof createErrorProviderActionResult<"claude", "reloadTokenFile">
>;
type CodexLoginActionResult = ReturnType<typeof createErrorProviderActionResult<"codex", "login">>;
type CodexRefreshActionResult = ProviderRefreshActionResult<"codex">;
type GeminiLoginActionResult = ReturnType<
  typeof createErrorProviderActionResult<"gemini", "login">
>;
type GeminiRefreshActionResult = ProviderRefreshActionResult<"gemini">;
type LoginActionResult = ClaudeLoginActionResult | CodexLoginActionResult | GeminiLoginActionResult;
type OpenTokenFileActionResult = ClaudeOpenTokenFileActionResult;
type RecoveryActionResult =
  | ClaudeRecoveryActionResult
  | ReturnType<typeof createUnsupportedProviderActionResult<"codex", "repair">>
  | ReturnType<typeof createUnsupportedProviderActionResult<"gemini", "repair">>;
type RefreshActionResult =
  | ClaudeRefreshActionResult
  | CodexRefreshActionResult
  | GeminiRefreshActionResult;
type ReloadTokenFileActionResult = ClaudeReloadTokenFileActionResult;

const createRefreshActionResult = <ProviderValue extends ProviderId>(
  actionResult: ProviderActionResult<ProviderValue, "refresh">,
  snapshot: ProviderRuntimeSnapshot | null = explicitNull,
): ProviderRefreshActionResult<ProviderValue> => ({
  ...actionResult,
  snapshot,
});

interface SharedProviderAdapter<ProviderValue extends ProviderId> {
  login: (
    context: ProviderAdapterContext<ProviderValue>,
  ) => Promise<ReturnType<typeof createErrorProviderActionResult<ProviderValue, "login">>>;
  refresh: (
    context: ProviderAdapterContext<ProviderValue>,
  ) => Promise<ProviderRefreshActionResult<ProviderValue>>;
}

interface ClaudeProviderAdapter extends SharedProviderAdapter<"claude"> {
  openTokenFile: (
    context: ProviderAdapterContext<"claude">,
  ) => Promise<ClaudeOpenTokenFileActionResult>;
  reloadTokenFile: (
    context: ProviderAdapterContext<"claude">,
  ) => Promise<ClaudeReloadTokenFileActionResult>;
  repair: (
    context: ProviderAdapterContext<"claude">,
  ) => Promise<ReturnType<typeof createErrorProviderActionResult<"claude", "repair">>>;
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
  openTokenFile: async (): Promise<ClaudeOpenTokenFileActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult(
      "claude",
      "openTokenFile",
      "Claude token file action is not configured.",
    );
  },
  refresh: async (): Promise<ClaudeRefreshActionResult> => {
    await Promise.resolve();

    return createRefreshActionResult(
      createErrorProviderActionResult("claude", "refresh", "Claude adapter is not configured."),
    );
  },
  reloadTokenFile: async (): Promise<ClaudeReloadTokenFileActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult(
      "claude",
      "reloadTokenFile",
      "Claude token reload action is not configured.",
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

    return createRefreshActionResult(
      createErrorProviderActionResult("codex", "refresh", "Codex adapter is not configured."),
    );
  },
});

const createDefaultGeminiProviderAdapter = (): GeminiProviderAdapter => ({
  login: async (): Promise<GeminiLoginActionResult> => {
    await Promise.resolve();

    return createErrorProviderActionResult("gemini", "login", "Gemini adapter is not configured.");
  },
  refresh: async (): Promise<GeminiRefreshActionResult> => {
    await Promise.resolve();

    return createRefreshActionResult(
      createErrorProviderActionResult("gemini", "refresh", "Gemini adapter is not configured."),
    );
  },
});

const createDefaultProviderAdapters = (): ProviderAdapters => ({
  claude: createDefaultClaudeProviderAdapter(),
  codex: createDefaultCodexProviderAdapter(),
  gemini: createDefaultGeminiProviderAdapter(),
});

const createProviderAdapterContext = <ProviderValue extends ProviderId>(
  config: OmarchyAgentBarConfig,
  providerId: ProviderValue,
): ProviderAdapterContext<ProviderValue> => ({
  config,
  providerConfig: config.providers[providerId],
});

const dispatchLoginAction = (
  providerAdapters: ProviderAdapters,
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): Promise<LoginActionResult> => {
  if (providerId === "claude") {
    return Promise.resolve(
      providerAdapters.claude.login(createProviderAdapterContext(config, providerId)),
    );
  }

  if (providerId === "codex") {
    return Promise.resolve(
      providerAdapters.codex.login(createProviderAdapterContext(config, providerId)),
    );
  }

  return Promise.resolve(
    providerAdapters.gemini.login(createProviderAdapterContext(config, providerId)),
  );
};

const dispatchOpenTokenFileAction = (
  providerAdapters: ProviderAdapters,
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): Promise<OpenTokenFileActionResult> => {
  if (providerId !== "claude") {
    throw new Error("Only Claude supports opening the token file.");
  }

  return Promise.resolve(
    providerAdapters.claude.openTokenFile(createProviderAdapterContext(config, providerId)),
  );
};

const dispatchRecoveryAction = async (
  providerAdapters: ProviderAdapters,
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): Promise<RecoveryActionResult> => {
  if (providerId === "claude") {
    return providerAdapters.claude.repair(createProviderAdapterContext(config, providerId));
  }

  await Promise.resolve();

  return createUnsupportedProviderActionResult(
    providerId,
    "repair",
    `${providerId} does not support a recovery action.`,
  );
};

const dispatchRefreshAction = (
  providerAdapters: ProviderAdapters,
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): Promise<RefreshActionResult> => {
  if (providerId === "claude") {
    return Promise.resolve(
      providerAdapters.claude.refresh(createProviderAdapterContext(config, providerId)),
    );
  }

  if (providerId === "codex") {
    return Promise.resolve(
      providerAdapters.codex.refresh(createProviderAdapterContext(config, providerId)),
    );
  }

  return Promise.resolve(
    providerAdapters.gemini.refresh(createProviderAdapterContext(config, providerId)),
  );
};

const dispatchReloadTokenFileAction = (
  providerAdapters: ProviderAdapters,
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): Promise<ReloadTokenFileActionResult> => {
  if (providerId !== "claude") {
    throw new Error("Only Claude supports reloading the token file.");
  }

  return Promise.resolve(
    providerAdapters.claude.reloadTokenFile(createProviderAdapterContext(config, providerId)),
  );
};

export {
  createDefaultProviderAdapters,
  createRefreshActionResult,
  dispatchLoginAction,
  dispatchOpenTokenFileAction,
  dispatchRecoveryAction,
  dispatchRefreshAction,
  dispatchReloadTokenFileAction,
  type ClaudeProviderAdapter,
  type CodexProviderAdapter,
  type GeminiProviderAdapter,
  type LoginActionResult,
  type OpenTokenFileActionResult,
  type ProviderAdapterContext,
  type ProviderAdapters,
  type ProviderRefreshActionResult,
  type RecoveryActionResult,
  type RefreshActionResult,
  type ReloadTokenFileActionResult,
};
