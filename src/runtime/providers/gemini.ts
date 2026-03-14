import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import type {
  GeminiProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { createRefreshError, runResolvedRefresh } from "@/runtime/providers/shared.ts";
import { finalizeGeminiRefresh } from "@/runtime/providers/gemini/enrich.ts";
import {
  readGeminiAuthType,
  resolveGeminiOauthPath,
  resolveGeminiSettingsPath,
  resolveGeminiSource,
} from "@/runtime/providers/gemini/source-plan.ts";
import type { GeminiResolvedSource } from "@/runtime/providers/gemini/source-plan.ts";
import { fetchGeminiApiSnapshot } from "@/runtime/providers/gemini/sources/api.ts";

const refreshGeminiFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: GeminiResolvedSource,
): Promise<ProviderRefreshActionResult<"gemini">> => {
  if (resolvedSource.kind === "api") {
    return fetchGeminiApiSnapshot(host, resolvedSource);
  }

  return createRefreshError("gemini", "Gemini OAuth credentials are unavailable.");
};

const createGeminiProviderAdapter = (host: RuntimeHost): GeminiProviderAdapter => ({
  login: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"gemini", "login">>
  > => {
    await host.spawnTerminal("gemini", ["auth", "login"]);

    return createSuccessfulProviderActionResult("gemini", "login", "Opened Gemini login.");
  },
  refresh: async (): Promise<ProviderRefreshActionResult<"gemini">> =>
    runResolvedRefresh({
      finalizeResult: (result) => finalizeGeminiRefresh(host, result),
      providerId: "gemini",
      refreshFromResolvedSource: (resolvedSource) =>
        refreshGeminiFromResolvedSource(host, resolvedSource),
      resolveSource: () => resolveGeminiSource(host),
      unavailableMessage: "Gemini OAuth credentials are unavailable.",
    }),
});

export {
  createGeminiProviderAdapter,
  readGeminiAuthType,
  resolveGeminiOauthPath,
  resolveGeminiSettingsPath,
  resolveGeminiSource,
};
