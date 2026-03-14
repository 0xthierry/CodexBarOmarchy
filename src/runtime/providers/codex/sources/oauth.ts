import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import type { CodexResolvedOauthSource } from "@/runtime/providers/codex/source-plan.ts";
import {
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatPercent,
  isRecord,
  joinPath,
  parseJsonText,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  withProviderDetails,
  writeJsonFile,
} from "@/runtime/providers/shared.ts";
import type { ProviderMetricInput } from "@/runtime/providers/shared.ts";

const codexDefaultBaseUrl = "https://chatgpt.com/backend-api";
const codexRefreshEndpoint = "https://auth.openai.com/oauth/token";
const codexRequestTimeoutMs = 15_000;
const codexTrustedUsageHosts = new Set(["chat.openai.com", "chatgpt.com"]);
const codexUsageApiPath = "/wham/usage";

interface CodexAuthFileRecord {
  accountId: string | null;
  idToken: string | null;
  lastRefresh: string | null;
  rawRecord: Record<string, unknown>;
  refreshToken: string | null;
}

interface CodexUsageResponse {
  credits?: Record<string, unknown> | null;
  email?: string | null;
  planType?: string | null;
  rateLimit?: Record<string, unknown> | null;
  version?: string | null;
}

const resolveCodexConfigPath = (host: RuntimeHost): string => {
  const configuredCodexHome = host.env["CODEX_HOME"];

  if (typeof configuredCodexHome === "string" && configuredCodexHome !== "") {
    return joinPath(configuredCodexHome, "config.toml");
  }

  return joinPath(host.homeDirectory, ".codex", "config.toml");
};

const resolveCodexVersionPath = (host: RuntimeHost): string => {
  const configuredCodexHome = host.env["CODEX_HOME"];

  if (typeof configuredCodexHome === "string" && configuredCodexHome !== "") {
    return joinPath(configuredCodexHome, "version.json");
  }

  return joinPath(host.homeDirectory, ".codex", "version.json");
};

const resolveCodexNativeBinaryPath = async (host: RuntimeHost): Promise<string | null> => {
  const codexBinaryPath = await host.commands.which("codex");

  if (codexBinaryPath === null) {
    return explicitNull;
  }

  const realBinaryPath = await host.fileSystem.realPath(codexBinaryPath);
  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
  const targetTriple =
    process.arch === "x64" ? "x86_64-unknown-linux-musl" : "aarch64-unknown-linux-musl";
  const platformPackageName = process.arch === "x64" ? "codex-linux-x64" : "codex-linux-arm64";

  const wrapperDirectoryPath = realBinaryPath.split("/").slice(0, -1).join("/");
  const candidatePaths = [
    joinPath(wrapperDirectoryPath, "..", "vendor", targetTriple, "codex", binaryName),
    joinPath(
      wrapperDirectoryPath,
      "..",
      "node_modules",
      "@openai",
      platformPackageName,
      "vendor",
      targetTriple,
      "codex",
      binaryName,
    ),
  ];

  for (const candidatePath of candidatePaths) {
    if (await host.fileSystem.fileExists(candidatePath)) {
      return host.fileSystem.realPath(candidatePath);
    }
  }

  return realBinaryPath;
};

const resolveCodexRefreshClientId = async (host: RuntimeHost): Promise<string> => {
  const binaryPath = await resolveCodexNativeBinaryPath(host);

  if (binaryPath === null) {
    throw new Error("Codex CLI is unavailable for token refresh.");
  }

  const stringsResult = await host.commands.run("strings", [binaryPath], {
    timeoutMs: codexRequestTimeoutMs,
  });

  if (stringsResult.exitCode !== 0) {
    throw new Error("Failed to inspect the Codex CLI binary for OAuth metadata.");
  }

  const clientId =
    stringsResult.stdout.match(
      /No more recovery steps available\.[\s\S]{0,300}?((?:app_[A-Za-z0-9]{24}))Content-Type/u,
    )?.[1] ??
    stringsResult.stdout.match(
      /Token data is not available\.client_idgrant_typerefresh_tokenaccess_tokenNo more recovery steps available\.Your access token could not be refreshed[\s\S]{0,300}?((?:app_[A-Za-z0-9]{24}))Content-Type/u,
    )?.[1] ??
    explicitNull;

  if (clientId === null) {
    throw new Error("Failed to discover Codex OAuth client metadata from the installed CLI.");
  }

  return clientId;
};

