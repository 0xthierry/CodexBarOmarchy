import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import type {
  GeminiProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  createProviderQuotaBucketSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatFractionPercent,
  isRecord,
  joinPath,
  parseJsonText,
  readCommandVersion,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  withProviderDetails,
  writeJsonFile,
} from "@/runtime/providers/shared.ts";
import { tryFetchWorkspaceStatusBundle } from "@/runtime/providers/service-status.ts";

const geminiLoadCodeAssistEndpoint =
  "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
const geminiProjectListEndpoint = "https://cloudresourcemanager.googleapis.com/v1/projects";
const geminiQuotaEndpoint = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
const geminiRefreshEndpoint = "https://oauth2.googleapis.com/token";
const geminiStatusWorkspaceProductId = "npdyhgECDJ6tB66MxXyo";
const geminiTimeoutMs = 15_000;
const oauthClientFileCandidates = [
  "../gemini-cli-core/dist/src/code_assist/oauth2.js",
  "node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
  "share/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
  "libexec/lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
  "lib/node_modules/@google/gemini-cli/node_modules/@google/gemini-cli-core/dist/src/code_assist/oauth2.js",
] as const;

type GeminiResolvedSource = "api";
type GeminiTier = "free-tier" | "legacy-tier" | "standard-tier" | null;

interface GeminiOAuthCredentials {
  accessToken: string;
  expiryDate: number | null;
  idToken: string | null;
  rawRecord: Record<string, unknown>;
  refreshToken: string | null;
}

interface GeminiQuotaBucket {
  modelId: string;
  remainingFraction: number;
  resetTime: string | null;
}

interface GeminiCodeAssistStatus {
  projectId: string | null;
  tier: GeminiTier;
}

const convertRemainingFractionToUsedFraction = (remainingFraction: number): number =>
  Math.max(0, Math.min(1, 1 - remainingFraction));

const resolveGeminiSettingsPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "settings.json");

const resolveGeminiOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "oauth_creds.json");

const resolveGeminiVersion = async (host: RuntimeHost): Promise<string | null> =>
  readCommandVersion(host, "gemini", ["--version"], geminiTimeoutMs);

const readGeminiAuthType = async (host: RuntimeHost): Promise<string | null> => {
  const settingsPayload = await readJsonFile(host, resolveGeminiSettingsPath(host));

  if (settingsPayload.status !== "ok" || !isRecord(settingsPayload.value)) {
    return explicitNull;
  }

  const security = readNestedRecord(settingsPayload.value, "security");
  const auth = security ? readNestedRecord(security, "auth") : explicitNull;

  return auth ? readString(auth, "selectedType") : explicitNull;
};

const parseGeminiCredentials = (value: unknown): GeminiOAuthCredentials | null => {
  if (!isRecord(value)) {
    return explicitNull;
  }

  const accessToken = readString(value, "access_token");

  if (accessToken === null) {
    return explicitNull;
  }

  return {
    accessToken,
    expiryDate: readFiniteNumber(value, "expiry_date"),
    idToken: readString(value, "id_token") ?? readString(value, "idToken"),
    rawRecord: value,
    refreshToken: readString(value, "refresh_token"),
  };
};

