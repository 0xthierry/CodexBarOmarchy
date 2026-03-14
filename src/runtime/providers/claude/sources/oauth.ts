import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeCommandResult, RuntimeHost } from "@/runtime/host.ts";
import { collectClaudeMetrics, createClaudeOAuthUsageResponse, normalizeClaudePlanLabel, parseClaudeExtraUsage } from '@/runtime/providers/claude/normalize.ts';
import type { ClaudeOAuthUsageResponse } from '@/runtime/providers/claude/normalize.ts';
import {
  claudeOAuthRefreshEndpoint,
  claudeOAuthUsageEndpoint,
  claudeTimeoutMs,
  fallbackClaudeCodeVersion,
  oauthUsageBetaHeader,
  resolveClaudeVersion,
} from "@/runtime/providers/claude/runtime.ts";
import type { ClaudeResolvedOauthSource } from "@/runtime/providers/claude/source-plan.ts";
import {
  createProviderCostSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  isRecord,
  parseJsonText,
  readBoolean,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  withProviderDetails,
  writeJsonFile,
} from "@/runtime/providers/shared.ts";

interface ClaudeCredentialRecord {
  accessToken: string;
  expiresAt: number | null;
  rawRecord: Record<string, unknown>;
  refreshToken: string | null;
  subscriptionType: string | null;
}

interface ClaudeAuthStatusResponse {
  email: string | null;
  loggedIn: boolean | null;
  subscriptionType: string | null;
}

const resolveClaudeBinaryPath = async (host: RuntimeHost): Promise<string | null> => {
  const binaryPath = await host.commands.which("claude");

  if (binaryPath === null) {
    return explicitNull;
  }

  return host.fileSystem.realPath(binaryPath);
};

const resolveClaudeOAuthClientId = async (host: RuntimeHost): Promise<string> => {
  const binaryPath = await resolveClaudeBinaryPath(host);

  if (binaryPath === null) {
    throw new Error("Claude CLI is unavailable for OAuth refresh.");
  }

  const stringsResult = await host.commands.run("strings", [binaryPath], {
    timeoutMs: claudeTimeoutMs,
  });

  if (stringsResult.exitCode !== 0) {
    throw new Error("Failed to inspect the Claude CLI binary for OAuth metadata.");
  }

  const clientId =
    stringsResult.stdout.match(
      /TOKEN_URL:"https:\/\/platform\.claude\.com\/v1\/oauth\/token"[\s\S]{0,400}?CLIENT_ID:"([0-9a-f-]{36})"/u,
    )?.[1] ?? explicitNull;

  if (clientId === null) {
    throw new Error("Failed to discover Claude OAuth client metadata from the installed CLI.");
  }

  return clientId;
};

const parseClaudeCredentials = (value: unknown): ClaudeCredentialRecord | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const oauthRecord = readNestedRecord(value, "claudeAiOauth") ?? value;
  const accessToken = readString(oauthRecord, "accessToken");

  if (accessToken === null) {
    return explicitNull;
  }

  return {
    accessToken,
    expiresAt: readFiniteNumber(oauthRecord, "expiresAt"),
    rawRecord: value,
    refreshToken: readString(oauthRecord, "refreshToken"),
    subscriptionType:
      readString(oauthRecord, "subscriptionType") ??
      readString(oauthRecord, "rateLimitTier") ??
      readString(value, "plan") ??
      explicitNull,
  };
};

const parseClaudeAuthStatus = (value: unknown): ClaudeAuthStatusResponse | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  return {
    email: readString(value, "email"),
    loggedIn: readBoolean(value, "loggedIn"),
    subscriptionType: readString(value, "subscriptionType"),
  };
};

const readClaudeAuthStatus = async (
  host: RuntimeHost,
): Promise<{
  authStatus: ClaudeAuthStatusResponse | null;
  commandResult: RuntimeCommandResult;
}> => {
  const commandResult = await host.commands.run("claude", ["auth", "status", "--json"], {
    timeoutMs: claudeTimeoutMs,
  });

  if (commandResult.exitCode !== 0) {
    return {
      authStatus: explicitNull,
      commandResult,
    };
  }

  try {
    return {
      authStatus: parseClaudeAuthStatus(parseJsonText(commandResult.stdout)),
      commandResult,
    };
  } catch {
    return {
      authStatus: explicitNull,
      commandResult,
    };
  }
};