const parseCodexUsageBaseUrl = (configContents: string): string => {
  for (const rawLine of configContents.split(/\r?\n/u)) {
    const line = rawLine.split("#", 1)[0]?.trim() ?? "";

    if (!line.startsWith("chatgpt_base_url")) {
      continue;
    }

    const value = line.split("=", 2)[1]?.trim();

    if (typeof value !== "string" || value === "") {
      continue;
    }

    const trimmedValue = value.replaceAll(/^['"]|['"]$/gu, "").trim();

    if (trimmedValue !== "") {
      return trimmedValue;
    }
  }

  return codexDefaultBaseUrl;
};

const normalizeCodexUsageBaseUrl = (value: string): string => {
  let normalized = value.trim();

  if (normalized === "") {
    normalized = codexDefaultBaseUrl;
  }

  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  if (
    (normalized.startsWith("https://chatgpt.com") ||
      normalized.startsWith("https://chat.openai.com")) &&
    !normalized.includes("/backend-api")
  ) {
    normalized = `${normalized}/backend-api`;
  }

  return normalized;
};

const assertTrustedCodexUsageBaseUrl = (value: string): void => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error("Codex chatgpt_base_url is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Codex chatgpt_base_url must use HTTPS.");
  }

  if (!codexTrustedUsageHosts.has(parsedUrl.hostname)) {
    throw new Error("Codex chatgpt_base_url must point to chatgpt.com or chat.openai.com.");
  }
};

const resolveCodexUsageUrl = async (host: RuntimeHost): Promise<string> => {
  if (!(await host.fileSystem.fileExists(resolveCodexConfigPath(host)))) {
    return `${codexDefaultBaseUrl}${codexUsageApiPath}`;
  }

  const configContents = await host.fileSystem.readTextFile(resolveCodexConfigPath(host));
  const baseUrl = normalizeCodexUsageBaseUrl(parseCodexUsageBaseUrl(configContents));
  assertTrustedCodexUsageBaseUrl(baseUrl);
  const path = baseUrl.includes("/backend-api") ? codexUsageApiPath : "/api/codex/usage";

  return `${baseUrl}${path}`;
};

const parseCodexAuthRecord = (value: unknown): CodexAuthFileRecord | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const tokenRecord = readNestedRecord(value, "tokens");

  if (tokenRecord === null) {
    return explicitNull;
  }

  const accessToken = readString(tokenRecord, "access_token");

  if (accessToken === null) {
    return explicitNull;
  }

  return {
    accountId:
      readString(tokenRecord, "account_id") ?? readString(value, "account_id") ?? explicitNull,
    idToken: readString(tokenRecord, "id_token"),
    lastRefresh: readString(value, "last_refresh"),
    rawRecord: value,
    refreshToken: readString(tokenRecord, "refresh_token"),
  };
};

const readCodexAccessToken = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const tokenRecord = readNestedRecord(value, "tokens");

  return tokenRecord ? readString(tokenRecord, "access_token") : explicitNull;
};