const extractGeminiClientCredentials = async (
  host: RuntimeHost,
): Promise<{ clientId: string; clientSecret: string } | null> => {
  const geminiBinaryPath = await host.commands.which("gemini");

  if (geminiBinaryPath === null) {
    return explicitNull;
  }

  const resolvedBinaryPath = await host.fileSystem.realPath(geminiBinaryPath);
  const binaryDirectory = resolvedBinaryPath.slice(0, resolvedBinaryPath.lastIndexOf("/"));
  const baseDirectory = binaryDirectory.slice(0, binaryDirectory.lastIndexOf("/"));
  const clientIdPattern = /OAUTH_CLIENT_ID\s*=\s*['"]([\w\-.]+)['"]/u;
  const clientSecretPattern = /OAUTH_CLIENT_SECRET\s*=\s*['"]([\w-]+)['"]/u;

  for (const candidate of oauthClientFileCandidates) {
    const candidatePath = joinPath(baseDirectory, candidate);

    if (!(await host.fileSystem.fileExists(candidatePath))) {
      continue;
    }

    const fileContents = await host.fileSystem.readTextFile(candidatePath);
    const clientId = fileContents.match(clientIdPattern)?.[1];
    const clientSecret = fileContents.match(clientSecretPattern)?.[1];

    if (typeof clientId === "string" && typeof clientSecret === "string") {
      return {
        clientId,
        clientSecret,
      };
    }
  }

  return explicitNull;
};

const refreshGeminiAccessToken = async (
  host: RuntimeHost,
  credentials: GeminiOAuthCredentials,
): Promise<GeminiOAuthCredentials> => {
  if (credentials.refreshToken === null || credentials.refreshToken === "") {
    throw new Error("Gemini refresh token is unavailable.");
  }

  const oauthClientCredentials = await extractGeminiClientCredentials(host);

  if (oauthClientCredentials === null) {
    throw new Error("Could not locate Gemini CLI OAuth client credentials.");
  }

  const refreshResponse = await host.http.request(geminiRefreshEndpoint, {
    body: new URLSearchParams({
      client_id: oauthClientCredentials.clientId,
      client_secret: oauthClientCredentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: credentials.refreshToken,
    }).toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    timeoutMs: geminiTimeoutMs,
  });

  if (refreshResponse.statusCode !== 200) {
    throw new Error(`Gemini token refresh failed with HTTP ${refreshResponse.statusCode}.`);
  }

  const refreshPayload = parseJsonText(refreshResponse.bodyText);

  if (!isRecord(refreshPayload)) {
    throw new Error("Gemini token refresh returned invalid JSON.");
  }

  const expiresIn = readFiniteNumber(refreshPayload, "expires_in");
  const updatedRecord = {
    ...credentials.rawRecord,
    access_token: readString(refreshPayload, "access_token") ?? credentials.accessToken,
    expiry_date:
      expiresIn === null ? credentials.expiryDate : host.now().valueOf() + expiresIn * 1000,
    id_token: readString(refreshPayload, "id_token") ?? credentials.idToken,
  };

  await writeJsonFile(host, resolveGeminiOauthPath(host), updatedRecord);

  const nextCredentials = parseGeminiCredentials(updatedRecord);

  if (nextCredentials === null) {
    throw new Error("Gemini token refresh wrote an invalid credentials file.");
  }

  return nextCredentials;
};

const resolveGeminiSource = async (host: RuntimeHost): Promise<GeminiResolvedSource | null> => {
  const authType = await readGeminiAuthType(host);

  if (authType === null || authType === "api-key" || authType === "vertex-ai") {
    return explicitNull;
  }

  return (await host.fileSystem.fileExists(resolveGeminiOauthPath(host))) ? "api" : explicitNull;
};

const parseGeminiQuotaBuckets = (quotaPayload: unknown): GeminiQuotaBucket[] => {
  if (!isRecord(quotaPayload)) {
    return [];
  }

  const bucketsValue = quotaPayload["buckets"];

  if (!Array.isArray(bucketsValue)) {
    return [];
  }

  const buckets: GeminiQuotaBucket[] = [];

  for (const bucket of bucketsValue) {
    if (!isRecord(bucket)) {
      continue;
    }

    const modelId = readString(bucket, "modelId");
    const remainingFraction = readFiniteNumber(bucket, "remainingFraction");

    if (modelId === null || remainingFraction === null) {
      continue;
    }

    buckets.push({
      modelId,
      remainingFraction,
      resetTime: readString(bucket, "resetTime"),
    });
  }

  return buckets;
};

const parseGeminiJsonRecord = (bodyText: string): Record<string, unknown> | null => {
  try {
    const payload = parseJsonText(bodyText);

    return isRecord(payload) ? payload : explicitNull;
  } catch {
    return explicitNull;
  }
};

const discoverGeminiProjectId = async (
  host: RuntimeHost,
  accessToken: string,
): Promise<string | null> => {
  let projectsResponse;

  try {
    projectsResponse = await host.http.request(geminiProjectListEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      timeoutMs: geminiTimeoutMs,
    });
  } catch {
    return explicitNull;
  }

  if (projectsResponse.statusCode !== 200) {
    return explicitNull;
  }

  const projectsPayload = parseGeminiJsonRecord(projectsResponse.bodyText);

  if (projectsPayload === null) {
    return explicitNull;
  }

  const { projects } = projectsPayload;

  if (!Array.isArray(projects)) {
    return explicitNull;
  }

  for (const project of projects) {
    if (!isRecord(project)) {
      continue;
    }

    const projectId = readString(project, "projectId");

    if (projectId === null) {
      continue;
    }

    if (projectId.startsWith("gen-lang-client")) {
      return projectId;
    }

    const labels = readNestedRecord(project, "labels");

    if (labels !== null && readString(labels, "generative-language") !== null) {
      return projectId;
    }
  }

  return explicitNull;
};

const fetchGeminiCodeAssistStatus = async (
  host: RuntimeHost,
  accessToken: string,
): Promise<GeminiCodeAssistStatus> => {
  let codeAssistResponse;

  try {
    codeAssistResponse = await host.http.request(geminiLoadCodeAssistEndpoint, {
      body: JSON.stringify({
        metadata: {
          ideType: "GEMINI_CLI",
          pluginType: "GEMINI",
        },
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      timeoutMs: geminiTimeoutMs,
    });
  } catch {
    return {
      projectId: explicitNull,
      tier: explicitNull,
    };
  }

  if (codeAssistResponse.statusCode !== 200) {
    return {
      projectId: explicitNull,
      tier: explicitNull,
    };
  }

  const codeAssistPayload = parseGeminiJsonRecord(codeAssistResponse.bodyText);

  if (codeAssistPayload === null) {
    return {
      projectId: explicitNull,
      tier: explicitNull,
    };
  }

  const currentTier = readNestedRecord(codeAssistPayload, "currentTier");
  const tierId = currentTier ? readString(currentTier, "id") : explicitNull;
  const rawProject = codeAssistPayload["cloudaicompanionProject"];
  let projectId: string | null = explicitNull;

  if (typeof rawProject === "string" && rawProject.trim() !== "") {
    projectId = rawProject.trim();
  }

  if (isRecord(rawProject)) {
    projectId = readString(rawProject, "id") ?? readString(rawProject, "projectId") ?? explicitNull;
  }

  return {
    projectId,
    tier:
      tierId === "free-tier" || tierId === "legacy-tier" || tierId === "standard-tier"
        ? tierId
        : explicitNull,
  };
};

const parseGeminiQuotaSnapshot = (
  quotaPayload: unknown,
  credentials: GeminiOAuthCredentials,
  tier: GeminiTier,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"gemini"> => {
  const quotaBuckets = parseGeminiQuotaBuckets(quotaPayload);
  const metricsByLabel = new Map<string, { detail: string | null; value: number }>();

  for (const bucket of quotaBuckets) {
    const usedFraction = convertRemainingFractionToUsedFraction(bucket.remainingFraction);

    if (bucket.modelId.toLowerCase().includes("pro")) {
      const existingMetric = metricsByLabel.get("Pro");

      if (existingMetric === undefined || usedFraction > existingMetric.value) {
        metricsByLabel.set("Pro", {
          detail: bucket.resetTime,
          value: usedFraction,
        });
      }
    }

    if (bucket.modelId.toLowerCase().includes("flash")) {
      const existingMetric = metricsByLabel.get("Flash");

      if (existingMetric === undefined || usedFraction > existingMetric.value) {
        metricsByLabel.set("Flash", {
          detail: bucket.resetTime,
          value: usedFraction,
        });
      }
    }
  }

  const metrics = [...metricsByLabel.entries()].map(([label, metric]) => ({
    detail: metric.detail,
    label,
    value: formatFractionPercent(metric.value),
  }));

  if (metrics.length === 0) {
    return createRefreshError("gemini", "Gemini quota data did not include Pro or Flash buckets.");
  }

  const planLabel =
    tier === "standard-tier"
      ? "Paid"
      : tier === "legacy-tier"
        ? "Legacy"
        : readJwtHostedDomain(credentials.rawRecord) !== null
          ? "Workspace"
          : tier === "free-tier"
            ? "Free"
            : explicitNull;

  const normalizedQuotaBuckets = quotaBuckets.map((bucket) =>
    createProviderQuotaBucketSnapshot({
      modelId: bucket.modelId,
      remainingFraction: bucket.remainingFraction,
      resetTime: bucket.resetTime,
    }),
  );
  const snapshot = createSnapshot({
    accountEmail:
      readString(credentials.rawRecord, "email") ??
      readJwtEmail(credentials.rawRecord, "id_token") ??
      readJwtEmail(credentials.rawRecord, "idToken"),
    metrics,
    planLabel,
    quotaBuckets: normalizedQuotaBuckets,
    sourceLabel: "api",
    updatedAt,
    version: readString(isRecord(quotaPayload) ? quotaPayload : {}, "version") ?? version,
  });
  const quotaDrilldown = {
    flashBuckets: normalizedQuotaBuckets.filter((bucket) =>
      bucket.modelId.toLowerCase().includes("flash"),
    ),
    otherBuckets: normalizedQuotaBuckets.filter((bucket) => {
      const modelId = bucket.modelId.toLowerCase();
      return !modelId.includes("flash") && !modelId.includes("pro");
    }),
    proBuckets: normalizedQuotaBuckets.filter((bucket) =>
      bucket.modelId.toLowerCase().includes("pro"),
    ),
  };

  return createRefreshSuccess(
    "gemini",
    "Gemini refreshed via API.",
    withProviderDetails(snapshot, {
      incidents: [],
      kind: "gemini",
      quotaDrilldown,
    }),
  );
};

const readJwtHostedDomain = (record: Record<string, unknown>): string | null => {
  const token = readString(record, "id_token") ?? readString(record, "idToken") ?? explicitNull;

  if (token === null) {
    return explicitNull;
  }

  const payload = token.split(".")[1];

  if (typeof payload !== "string" || payload === "") {
    return explicitNull;
  }

  const normalizedPayload = payload.replaceAll("-", "+").replaceAll("_", "/");
  const paddedPayload = `${normalizedPayload}${"=".repeat((4 - (normalizedPayload.length % 4)) % 4)}`;

  try {
    const decodedPayload = JSON.parse(atob(paddedPayload)) as unknown;

    return isRecord(decodedPayload) ? readString(decodedPayload, "hd") : explicitNull;
  } catch {
    return explicitNull;
  }
};

const fetchGeminiApiSnapshot = async (
  host: RuntimeHost,
): Promise<ProviderRefreshActionResult<"gemini">> => {
  const oauthPayload = await readJsonFile(host, resolveGeminiOauthPath(host));

  if (oauthPayload.status !== "ok") {
    return createRefreshError("gemini", "Gemini OAuth credentials are unavailable.");
  }

  let credentials = parseGeminiCredentials(oauthPayload.value);

  if (credentials === null) {
    return createRefreshError("gemini", "Gemini OAuth credentials are invalid.");
  }

  if (
    credentials.expiryDate !== null &&
    Number.isFinite(credentials.expiryDate) &&
    credentials.expiryDate <= host.now().valueOf()
  ) {
    try {
      credentials = await refreshGeminiAccessToken(host, credentials);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("gemini", error.message);
      }

      return createRefreshError("gemini", "Gemini token refresh failed.");
    }
  }

  const fetchQuotaSnapshot = async (
    currentCredentials: GeminiOAuthCredentials,
    allowRefreshRetry: boolean,
  ): Promise<ProviderRefreshActionResult<"gemini">> => {
    const codeAssistStatus = await fetchGeminiCodeAssistStatus(
      host,
      currentCredentials.accessToken,
    );
    const projectId =
      codeAssistStatus.projectId ??
      (await discoverGeminiProjectId(host, currentCredentials.accessToken));

    let quotaResponse;

    try {
      quotaResponse = await host.http.request(geminiQuotaEndpoint, {
        body: JSON.stringify(projectId ? { project: projectId } : {}),
        headers: {
          Authorization: `Bearer ${currentCredentials.accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        timeoutMs: geminiTimeoutMs,
      });
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("gemini", error.message);
      }

      return createRefreshError("gemini", "Gemini quota request failed.");
    }

    if (quotaResponse.statusCode === 401) {
      if (
        !allowRefreshRetry ||
        currentCredentials.refreshToken === null ||
        currentCredentials.refreshToken === ""
      ) {
        return createRefreshError(
          "gemini",
          "Gemini quota request unauthorized. Run `gemini auth login`.",
        );
      }

      const previousAccessToken = currentCredentials.accessToken;
      let refreshedCredentials: GeminiOAuthCredentials;

      try {
        refreshedCredentials = await refreshGeminiAccessToken(host, currentCredentials);
      } catch (error) {
        if (error instanceof Error) {
          return createRefreshError("gemini", error.message);
        }

        return createRefreshError("gemini", "Gemini token refresh failed.");
      }

      if (refreshedCredentials.accessToken === previousAccessToken) {
        return createRefreshError(
          "gemini",
          "Gemini quota request unauthorized. Run `gemini auth login`.",
        );
      }

      return fetchQuotaSnapshot(refreshedCredentials, false);
    }

    if (quotaResponse.statusCode !== 200) {
      return createRefreshError(
        "gemini",
        `Gemini quota request failed with HTTP ${quotaResponse.statusCode}.`,
      );
    }

    let quotaPayload: unknown;

    try {
      quotaPayload = parseJsonText(quotaResponse.bodyText);
    } catch {
      return createRefreshError("gemini", "Gemini quota response was invalid.");
    }

    return parseGeminiQuotaSnapshot(
      quotaPayload,
      currentCredentials,
      codeAssistStatus.tier,
      host.now().toISOString(),
      await resolveGeminiVersion(host),
    );
  };

  return fetchQuotaSnapshot(credentials, true);
};

const attachGeminiWorkspaceStatus = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"gemini">,
): Promise<ProviderRefreshActionResult<"gemini">> => {
  if (result.snapshot === null) {
    return result;
  }

  const workspaceStatus = await tryFetchWorkspaceStatusBundle(host, geminiStatusWorkspaceProductId);

  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      providerDetails:
        result.snapshot.providerDetails?.kind === "gemini"
          ? {
              ...result.snapshot.providerDetails,
              incidents: workspaceStatus.incidents,
            }
          : result.snapshot.providerDetails,
      serviceStatus: workspaceStatus.serviceStatus,
    },
  };
};

const refreshGeminiFromResolvedSource = async (
  host: RuntimeHost,
  resolvedSource: GeminiResolvedSource,
): Promise<ProviderRefreshActionResult<"gemini">> => {
  if (resolvedSource === "api") {
    return fetchGeminiApiSnapshot(host);
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
  refresh: async (): Promise<ProviderRefreshActionResult<"gemini">> => {
    const resolvedSource = await resolveGeminiSource(host);

    if (resolvedSource === null) {
      return createRefreshError("gemini", "Gemini OAuth credentials are unavailable.");
    }
    return attachGeminiWorkspaceStatus(
      host,
      await refreshGeminiFromResolvedSource(host, resolvedSource),
    );
  },
});

export {
  createGeminiProviderAdapter,
  readGeminiAuthType,
  resolveGeminiOauthPath,
  resolveGeminiSettingsPath,
  resolveGeminiSource,
};
