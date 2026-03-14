import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import type {
  CodexProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import type { CodexProviderConfig } from "@/core/providers/codex.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { finalizeCodexRefresh } from "@/runtime/providers/codex/enrich.ts";
import { resolveCodexAuthPath, resolveCodexSource } from "@/runtime/providers/codex/source-plan.ts";
import type { CodexResolvedSource } from "@/runtime/providers/codex/source-plan.ts";
import { fetchCodexCliSnapshot } from "@/runtime/providers/codex/sources/cli.ts";
import { fetchCodexOAuthSnapshot } from "@/runtime/providers/codex/sources/oauth.ts";
import {
  createSourceFailureDiagnostic,
  runResolvedRefresh,
  withSourceFailureDiagnostics,
} from "@/runtime/providers/shared.ts";

const refreshCodexFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: CodexResolvedSource,
  providerConfig: CodexProviderConfig,
): Promise<ProviderRefreshActionResult<"codex">> => {
  if (resolvedSource.kind === "oauth") {
    const oauthResult = await fetchCodexOAuthSnapshot(host, resolvedSource);

    if (providerConfig.source !== "auto" || oauthResult.status !== "error") {
      return oauthResult;
    }

    if (resolvedSource.fallbackCli === null) {
      return oauthResult;
    }

    return withSourceFailureDiagnostics(
      await fetchCodexCliSnapshot(host, resolvedSource.fallbackCli),
      [
        createSourceFailureDiagnostic({
          message: oauthResult.message,
          sourceLabel: "oauth",
        }),
      ],
    );
  }

  return fetchCodexCliSnapshot(host, resolvedSource);
};

const createCodexProviderAdapter = (host: RuntimeHost): CodexProviderAdapter => ({
  login: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"codex", "login">>
  > => {
    await host.spawnTerminal("codex", ["login"]);

    return createSuccessfulProviderActionResult("codex", "login", "Opened Codex login.");
  },
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"codex">> =>
    runResolvedRefresh({
      finalizeResult: (result) => finalizeCodexRefresh(host, providerConfig, result),
      providerId: "codex",
      refreshFromResolvedSource: (resolvedSource) =>
        refreshCodexFromResolvedSource(host, resolvedSource, providerConfig),
      resolveSource: () => resolveCodexSource(host, providerConfig.source),
      unavailableMessage: "Codex credentials or CLI are unavailable.",
    }),
});

export { createCodexProviderAdapter, resolveCodexAuthPath, resolveCodexSource };