const updateClaudeCredentialRecord = (
  rawRecord: Record<string, unknown>,
  updates: {
    accessToken: string;
    expiresAt: number | null;
    accountEmail?: string | null;
    refreshToken: string | null;
    scopes?: string[] | null;
  },
): Record<string, unknown> => {
  const oauthRecord = readNestedRecord(rawRecord, "claudeAiOauth");
  const accountEmail = updates.accountEmail ?? readString(rawRecord, "email");
  const scopes =
    updates.scopes ??
    (oauthRecord && Array.isArray(oauthRecord["scopes"]) ? oauthRecord["scopes"] : explicitNull);

  if (oauthRecord !== null) {
    return {
      ...rawRecord,
      ...(accountEmail === null ? {} : { email: accountEmail }),
      claudeAiOauth: {
        ...oauthRecord,
        accessToken: updates.accessToken,
        expiresAt: updates.expiresAt,
        refreshToken: updates.refreshToken ?? readString(oauthRecord, "refreshToken"),
        ...(Array.isArray(scopes) ? { scopes } : {}),
      },
    };
  }

  return {
    ...rawRecord,
    ...(accountEmail === null ? {} : { email: accountEmail }),
    accessToken: updates.accessToken,
    expiresAt: updates.expiresAt,
    refreshToken: updates.refreshToken,
    ...(Array.isArray(scopes) ? { scopes } : {}),
  };
};

const refreshClaudeAccessToken = async (
  host: RuntimeHost,
  oauthPath: string,
  credentials: ClaudeCredentialRecord,
): Promise<ClaudeCredentialRecord> => {
  if (credentials.refreshToken === null || credentials.refreshToken === "") {
    throw new Error("Claude OAuth refresh token is unavailable.");
  }

  const oauthClientId = await resolveClaudeOAuthClientId(host);
  const refreshResponse = await host.http.request(claudeOAuthRefreshEndpoint, {
    body: new URLSearchParams({
      client_id: oauthClientId,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }).toString(),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    timeoutMs: claudeTimeoutMs,
  });

  if (refreshResponse.statusCode !== 200) {
    throw new Error(`Claude OAuth refresh failed with HTTP ${refreshResponse.statusCode}.`);
  }

  const refreshPayload = parseJsonText(refreshResponse.bodyText);
  const accountRecord = isRecord(refreshPayload)
    ? readNestedRecord(refreshPayload, "account")
    : explicitNull;

  if (!isRecord(refreshPayload)) {
    throw new Error("Claude OAuth refresh returned invalid JSON.");
  }

  const expiresIn = readFiniteNumber(refreshPayload, "expires_in");
  const updatedRecord = updateClaudeCredentialRecord(credentials.rawRecord, {
    accessToken: readString(refreshPayload, "access_token") ?? credentials.accessToken,
    accountEmail:
      (accountRecord ? readString(accountRecord, "email_address") : explicitNull) ??
      (accountRecord ? readString(accountRecord, "email") : explicitNull),
    expiresAt: expiresIn === null ? credentials.expiresAt : host.now().valueOf() + expiresIn * 1000,
    refreshToken: readString(refreshPayload, "refresh_token") ?? credentials.refreshToken,
    scopes:
      readString(refreshPayload, "scope")
        ?.split(/\s+/u)
        .filter((value) => value !== "") ?? explicitNull,
  });

  await writeJsonFile(host, oauthPath, updatedRecord);

  const nextCredentials = parseClaudeCredentials(updatedRecord);

  if (nextCredentials === null) {
    throw new Error("Claude OAuth refresh wrote an invalid credentials file.");
  }

  return nextCredentials;
};

