/* eslint-disable max-lines-per-function, max-statements, no-magic-numbers, no-ternary, sort-imports */

import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import type {
  ClaudeProviderAdapter,
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
  type ProviderMetricInput,
} from "@/runtime/providers/shared.ts";

const claudeStatusInput = "/status\n";
const claudeTimeoutMs = 8_000;
const claudeTokenFileNames = ["session-token.json", "session.json"] as const;

type ClaudeResolvedSource = "cli" | "oauth" | "web";

const resolveClaudeOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", ".credentials.json");

const resolveClaudeDefaultTokenFilePath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", claudeTokenFileNames[0]);

const resolveClaudeTokenFilePath = async (host: RuntimeHost): Promise<string | null> => {
  for (const fileName of claudeTokenFileNames) {
    const filePath = joinPath(host.homeDirectory, ".claude", fileName);

    if (await host.fileSystem.fileExists(filePath)) {
      return filePath;
    }
  }

  return explicitNull;
};

const collectClaudeMetrics = (usageRecord: Record<string, unknown>): ProviderMetricInput[] => {
  const fiveHour = readNestedRecord(usageRecord, "five_hour");
  const sevenDay = readNestedRecord(usageRecord, "seven_day");
  const sevenDaySonnet = readNestedRecord(usageRecord, "seven_day_sonnet");
  const metrics: ProviderMetricInput[] = [];

  if (fiveHour) {
    const utilization = readFiniteNumber(fiveHour, "utilization");

    if (utilization !== null) {
      metrics.push({
        detail: readString(fiveHour, "resets_at"),
        label: "Session",
        value: formatPercent(utilization),
      });
    }
  }

  if (sevenDay) {
    const utilization = readFiniteNumber(sevenDay, "utilization");

    if (utilization !== null) {
      metrics.push({
        detail: readString(sevenDay, "resets_at"),
        label: "Weekly",
        value: formatPercent(utilization),
      });
    }
  }

  if (sevenDaySonnet) {
    const utilization = readFiniteNumber(sevenDaySonnet, "utilization");

    if (utilization !== null) {
      metrics.push({
        detail: readString(sevenDaySonnet, "resets_at"),
        label: "Sonnet",
        value: formatPercent(utilization),
      });
    }
  }

  return metrics;
};

const parseClaudeOAuthSnapshot = (
  oauthPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  if (!isRecord(oauthPayload)) {
    return createRefreshError("claude", "Claude OAuth credentials are not valid JSON.");
  }

  const usageRecord = readNestedRecord(oauthPayload, "usage") ?? oauthPayload;
  const metrics = collectClaudeMetrics(usageRecord);
  const tokenRecord = readNestedRecord(oauthPayload, "tokens");

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude OAuth data did not include usage metrics.");
  }

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via OAuth.",
    createSnapshot({
      accountEmail:
        readString(oauthPayload, "email") ??
        (tokenRecord ? readJwtEmail(tokenRecord, "id_token") : explicitNull),
      metrics,
      planLabel: readString(usageRecord, "plan") ?? readString(oauthPayload, "plan"),
      sourceLabel: "oauth",
      updatedAt,
      version: readString(usageRecord, "version") ?? readString(oauthPayload, "version"),
    }),
  );
};

const parseClaudeCliSnapshot = (
  commandOutput: string,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  const sessionMatch = commandOutput.match(/Current session[^\n]*?([0-9]{1,3})%/);
  const weeklyMatch = commandOutput.match(/Current week \(all models\)[^\n]*?([0-9]{1,3})%/);
  const sonnetMatch = commandOutput.match(/Current week \((?:Opus|Sonnet)\)[^\n]*?([0-9]{1,3})%/);
  const accountMatch = commandOutput.match(/Account:\s*([^\n]+)/);
  const planMatch = commandOutput.match(/Org:\s*([^\n]+)/);
  const metrics: ProviderMetricInput[] = [];
  const sessionPercent = sessionMatch?.[1];
  const weeklyPercent = weeklyMatch?.[1];
  const sonnetPercent = sonnetMatch?.[1];

  if (typeof sessionPercent === "string") {
    metrics.push({ label: "Session", value: `${sessionPercent}%` });
  }

  if (typeof weeklyPercent === "string") {
    metrics.push({ label: "Weekly", value: `${weeklyPercent}%` });
  }

  if (typeof sonnetPercent === "string") {
    metrics.push({ label: "Sonnet", value: `${sonnetPercent}%` });
  }

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
  }

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via CLI.",
    createSnapshot({
      accountEmail: accountMatch?.[1]?.trim() ?? explicitNull,
      metrics,
      planLabel: planMatch?.[1]?.trim() ?? explicitNull,
      sourceLabel: "cli",
      updatedAt,
    }),
  );
};

