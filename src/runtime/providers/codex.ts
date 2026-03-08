/* eslint-disable max-lines-per-function, max-statements, no-magic-numbers, no-ternary, sort-imports */

import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import type {
  CodexProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatPercent,
  isRecord,
  joinPath,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

const codexStatusInput = "/status\n";
const codexTimeoutMs = 8_000;

type CodexResolvedSource = "cli" | "oauth";

const resolveCodexAuthPath = (host: RuntimeHost): string => {
  const configuredCodexHome = host.env["CODEX_HOME"];

  if (typeof configuredCodexHome === "string" && configuredCodexHome !== "") {
    return joinPath(configuredCodexHome, "auth.json");
  }

  return joinPath(host.homeDirectory, ".codex", "auth.json");
};

const parseCodexOAuthSnapshot = (
  authPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"codex"> => {
  if (!isRecord(authPayload)) {
    return createRefreshError("codex", "Codex auth.json is not valid JSON.");
  }

  const usageRecord = readNestedRecord(authPayload, "usage") ?? authPayload;
  const rateLimit = readNestedRecord(usageRecord, "rate_limit");
  const primaryWindow = rateLimit ? readNestedRecord(rateLimit, "primary_window") : explicitNull;
  const secondaryWindow = rateLimit ? readNestedRecord(rateLimit, "secondary_window") : explicitNull;
  const credits = readNestedRecord(usageRecord, "credits");
  const tokenRecord = readNestedRecord(authPayload, "tokens");
  const metrics = [];
  const primaryPercent = primaryWindow ? readFiniteNumber(primaryWindow, "used_percent") : explicitNull;
  const secondaryPercent = secondaryWindow
    ? readFiniteNumber(secondaryWindow, "used_percent")
    : explicitNull;
  const creditBalance = credits ? readFiniteNumber(credits, "balance") : explicitNull;

  if (primaryPercent !== null) {
    metrics.push({
      detail: readString(primaryWindow ?? usageRecord, "reset_at"),
      label: "Session",
      value: formatPercent(primaryPercent),
    });
  }

  if (secondaryPercent !== null) {
    metrics.push({
      detail: readString(secondaryWindow ?? usageRecord, "reset_at"),
      label: "Weekly",
      value: formatPercent(secondaryPercent),
    });
  }

  if (creditBalance !== null) {
    metrics.push({
      label: "Credits",
      value: creditBalance.toFixed(2),
    });
  }

  if (metrics.length === 0) {
    return createRefreshError("codex", "Codex OAuth data did not include rate-limit fields.");
  }

  return createRefreshSuccess(
    "codex",
    "Codex refreshed via OAuth.",
    createSnapshot({
      accountEmail:
        readString(authPayload, "account_email") ??
        readString(authPayload, "email") ??
        (tokenRecord ? readJwtEmail(tokenRecord, "id_token") : explicitNull) ??
        readString(authPayload, "account_id"),
      metrics,
      planLabel: readString(usageRecord, "plan") ?? readString(authPayload, "plan"),
      sourceLabel: "oauth",
      updatedAt,
      version: readString(usageRecord, "version") ?? readString(authPayload, "version"),
    }),
  );
};

const parseCodexCliSnapshot = (
  commandOutput: string,
  updatedAt: string,
): ProviderRefreshActionResult<"codex"> => {
  const creditsMatch = commandOutput.match(/Credits:\s*([0-9][0-9.,]*)/);
  const sessionMatch = commandOutput.match(/5h limit[^\n]*?([0-9]{1,3})%/);
  const weeklyMatch = commandOutput.match(/Weekly limit[^\n]*?([0-9]{1,3})%/);
  const metrics = [];
  const sessionPercent = sessionMatch?.[1];
  const weeklyPercent = weeklyMatch?.[1];
  const credits = creditsMatch?.[1];

  if (typeof sessionPercent === "string") {
    metrics.push({
      label: "Session",
      value: `${sessionPercent}%`,
    });
  }

  if (typeof weeklyPercent === "string") {
    metrics.push({
      label: "Weekly",
      value: `${weeklyPercent}%`,
    });
  }

  if (typeof credits === "string") {
    metrics.push({
      label: "Credits",
      value: credits,
    });
  }

  if (metrics.length === 0) {
    return createRefreshError("codex", "Codex CLI output did not contain usage metrics.");
  }

  return createRefreshSuccess(
    "codex",
    "Codex refreshed via CLI.",
    createSnapshot({
      metrics,
      sourceLabel: "cli",
      updatedAt,
    }),
  );
};

const resolveCodexSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth",
): Promise<CodexResolvedSource | null> => {
  const hasOauth = await host.fileSystem.fileExists(resolveCodexAuthPath(host));
  const hasCli = (await host.commands.which("codex")) !== null;

  if (selectedSource === "oauth") {
    return hasOauth ? "oauth" : explicitNull;
  }

  if (selectedSource === "cli") {
    return hasCli ? "cli" : explicitNull;
  }

  if (hasOauth) {
    return "oauth";
  }

  if (hasCli) {
    return "cli";
  }

  return explicitNull;
};

const createCodexProviderAdapter = (host: RuntimeHost): CodexProviderAdapter => ({
  login: async (): Promise<ReturnType<typeof createSuccessfulProviderActionResult<"codex", "login">>> => {
    await host.spawnTerminal("codex", ["login"]);

    return createSuccessfulProviderActionResult("codex", "login", "Opened Codex login.");
  },
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"codex">> => {
    const resolvedSource = await resolveCodexSource(host, providerConfig.source);

    if (resolvedSource === null) {
      return createRefreshError("codex", "Codex credentials or CLI are unavailable.");
    }

    const updatedAt = host.now().toISOString();

    if (resolvedSource === "oauth") {
      const authPayload = await readJsonFile(host, resolveCodexAuthPath(host));

      if (authPayload.status !== "ok") {
        return createRefreshError("codex", "Codex auth.json could not be read.");
      }

      return parseCodexOAuthSnapshot(authPayload.value, updatedAt);
    }

    const commandResult = await host.commands.run(
      "codex",
      ["-s", "read-only", "-a", "untrusted"],
      {
        input: codexStatusInput,
        timeoutMs: codexTimeoutMs,
      },
    );

    if (commandResult.exitCode !== 0) {
      return createRefreshError("codex", commandResult.stderr || "Codex CLI refresh failed.");
    }

    return parseCodexCliSnapshot(commandResult.stdout, updatedAt);
  },
});

export { createCodexProviderAdapter, resolveCodexAuthPath, resolveCodexSource };