const parseClaudeOAuthSnapshot = (
  oauthPayload: ClaudeOAuthUsageResponse,
  credentials: ClaudeCredentialRecord,
  rawCredentials: Record<string, unknown>,
  fallbackAccountEmail: string | null,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"claude"> => {
  const metrics = collectClaudeMetrics(oauthPayload);
  const oauthRecord = readNestedRecord(rawCredentials, "claudeAiOauth");
  const extraUsage = parseClaudeExtraUsage(oauthPayload.extraUsage);
  const accountEmail =
    readString(rawCredentials, "email") ??
    (oauthRecord ? readJwtEmail(oauthRecord, "idToken") : explicitNull) ??
    (oauthRecord ? readJwtEmail(oauthRecord, "id_token") : explicitNull) ??
    fallbackAccountEmail;
  const planLabel = normalizeClaudePlanLabel(credentials.subscriptionType, accountEmail);

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude OAuth data did not include usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail,
    metrics,
    planLabel,
    providerCost:
      extraUsage === null
        ? explicitNull
        : createProviderCostSnapshot({
            currencyCode: extraUsage.currencyCode,
            limit: extraUsage.limit,
            periodLabel: "Monthly",
            updatedAt,
            used: extraUsage.used,
          }),
    sourceLabel: "oauth",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via OAuth.",
    withProviderDetails(snapshot, {
      accountOrg: explicitNull,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const fetchClaudeOAuthSnapshot = async (
  host: RuntimeHost,
  resolvedSource: ClaudeResolvedOauthSource,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const credentialsPayload = await readJsonFile(host, resolvedSource.oauthPath);

  if (credentialsPayload.status !== "ok") {
    return createRefreshError("claude", "Claude OAuth credentials could not be read.");
  }

  const initialCredentials = parseClaudeCredentials(credentialsPayload.value);

  if (initialCredentials === null) {
    return createRefreshError("claude", "Claude OAuth credentials are missing.");
  }

  let credentials: ClaudeCredentialRecord = initialCredentials;

  if (
    credentials.expiresAt !== null &&
    Number.isFinite(credentials.expiresAt) &&
    credentials.expiresAt <= host.now().valueOf()
  ) {
    try {
      credentials = await refreshClaudeAccessToken(host, resolvedSource.oauthPath, credentials);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude OAuth refresh failed.");
    }
  }

  const fetchUsage = async (
    accessToken: string,
    allowRefreshRetry: boolean,
  ): Promise<ProviderRefreshActionResult<"claude">> => {
    const activeCredentials: ClaudeCredentialRecord = credentials;
    let usageResponse;

    try {
      usageResponse = await host.http.request(claudeOAuthUsageEndpoint, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": `claude-code/${fallbackClaudeCodeVersion}`,
          "anthropic-beta": oauthUsageBetaHeader,
        },
        method: "GET",
        timeoutMs: claudeTimeoutMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude OAuth request failed.");
    }

    if (usageResponse.statusCode === 401 && allowRefreshRetry && activeCredentials.refreshToken) {
      try {
        credentials = await refreshClaudeAccessToken(
          host,
          resolvedSource.oauthPath,
          activeCredentials,
        );
      } catch (error) {
        if (error instanceof Error) {
          return createRefreshError("claude", error.message);
        }

        return createRefreshError("claude", "Claude OAuth refresh failed.");
      }

      if (credentials.accessToken !== accessToken) {
        return fetchUsage(credentials.accessToken, false);
      }
    }

    if (usageResponse.statusCode < 200 || usageResponse.statusCode >= 300) {
      return createRefreshError(
        "claude",
        `Claude OAuth request failed with HTTP ${usageResponse.statusCode}.`,
      );
    }

    let usagePayload: ClaudeOAuthUsageResponse | null;

    try {
      usagePayload = createClaudeOAuthUsageResponse(parseJsonText(usageResponse.bodyText));
    } catch {
      return createRefreshError("claude", "Claude OAuth response was invalid.");
    }

    if (usagePayload === null) {
      return createRefreshError("claude", "Claude OAuth response was invalid.");
    }

    const authStatusResult = await readClaudeAuthStatus(host);
    const version = await resolveClaudeVersion(host);

    const finalCredentials: ClaudeCredentialRecord = credentials;

    return parseClaudeOAuthSnapshot(
      usagePayload,
      finalCredentials,
      finalCredentials.rawRecord,
      authStatusResult.authStatus?.email ?? explicitNull,
      host.now().toISOString(),
      version,
    );
  };

  return fetchUsage(credentials.accessToken, true);
};

export { fetchClaudeOAuthSnapshot };