const parseClaudeWebSnapshot = (
  tokenPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  if (!isRecord(tokenPayload)) {
    return createRefreshError("claude", "Claude token file is not valid JSON.");
  }

  const usageRecord = readNestedRecord(tokenPayload, "usage") ?? tokenPayload;
  const accountRecord = readNestedRecord(tokenPayload, "account");
  const metrics = collectClaudeMetrics(usageRecord);

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude web snapshot did not include usage metrics.");
  }

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via web session.",
    createSnapshot({
      accountEmail:
        readString(tokenPayload, "email") ??
        (accountRecord ? readString(accountRecord, "email_address") : explicitNull),
      metrics,
      planLabel: readString(tokenPayload, "plan"),
      sourceLabel: "web",
      updatedAt,
    }),
  );
};

const resolveClaudeSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth" | "web",
): Promise<ClaudeResolvedSource | null> => {
  const hasOauth = await host.fileSystem.fileExists(resolveClaudeOauthPath(host));
  const hasCli = (await host.commands.which("claude")) !== null;
  const hasWeb = (await resolveClaudeTokenFilePath(host)) !== null;

  if (selectedSource === "oauth") {
    return hasOauth ? "oauth" : explicitNull;
  }

  if (selectedSource === "cli") {
    return hasCli ? "cli" : explicitNull;
  }

  if (selectedSource === "web") {
    return hasWeb ? "web" : explicitNull;
  }

  if (hasOauth) {
    return "oauth";
  }

  if (hasCli) {
    return "cli";
  }

  if (hasWeb) {
    return "web";
  }

  return explicitNull;
};

const createClaudeProviderAdapter = (host: RuntimeHost): ClaudeProviderAdapter => ({
  login: async (): Promise<ReturnType<typeof createSuccessfulProviderActionResult<"claude", "login">>> => {
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
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"claude">> => {
    const resolvedSource = await resolveClaudeSource(host, providerConfig.source);

    if (resolvedSource === null) {
      return createRefreshError("claude", "Claude credentials, CLI, or token file are unavailable.");
    }

    const updatedAt = host.now().toISOString();

    if (resolvedSource === "oauth") {
      const oauthPayload = await readJsonFile(host, resolveClaudeOauthPath(host));

      if (oauthPayload.status !== "ok") {
        return createRefreshError("claude", "Claude OAuth credentials could not be read.");
      }

      return parseClaudeOAuthSnapshot(oauthPayload.value, updatedAt);
    }

    if (resolvedSource === "cli") {
      const commandResult = await host.commands.run("claude", [], {
        input: claudeStatusInput,
        timeoutMs: claudeTimeoutMs,
      });

      if (commandResult.exitCode !== 0) {
        return createRefreshError("claude", commandResult.stderr || "Claude CLI refresh failed.");
      }

      return parseClaudeCliSnapshot(commandResult.stdout, updatedAt);
    }

    const tokenFilePath = await resolveClaudeTokenFilePath(host);

    if (tokenFilePath === null) {
      return createRefreshError("claude", "Claude token file is unavailable.");
    }

    const tokenPayload = await readJsonFile(host, tokenFilePath);

    if (tokenPayload.status !== "ok") {
      return createRefreshError("claude", "Claude token file could not be read.");
    }

    return parseClaudeWebSnapshot(tokenPayload.value, updatedAt);
  },
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
  repair: async (): Promise<ReturnType<typeof createSuccessfulProviderActionResult<"claude", "repair">>> => {
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
