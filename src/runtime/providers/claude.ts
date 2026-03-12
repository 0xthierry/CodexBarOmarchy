import {
  createErrorProviderActionResult,
  createSuccessfulProviderActionResult,
} from "@/core/actions/action-result.ts";
import type {
  ClaudeProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeCommandResult, RuntimeHost } from "@/runtime/host.ts";
import { fetchTokenCostSnapshot } from "@/runtime/cost/fetcher.ts";
import { resolveClaudeWebSession } from "@/runtime/providers/claude-web-auth.ts";
import type { ClaudeWebSessionSnapshot } from "@/runtime/providers/claude-web-models.ts";
import {
  createProviderCostSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatPercent,
  isRecord,
  joinPath,
  parseJsonText,
  readBoolean,
  readCommandVersion,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  runResolvedRefresh,
  withProviderDetails,
  writeJsonFile,
} from "@/runtime/providers/shared.ts";
import { tryFetchProviderServiceStatus } from "@/runtime/providers/service-status.ts";
import type { ProviderMetricInput } from "@/runtime/providers/shared.ts";

const claudeOAuthRefreshEndpoint = "https://platform.claude.com/v1/oauth/token";
const claudeOAuthUsageEndpoint = "https://api.anthropic.com/api/oauth/usage";
const claudeStatusInput = "/status\n";
const claudeTimeoutMs = 8000;
const claudeTokenFileNames = ["session-token.json", "session.json"] as const;
const fallbackClaudeCodeVersion = "2.1.0";
const oauthUsageBetaHeader = "oauth-2025-04-20";
const claudeStatusPageUrl = "https://status.claude.com";

type ClaudeResolvedSource = "cli" | "oauth" | "web";

interface ClaudeProviderConfig {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  source: "auto" | "cli" | "oauth" | "web";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}

interface ClaudeCredentialRecord {
  accessToken: string;
  expiresAt: number | null;
  rawRecord: Record<string, unknown>;
  refreshToken: string | null;
  subscriptionType: string | null;
}

interface ClaudeOAuthUsageWindow {
  resetsAt: string | null;
  utilization: number | null;
}

interface ClaudeOAuthUsageResponse {
  extraUsage: Record<string, unknown> | null;
  fiveHour: ClaudeOAuthUsageWindow | null;
  sevenDay: ClaudeOAuthUsageWindow | null;
  sevenDaySonnet: ClaudeOAuthUsageWindow | null;
}

interface ClaudeExtraUsageSnapshot {
  currencyCode: string;
  limit: number;
  used: number;
}

interface ClaudeWebUsageResponse {
  accountEmail: string | null;
  metrics: ProviderMetricInput[];
  planLabel: string | null;
}

interface ClaudeAuthStatusResponse {
  email: string | null;
  loggedIn: boolean | null;
  subscriptionType: string | null;
}

const tryFetchClaudeTokenCost = async (host: RuntimeHost) => {
  try {
    return await fetchTokenCostSnapshot("claude", {
      env: host.env,
      homeDirectory: host.homeDirectory,
      now: host.now(),
    });
  } catch {
    return explicitNull;
  }
};

const isProviderMetricInput = (value: unknown): value is ProviderMetricInput => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value["label"] === "string" &&
    value["label"] !== "" &&
    typeof value["value"] === "string" &&
    value["value"] !== "" &&
    (value["detail"] === undefined ||
      value["detail"] === null ||
      typeof value["detail"] === "string")
  );
};

const readProviderMetrics = (
  record: Record<string, unknown>,
  key: string,
): ProviderMetricInput[] | null => {
  const metrics = record[key];

  if (!Array.isArray(metrics)) {
    return explicitNull;
  }

  return metrics.every((metric) => isProviderMetricInput(metric)) ? metrics : explicitNull;
};

const resolveClaudeOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", ".credentials.json");

const resolveClaudeDefaultTokenFilePath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", claudeTokenFileNames[0]);

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

const resolveClaudeTokenFilePath = async (host: RuntimeHost): Promise<string | null> => {
  for (const fileName of claudeTokenFileNames) {
    const filePath = joinPath(host.homeDirectory, ".claude", fileName);

    if (await host.fileSystem.fileExists(filePath)) {
      return filePath;
    }
  }

  return explicitNull;
};