const refreshCodexAccessToken = async (
  host: RuntimeHost,
  authPath: string,
  authFileRecord: CodexAuthFileRecord,
): Promise<CodexAuthFileRecord> => {
  if (authFileRecord.refreshToken === null || authFileRecord.refreshToken === "") {
    return authFileRecord;
  }

  const refreshClientId = await resolveCodexRefreshClientId(host);
  const refreshResponse = await host.http.request(codexRefreshEndpoint, {
    body: JSON.stringify({
      client_id: refreshClientId,
      grant_type: "refresh_token",
      refresh_token: authFileRecord.refreshToken,
      scope: "openid profile email",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    timeoutMs: codexRequestTimeoutMs,
  });

  if (refreshResponse.statusCode !== 200) {
    throw new Error(`Codex token refresh failed with HTTP ${refreshResponse.statusCode}.`);
  }

  const refreshPayload = parseJsonText(refreshResponse.bodyText);

  if (!isRecord(refreshPayload)) {
    throw new Error("Codex token refresh returned invalid JSON.");
  }

  const tokenRecord = readNestedRecord(authFileRecord.rawRecord, "tokens");

  if (tokenRecord === null) {
    throw new Error("Codex auth.json is missing its tokens record.");
  }

  const nextRecord: Record<string, unknown> = {
    ...authFileRecord.rawRecord,
    last_refresh: host.now().toISOString(),
    tokens: {
      ...tokenRecord,
      access_token:
        readString(refreshPayload, "access_token") ??
        readCodexAccessToken(authFileRecord.rawRecord),
      id_token: readString(refreshPayload, "id_token") ?? authFileRecord.idToken,
      refresh_token: readString(refreshPayload, "refresh_token") ?? authFileRecord.refreshToken,
    },
  };

  await writeJsonFile(host, authPath, nextRecord);

  const parsedRecord = parseCodexAuthRecord(nextRecord);

  if (parsedRecord === null) {
    throw new Error("Codex token refresh wrote an invalid auth.json.");
  }

  return parsedRecord;
};

const createCodexUsageResponse = (value: unknown): CodexUsageResponse | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  return {
    credits: readNestedRecord(value, "credits"),
    email: readString(value, "email"),
    planType: readString(value, "plan_type"),
    rateLimit: readNestedRecord(value, "rate_limit"),
    version: readString(value, "version"),
  };
};

const readCodexResetAt = (value: Record<string, unknown>): string | null => {
  const stringValue = readString(value, "reset_at");

  if (stringValue !== null) {
    return stringValue;
  }

  const numericValue = readFiniteNumber(value, "reset_at");

  if (numericValue === null) {
    return explicitNull;
  }

  return new Date(numericValue * 1000).toISOString();
};

const readCodexVersion = async (host: RuntimeHost): Promise<string | null> => {
  const versionPayload = await readJsonFile(host, resolveCodexVersionPath(host));

  if (versionPayload.status !== "ok" || !isRecord(versionPayload.value)) {
    return explicitNull;
  }

  return (
    readString(versionPayload.value, "latest_version") ??
    readString(versionPayload.value, "version") ??
    explicitNull
  );
};

const parseCodexOAuthSnapshot = (
  usageResponse: CodexUsageResponse,
  authFileRecord: CodexAuthFileRecord,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"codex"> => {
  const primaryWindow = usageResponse.rateLimit
    ? readNestedRecord(usageResponse.rateLimit, "primary_window")
    : explicitNull;
  const secondaryWindow = usageResponse.rateLimit
    ? readNestedRecord(usageResponse.rateLimit, "secondary_window")
    : explicitNull;
  const metrics: ProviderMetricInput[] = [];
  const primaryPercent = primaryWindow
    ? readFiniteNumber(primaryWindow, "used_percent")
    : explicitNull;
  const secondaryPercent = secondaryWindow
    ? readFiniteNumber(secondaryWindow, "used_percent")
    : explicitNull;
  const creditBalance = usageResponse.credits
    ? readFiniteNumber(usageResponse.credits, "balance")
    : explicitNull;

  if (primaryPercent !== null) {
    metrics.push({
      detail: readCodexResetAt(primaryWindow ?? usageResponse.rateLimit ?? {}),
      kind: "session",
      label: "Session",
      value: formatPercent(primaryPercent),
    });
  }

  if (secondaryPercent !== null) {
    metrics.push({
      detail: readCodexResetAt(secondaryWindow ?? usageResponse.rateLimit ?? {}),
      kind: "weekly",
      label: "Weekly",
      value: formatPercent(secondaryPercent),
    });
  }

  if (creditBalance !== null) {
    metrics.push({
      kind: "credits",
      label: "Credits",
      value: creditBalance.toFixed(2),
    });
  }

  if (metrics.length === 0) {
    return createRefreshError("codex", "Codex OAuth data did not include rate-limit fields.");
  }

  const authRecord = authFileRecord.rawRecord;
  const tokenRecord = readNestedRecord(authRecord, "tokens");
  const snapshot = createSnapshot({
    accountEmail:
      usageResponse.email ??
      readString(authRecord, "account_email") ??
      readString(authRecord, "email") ??
      (tokenRecord ? readJwtEmail(tokenRecord, "id_token") : explicitNull),
    metrics,
    planLabel: usageResponse.planType ?? explicitNull,
    sourceLabel: "oauth",
    updatedAt,
    version: usageResponse.version ?? version,
  });

  return createRefreshSuccess(
    "codex",
    "Codex refreshed via OAuth.",
    withProviderDetails(snapshot, {
      dashboard: explicitNull,
      kind: "codex",
      tokenCost: explicitNull,
    }),
  );
};

const fetchCodexOAuthSnapshot = async (
  host: RuntimeHost,
  resolvedSource: CodexResolvedOauthSource,
): Promise<ProviderRefreshActionResult<"codex">> => {
  const authPayload = await readJsonFile(host, resolvedSource.authPath);

  if (authPayload.status !== "ok") {
    return createRefreshError("codex", "Codex auth.json could not be read.");
  }

  const initialAuthFileRecord = parseCodexAuthRecord(authPayload.value);

  if (initialAuthFileRecord === null) {
    return createRefreshError("codex", "Codex auth.json does not contain OAuth credentials.");
  }

  let authFileRecord: CodexAuthFileRecord = initialAuthFileRecord;

  const accessToken = readCodexAccessToken(authFileRecord.rawRecord);

  if (accessToken === null) {
    return createRefreshError("codex", "Codex auth.json does not contain an access token.");
  }

  const fetchUsage = async (
    currentAccessToken: string,
    allowRefreshRetry: boolean,
  ): Promise<ProviderRefreshActionResult<"codex">> => {
    const currentAuthFileRecord: CodexAuthFileRecord = authFileRecord;
    let usageUrl: string;

    try {
      usageUrl = await resolveCodexUsageUrl(host);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("codex", error.message);
      }

      return createRefreshError("codex", "Codex usage URL is invalid.");
    }

    let usageResponse;

    try {
      usageResponse = await host.http.request(usageUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${currentAccessToken}`,
          ...(currentAuthFileRecord.accountId
            ? { "ChatGPT-Account-Id": currentAuthFileRecord.accountId }
            : {}),
        },
        method: "GET",
        timeoutMs: codexRequestTimeoutMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("codex", error.message);
      }

      return createRefreshError("codex", "Codex usage request failed.");
    }

    if (usageResponse.statusCode === 401 || usageResponse.statusCode === 403) {
      if (
        allowRefreshRetry &&
        currentAuthFileRecord.refreshToken !== null &&
        currentAuthFileRecord.refreshToken !== ""
      ) {
        try {
          authFileRecord = await refreshCodexAccessToken(
            host,
            resolvedSource.authPath,
            currentAuthFileRecord,
          );
        } catch (error) {
          if (error instanceof Error) {
            return createRefreshError("codex", error.message);
          }

          return createRefreshError("codex", "Codex token refresh failed.");
        }

        const refreshedAccessToken = readCodexAccessToken(authFileRecord.rawRecord);

        if (refreshedAccessToken === null || refreshedAccessToken === currentAccessToken) {
          return createRefreshError(
            "codex",
            "Codex OAuth request unauthorized. Run `codex login`.",
          );
        }

        return fetchUsage(refreshedAccessToken, false);
      }

      return createRefreshError("codex", "Codex OAuth request unauthorized. Run `codex login`.");
    }

    if (usageResponse.statusCode < 200 || usageResponse.statusCode >= 300) {
      return createRefreshError(
        "codex",
        `Codex usage request failed with HTTP ${usageResponse.statusCode}.`,
      );
    }

    let usagePayload: CodexUsageResponse | null;

    try {
      usagePayload = createCodexUsageResponse(parseJsonText(usageResponse.bodyText));
    } catch {
      return createRefreshError("codex", "Codex usage API returned invalid JSON.");
    }

    if (usagePayload === null) {
      return createRefreshError("codex", "Codex usage API returned invalid JSON.");
    }

    const latestAuthFileRecord: CodexAuthFileRecord = authFileRecord;

    return parseCodexOAuthSnapshot(
      usagePayload,
      latestAuthFileRecord,
      host.now().toISOString(),
      await readCodexVersion(host),
    );
  };

  return fetchUsage(accessToken, true);
};

export { fetchCodexOAuthSnapshot };
