import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import type {
  ClaudeProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { finalizeClaudeRefresh } from "@/runtime/providers/claude/enrich.ts";
import {
  resolveClaudeDefaultTokenFilePath,
  resolveClaudeOauthPath,
  resolveClaudeSource,
  resolveClaudeTokenFilePath,
  resolveClaudeWebSource,
} from "@/runtime/providers/claude/source-plan.ts";
import type { ClaudeResolvedSource } from "@/runtime/providers/claude/source-plan.ts";
import { fetchClaudeOAuthSnapshot } from "@/runtime/providers/claude/sources/oauth.ts";
import { refreshClaudeViaCli } from "@/runtime/providers/claude/sources/cli.ts";
import { refreshClaudeViaWeb } from "@/runtime/providers/claude/sources/web.ts";
import { runResolvedRefresh } from "@/runtime/providers/shared.ts";

interface ClaudeProviderConfig {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  source: "auto" | "cli" | "oauth" | "web";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}

const refreshClaudeFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: ClaudeResolvedSource,
  providerConfig: ClaudeProviderConfig,
): Promise<ProviderRefreshActionResult<"claude">> => {
  if (resolvedSource.kind === "oauth") {
    const oauthResult = await fetchClaudeOAuthSnapshot(host, resolvedSource);

    if (oauthResult.status !== "error" || providerConfig.source !== "auto") {
      return oauthResult;
    }

    if (resolvedSource.fallbackCli !== null) {
      const cliResult = await refreshClaudeViaCli(host, resolvedSource.fallbackCli);

      if (cliResult.status !== "error") {
        return cliResult;
      }
    }

    const webSource = await resolveClaudeWebSource(host, providerConfig);

    if (webSource === null) {
      return oauthResult;
    }

    return refreshClaudeViaWeb(host, webSource);
  }

  if (resolvedSource.kind === "cli") {
    const cliResult = await refreshClaudeViaCli(host, resolvedSource.cli);

    if (cliResult.status !== "error" || providerConfig.source !== "auto") {
      return cliResult;
    }

    if (resolvedSource.fallbackWeb === null) {
      return cliResult;
    }

    return refreshClaudeViaWeb(host, resolvedSource.fallbackWeb);
  }

  return refreshClaudeViaWeb(host, resolvedSource.web);
};

const createClaudeProviderAdapter = (host: RuntimeHost): ClaudeProviderAdapter => ({
  login: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "login">>
  > => {
    await host.spawnTerminal("claude", ["login"]);

    return createSuccessfulProviderActionResult("claude", "login", "Opened Claude login.");
  },
  openTokenFile: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "openTokenFile">>
  > => {
    const tokenFilePath =
      (await resolveClaudeTokenFilePath(host)) ?? resolveClaudeDefaultTokenFilePath(host);

    await host.openPath(tokenFilePath);

    return createSuccessfulProviderActionResult(
      "claude",
      "openTokenFile",
      "Opened the Claude token file.",
    );
  },
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"claude">> =>
    runResolvedRefresh({
      finalizeResult: (result) => finalizeClaudeRefresh(host, result),
      providerId: "claude",
      refreshFromResolvedSource: (resolvedSource) =>
        refreshClaudeFromResolvedSource(host, resolvedSource, providerConfig),
      resolveSource: () => resolveClaudeSource(host, providerConfig.source, providerConfig),
      unavailableMessage: "Claude credentials, CLI, or token file are unavailable.",
    }),
  reloadTokenFile: async (): Promise<
    ReturnType<typeof createErrorProviderActionResult<"claude", "reloadTokenFile">>
  > => {
    const tokenFilePath = await resolveClaudeTokenFilePath(host);

    if (tokenFilePath === null) {
      return createErrorProviderActionResult(
        "claude",
        "reloadTokenFile",
        "Claude token file does not exist.",
      );
    }

    await host.fileSystem.readTextFile(tokenFilePath);

    return createSuccessfulProviderActionResult(
      "claude",
      "reloadTokenFile",
      "Reloaded the Claude token file.",
    );
  },
  repair: async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<"claude", "repair">>
  > => {
    await host.spawnTerminal("claude", []);

    return createSuccessfulProviderActionResult(
      "claude",
      "repair",
      "Opened Claude terminal for repair.",
    );
  },
});

export {
  createClaudeProviderAdapter,
  resolveClaudeOauthPath,
  resolveClaudeSource,
  resolveClaudeTokenFilePath,
};