const resolveClaudeVersion = async (host: RuntimeHost): Promise<string | null> =>
  readCommandVersion(host, "claude", ["--version"], claudeTimeoutMs);

const collectClaudeMetrics = (usageRecord: ClaudeOAuthUsageResponse): ProviderMetricInput[] => {
  const metrics: ProviderMetricInput[] = [];

  if (
    usageRecord.fiveHour?.utilization !== null &&
    usageRecord.fiveHour?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.fiveHour.resetsAt,
      kind: "session",
      label: "Session",
      value: formatPercent(usageRecord.fiveHour.utilization),
    });
  }

  if (
    usageRecord.sevenDay?.utilization !== null &&
    usageRecord.sevenDay?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.sevenDay.resetsAt,
      kind: "weekly",
      label: "Weekly",
      value: formatPercent(usageRecord.sevenDay.utilization),
    });
  }

  if (
    usageRecord.sevenDaySonnet?.utilization !== null &&
    usageRecord.sevenDaySonnet?.utilization !== undefined
  ) {
    metrics.push({
      detail: usageRecord.sevenDaySonnet.resetsAt,
      kind: "sonnet",
      label: "Sonnet",
      value: formatPercent(usageRecord.sevenDaySonnet.utilization),
    });
  }

  return metrics;
};

const normalizeClaudeExtraUsageAmounts = (
  usedCredits: number,
  monthlyLimit: number,
): { limit: number; used: number } => ({
  // Claude OAuth extra-usage amounts are returned in minor currency units.
  limit: monthlyLimit / 100,
  used: usedCredits / 100,
});

const parseClaudeExtraUsage = (
  extraUsageRecord: Record<string, unknown> | null,
): ClaudeExtraUsageSnapshot | null => {
  if (extraUsageRecord === null) {
    return explicitNull;
  }

  const isEnabled = readBoolean(extraUsageRecord, "is_enabled");

  if (isEnabled !== true) {
    return explicitNull;
  }

  const monthlyLimit = readFiniteNumber(extraUsageRecord, "monthly_limit");
  const usedCredits = readFiniteNumber(extraUsageRecord, "used_credits");

  if (monthlyLimit === null || usedCredits === null) {
    return explicitNull;
  }

  const normalizedAmounts = normalizeClaudeExtraUsageAmounts(usedCredits, monthlyLimit);

  return {
    currencyCode: readString(extraUsageRecord, "currency") ?? "USD",
    limit: normalizedAmounts.limit,
    used: normalizedAmounts.used,
  };
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

  await writeJsonFile(host, resolveClaudeOauthPath(host), updatedRecord);

  const nextCredentials = parseClaudeCredentials(updatedRecord);

  if (nextCredentials === null) {
    throw new Error("Claude OAuth refresh wrote an invalid credentials file.");
  }

  return nextCredentials;
};

const createClaudeOAuthUsageResponse = (value: unknown): ClaudeOAuthUsageResponse | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const readWindow = (key: string): ClaudeOAuthUsageWindow | null => {
    const window = readNestedRecord(value, key);

    if (window === null) {
      return explicitNull;
    }

    return {
      resetsAt: readString(window, "resets_at"),
      utilization: readFiniteNumber(window, "utilization"),
    };
  };

  return {
    extraUsage: readNestedRecord(value, "extra_usage"),
    fiveHour: readWindow("five_hour"),
    sevenDay: readWindow("seven_day"),
    sevenDaySonnet: readWindow("seven_day_sonnet"),
  };
};

const getActiveClaudeSessionToken = (providerConfig: {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}): string | null => {
  const activeTokenAccount = providerConfig.tokenAccounts[providerConfig.activeTokenAccountIndex];
  const sessionToken = activeTokenAccount?.token.trim();

  if (typeof sessionToken === "string" && sessionToken !== "") {
    return sessionToken;
  }

  return explicitNull;
};

