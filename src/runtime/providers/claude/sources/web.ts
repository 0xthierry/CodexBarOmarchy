import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { ProviderMetricKind } from "@/core/store/runtime-state.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  createRateWindowMetricInput,
  createRefreshSuccessFromSeed,
} from "@/runtime/providers/collection/snapshot.ts";
import type { ProviderMetricInput } from "@/runtime/providers/collection/snapshot.ts";
import { resolveClaudeWebSession } from "@/runtime/providers/claude-web-auth.ts";
import type { ClaudeWebSessionSnapshot } from "@/runtime/providers/claude-web-models.ts";
import {
  collectClaudeMetrics,
  createClaudeOAuthUsageResponse,
  normalizeClaudePlanLabel,
  readClaudeOrganizationName,
  sanitizeClaudeIdentityLabel,
} from "@/runtime/providers/claude/normalize.ts";
import { claudeTimeoutMs, resolveClaudeVersion } from "@/runtime/providers/claude/runtime.ts";
import type { ClaudeResolvedWebSource } from "@/runtime/providers/claude/source-plan.ts";
import {
  createRefreshError,
  isRecord,
  parseJsonText,
  readJsonFile,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

interface ClaudeWebUsageResponse {
  accountEmail: string | null;
  metrics: ProviderMetricInput[];
}

interface StoredProviderMetricRecord {
  detail?: string | null;
  kind?: ProviderMetricKind;
  label: string;
  value: string;
}

const isStoredProviderMetricRecord = (value: unknown): value is StoredProviderMetricRecord => {
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

const parseStoredUsedPercent = (value: string): number | null => {
  const matchedPercent = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)%$/u)?.[1];

  if (typeof matchedPercent !== "string") {
    return explicitNull;
  }

  const parsedPercent = Number(matchedPercent);

  return Number.isFinite(parsedPercent) ? parsedPercent : explicitNull;
};

const normalizeStoredProviderMetric = (
  metric: StoredProviderMetricRecord,
): ProviderMetricInput | null => {
  if (
    metric.kind === "session" ||
    metric.kind === "weekly" ||
    metric.kind === "sonnet" ||
    metric.kind === "pro" ||
    metric.kind === "flash"
  ) {
    const usedPercent = parseStoredUsedPercent(metric.value);

    if (usedPercent === null) {
      return explicitNull;
    }

    return createRateWindowMetricInput({
      kind: metric.kind,
      label: metric.label,
      ...(metric.detail === undefined ? {} : { detail: metric.detail }),
      usedPercent,
    });
  }

  return {
    label: metric.label,
    value: metric.value,
    ...(metric.detail === undefined ? {} : { detail: metric.detail }),
    ...(metric.kind === undefined ? {} : { kind: metric.kind }),
  };
};

const readProviderMetrics = (
  record: Record<string, unknown>,
  key: string,
): ProviderMetricInput[] | null => {
  const metrics = record[key];

  if (!Array.isArray(metrics)) {
    return explicitNull;
  }

  const normalizedMetrics: ProviderMetricInput[] = [];

  for (const metric of metrics) {
    if (!isStoredProviderMetricRecord(metric)) {
      return explicitNull;
    }

    const normalizedMetric = normalizeStoredProviderMetric(metric);

    if (normalizedMetric === null) {
      return explicitNull;
    }

    normalizedMetrics.push(normalizedMetric);
  }

  return normalizedMetrics;
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
  };
};

const createClaudeBrowserWebResult = async (
  host: RuntimeHost,
  session: ClaudeWebSessionSnapshot,
  updatedAt: string,
  version: string | null,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const webUsage = await fetchClaudeWebUsage(host, session);
  const accountOrg = sanitizeClaudeIdentityLabel(session.organizationName, webUsage.accountEmail);
  return createRefreshSuccessFromSeed("claude", "Claude refreshed via web session.", {
    accountEmail: webUsage.accountEmail,
    metrics: webUsage.metrics,
    planLabel: normalizeClaudePlanLabel(session.rateLimitTier, webUsage.accountEmail),
    providerDetails: {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    },
    sourceLabel: "web",
    updatedAt,
    version,
  });
};

const parseClaudeWebSnapshot = (
  tokenPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"claude"> => {
  const webMetrics = isRecord(tokenPayload) ? readProviderMetrics(tokenPayload, "metrics") : null;

  if (isRecord(tokenPayload) && webMetrics !== null) {
    const accountEmail = readString(tokenPayload, "accountEmail");
    const planLabel = normalizeClaudePlanLabel(readString(tokenPayload, "planLabel"), accountEmail);
    const accountOrg = sanitizeClaudeIdentityLabel(
      readClaudeOrganizationName(tokenPayload),
      accountEmail,
    );
    return createRefreshSuccessFromSeed("claude", "Claude refreshed via web session.", {
      accountEmail,
      metrics: webMetrics,
      planLabel,
      providerDetails: {
        accountOrg,
        kind: "claude",
        tokenCost: explicitNull,
      },
      sourceLabel: "web",
      updatedAt,
      version: explicitNull,
    });
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
  const planLabel = normalizeClaudePlanLabel(readString(tokenPayload, "plan"), accountEmail);
  const accountOrg = sanitizeClaudeIdentityLabel(
    readClaudeOrganizationName(tokenPayload, accountRecord),
    accountEmail,
  );
  return createRefreshSuccessFromSeed("claude", "Claude refreshed via web session.", {
    accountEmail,
    metrics,
    planLabel,
    providerDetails: {
      accountOrg,
      kind: "claude",
      tokenCost: explicitNull,
    },
    sourceLabel: "web",
    updatedAt,
    version: explicitNull,
  });
};

const refreshClaudeViaWeb = async (
  host: RuntimeHost,
  resolvedSource: ClaudeResolvedWebSource,
): Promise<ProviderRefreshActionResult<"claude">> => {
  const updatedAt = host.now().toISOString();
  const version = await resolveClaudeVersion(host);

  if (resolvedSource.kind === "manual-session-token") {
    const manualSession = await resolveClaudeWebSession(host, {
      cookieSource: "manual",
      manualSessionToken: resolvedSource.sessionToken,
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

  if (resolvedSource.kind === "browser-session") {
    try {
      return await createClaudeBrowserWebResult(host, resolvedSource.session, updatedAt, version);
    } catch (error) {
      if (error instanceof Error) {
        return createRefreshError("claude", error.message);
      }

      return createRefreshError("claude", "Claude web session refresh failed.");
    }
  }

  const tokenPayload = await readJsonFile(host, resolvedSource.tokenFilePath);

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

export { refreshClaudeViaWeb };