const hasClaudeWebSession = async (
  host: RuntimeHost,
  providerConfig: {
    activeTokenAccountIndex: number;
    cookieSource: "auto" | "manual";
    tokenAccounts: {
      label: string;
      token: string;
    }[];
  },
): Promise<boolean> => {
  if (providerConfig.cookieSource === "manual") {
    return getActiveClaudeSessionToken(providerConfig) !== null;
  }

  if ((await resolveClaudeTokenFilePath(host)) !== null) {
    return true;
  }

  return (
    (await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    })) !== null
  );
};

const fetchClaudeWebUsage = async (
  host: RuntimeHost,
  session: ClaudeWebSessionSnapshot,
): Promise<ClaudeWebUsageResponse> => {
  const usageResponse = await host.http.request(
    `https://claude.ai/api/organizations/${session.organizationId}/usage`,
    {
      headers: {
        Accept: "application/json",
        Cookie: `sessionKey=${session.sessionToken}`,
      },
      method: "GET",
      timeoutMs: claudeTimeoutMs,
    },
  );

  if (usageResponse.statusCode < 200 || usageResponse.statusCode >= 300) {
    throw new Error(`Claude usage request failed with HTTP ${usageResponse.statusCode}.`);
  }

  const usagePayload = createClaudeOAuthUsageResponse(parseJsonText(usageResponse.bodyText));

  if (usagePayload === null) {
    throw new Error("Claude usage response was invalid.");
  }

  const metrics = collectClaudeMetrics(usagePayload);

  if (metrics.length === 0) {
    throw new Error("Claude web session did not include usage metrics.");
  }

  return {
    accountEmail: session.accountEmail,
    metrics,
    planLabel: session.organizationName,
  };
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

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude OAuth data did not include usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail:
      readString(rawCredentials, "email") ??
      (oauthRecord ? readJwtEmail(oauthRecord, "idToken") : explicitNull) ??
      (oauthRecord ? readJwtEmail(oauthRecord, "id_token") : explicitNull) ??
      fallbackAccountEmail,
    metrics,
    planLabel: credentials.subscriptionType,
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

const parseClaudeCliSnapshot = (
  commandOutput: string,
  updatedAt: string,
  version: string | null,
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
    metrics.push({ kind: "session", label: "Session", value: `${sessionPercent}%` });
  }

  if (typeof weeklyPercent === "string") {
    metrics.push({ kind: "weekly", label: "Weekly", value: `${weeklyPercent}%` });
  }

  if (typeof sonnetPercent === "string") {
    metrics.push({ kind: "sonnet", label: "Sonnet", value: `${sonnetPercent}%` });
  }

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail: accountMatch?.[1]?.trim() ?? explicitNull,
    metrics,
    planLabel: planMatch?.[1]?.trim() ?? explicitNull,
    sourceLabel: "cli",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via CLI.",
    withProviderDetails(snapshot, {
      accountOrg: planMatch?.[1]?.trim() ?? explicitNull,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const parseClaudeWebSnapshot = (
  tokenPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  const webMetrics = isRecord(tokenPayload) ? readProviderMetrics(tokenPayload, "metrics") : null;

  if (isRecord(tokenPayload) && webMetrics !== null) {
    const snapshot = createSnapshot({
      accountEmail: readString(tokenPayload, "accountEmail"),
      metrics: webMetrics,
      planLabel: readString(tokenPayload, "planLabel"),
      sourceLabel: "web",
      updatedAt,
      version: explicitNull,
    });

    return createRefreshSuccess(
      "claude",
      "Claude refreshed via web session.",
      withProviderDetails(snapshot, {
        accountOrg: readString(tokenPayload, "planLabel"),
        kind: "claude",
        tokenCost: explicitNull,
      }),
    );
  }

  if (!isRecord(tokenPayload)) {
    return createRefreshError("claude", "Claude token file is not valid JSON.");
  }

  const usageRecord = createClaudeOAuthUsageResponse(
    readNestedRecord(tokenPayload, "usage") ?? tokenPayload,
  );
  const accountRecord = readNestedRecord(tokenPayload, "account");
  const metrics = usageRecord ? collectClaudeMetrics(usageRecord) : [];

  if (metrics.length === 0) {
    return createRefreshError("claude", "Claude web snapshot did not include usage metrics.");
  }

  const accountEmail =
    readString(tokenPayload, "email") ??
    (accountRecord ? readString(accountRecord, "email_address") : explicitNull);
  const planLabel = readString(tokenPayload, "plan");
  const snapshot = createSnapshot({
    accountEmail,
    metrics,
    planLabel,
    sourceLabel: "web",
    updatedAt,
    version: explicitNull,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via web session.",
    withProviderDetails(snapshot, {
      accountOrg: planLabel,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const fetchClaudeOAuthSnapshot = async (
  host: RuntimeHost,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const credentialsPayload = await readJsonFile(host, resolveClaudeOauthPath(host));

  if (credentialsPayload.status !== "ok") {
    return createRefreshError("claude", "Claude OAuth credentials could not be read.");
  }

  let credentials = parseClaudeCredentials(credentialsPayload.value);

  if (credentials === null) {
    return createRefreshError("claude", "Claude OAuth credentials are missing.");
  }

  if (
    credentials.expiresAt !== null &&
    Number.isFinite(credentials.expiresAt) &&
    credentials.expiresAt <= host.now().valueOf()
  ) {
    try {
      credentials = await refreshClaudeAccessToken(host, credentials);
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

    if (usageResponse.statusCode === 401 && allowRefreshRetry && credentials?.refreshToken) {
      try {
        credentials = await refreshClaudeAccessToken(host, credentials);
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

    if (credentials === null) {
      return createRefreshError("claude", "Claude OAuth credentials are missing.");
    }

    const currentCredentials: ClaudeCredentialRecord = credentials;
    const authStatusResult = await readClaudeAuthStatus(host);
    const version = await resolveClaudeVersion(host);

    return parseClaudeOAuthSnapshot(
      usagePayload,
      currentCredentials,
      currentCredentials.rawRecord,
      authStatusResult.authStatus?.email ?? explicitNull,
      host.now().toISOString(),
      version,
    );
  };

  return fetchUsage(credentials.accessToken, true);
};

const resolveClaudeSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth" | "web",
  providerConfig: {
    activeTokenAccountIndex: number;
    cookieSource: "auto" | "manual";
    tokenAccounts: {
      label: string;
      token: string;
    }[];
  },
): Promise<ClaudeResolvedSource | null> => {
  const hasOauth = await host.fileSystem.fileExists(resolveClaudeOauthPath(host));
  const hasCli = (await host.commands.which("claude")) !== null;

  if (selectedSource === "oauth") {
    return hasOauth ? "oauth" : explicitNull;
  }

  if (selectedSource === "cli") {
    return hasCli ? "cli" : explicitNull;
  }

  if (selectedSource === "web") {
    let hasWeb = false;

    try {
      hasWeb = await hasClaudeWebSession(host, providerConfig);
    } catch {
      hasWeb = false;
    }

    return hasWeb ? "web" : explicitNull;
  }

  if (hasOauth) {
    return "oauth";
  }

  if (hasCli) {
    return "cli";
  }

  let hasWeb = false;

  try {
    hasWeb = await hasClaudeWebSession(host, providerConfig);
  } catch {
    hasWeb = false;
  }

  if (hasWeb) {
    return "web";
  }

  return explicitNull;
};

const attachClaudeServiceStatus = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"claude">,
): Promise<ProviderRefreshActionResult<"claude">> => {
  if (result.snapshot === null) {
    return result;
  }

  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      serviceStatus: await tryFetchProviderServiceStatus(host, {
        baseUrl: claudeStatusPageUrl,
        kind: "statuspage",
      }),
    },
  };
};

const attachClaudeTokenCost = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"claude">,
): Promise<ProviderRefreshActionResult<"claude">> => {
  if (result.snapshot === null) {
    return result;
  }

  const tokenCost = await tryFetchClaudeTokenCost(host);

  if (
    tokenCost === null ||
    (tokenCost.daily.length === 0 && tokenCost.today === null && tokenCost.last30Days === null)
  ) {
    return result;
  }

  const existingDetails =
    result.snapshot.providerDetails?.kind === "claude"
      ? result.snapshot.providerDetails
      : explicitNull;

  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      providerDetails: {
        accountOrg: existingDetails?.accountOrg ?? result.snapshot.identity.planLabel,
        kind: "claude",
        tokenCost,
      },
    },
  };
};

const finalizeClaudeRefresh = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"claude">,
): Promise<ProviderRefreshActionResult<"claude">> =>
  attachClaudeServiceStatus(host, await attachClaudeTokenCost(host, result));

const refreshClaudeViaCli = async (
  host: RuntimeHost,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const commandResult = await host.commands.run("claude", [], {
    input: claudeStatusInput,
    timeoutMs: claudeTimeoutMs,
  });
  const version = await resolveClaudeVersion(host);

  if (commandResult.exitCode === 0) {
    const cliResult = parseClaudeCliSnapshot(
      commandResult.stdout,
      host.now().toISOString(),
      version,
    );

    if (cliResult.status !== "error") {
      return cliResult;
    }
  }

  return createRefreshError("claude", "Claude CLI output did not contain usage metrics.");
};

const createClaudeBrowserWebResult = async (
  host: RuntimeHost,
  session: ClaudeWebSessionSnapshot,
  updatedAt: string,
  version: string | null,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const webUsage = await fetchClaudeWebUsage(host, session);
  const snapshot = createSnapshot({
    accountEmail: webUsage.accountEmail,
    metrics: webUsage.metrics,
    planLabel: webUsage.planLabel,
    sourceLabel: "web",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "claude",
    "Claude refreshed via web session.",
    withProviderDetails(snapshot, {
      accountOrg: session.organizationName,
      kind: "claude",
      tokenCost: explicitNull,
    }),
  );
};

const refreshClaudeViaWeb = async (
  host: RuntimeHost,
  providerConfig: ClaudeProviderConfig,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const updatedAt = host.now().toISOString();
  const version = await resolveClaudeVersion(host);

  if (providerConfig.cookieSource === "manual") {
    const manualSession = await resolveClaudeWebSession(host, {
      cookieSource: "manual",
      manualSessionToken: getActiveClaudeSessionToken(providerConfig),
    });

    if (manualSession === null) {
      return createRefreshError("claude", "Claude manual session token is unavailable.");
    }

    try {
      return await createClaudeBrowserWebResult(host, manualSession, updatedAt, version);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude web session refresh failed.");
    }
  }

  try {
    const autoSession = await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    });

    if (autoSession !== null) {
      return await createClaudeBrowserWebResult(host, autoSession, updatedAt, version);
    }
  } catch {
    // Fall through to the legacy token-file path.
  }

  const tokenFilePath = await resolveClaudeTokenFilePath(host);

  if (tokenFilePath === null) {
    return createRefreshError("claude", "Claude token file is unavailable.");
  }

  const tokenPayload = await readJsonFile(host, tokenFilePath);

  if (tokenPayload.status !== "ok") {
    return createRefreshError("claude", "Claude token file could not be read.");
  }

  const webResult = parseClaudeWebSnapshot(tokenPayload.value, updatedAt);

  if (webResult.snapshot !== null) {
    webResult.snapshot = {
      ...webResult.snapshot,
      version,
    };
  }

  return webResult;
};

const refreshClaudeFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: ClaudeResolvedSource,
  providerConfig: ClaudeProviderConfig,
): Promise<ProviderRefreshActionResult<"claude">> => {
  if (resolvedSource === "oauth") {
    const oauthResult = await fetchClaudeOAuthSnapshot(host);

    if (oauthResult.status !== "error" || providerConfig.source !== "auto") {
      return oauthResult;
    }

    if ((await host.commands.which("claude")) !== null) {
      const cliResult = await refreshClaudeViaCli(host);

      if (cliResult.status !== "error") {
        return cliResult;
      }
    }

    return refreshClaudeViaWeb(host, providerConfig);
  }

  if (resolvedSource === "cli") {
    const cliResult = await refreshClaudeViaCli(host);

    if (cliResult.status !== "error" || providerConfig.source !== "auto") {
      return cliResult;
    }

    return refreshClaudeViaWeb(host, providerConfig);
  }

  return refreshClaudeViaWeb(host, providerConfig);
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
  refresh: async ({ providerConfig }): Promise<ProviderRefreshActionResult<"claude">> => runResolvedRefresh({
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
