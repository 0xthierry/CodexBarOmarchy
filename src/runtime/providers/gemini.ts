/* eslint-disable max-lines-per-function, max-statements, no-continue, no-magic-numbers, no-ternary, sort-imports */

import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import type {
  GeminiProviderAdapter,
  ProviderRefreshActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatFractionPercent,
  isRecord,
  joinPath,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

const resolveGeminiSettingsPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "settings.json");

const resolveGeminiOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "oauth_creds.json");

const resolveGeminiQuotaPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "quota.json");

const readGeminiAuthType = async (host: RuntimeHost): Promise<string | null> => {
  const settingsPayload = await readJsonFile(host, resolveGeminiSettingsPath(host));

  if (settingsPayload.status !== "ok" || !isRecord(settingsPayload.value)) {
    return explicitNull;
  }

  const security = readNestedRecord(settingsPayload.value, "security");
  const auth = security ? readNestedRecord(security, "auth") : explicitNull;

  return auth ? readString(auth, "selectedType") : explicitNull;
};

const resolveGeminiSource = async (host: RuntimeHost): Promise<"api" | null> => {
  const authType = await readGeminiAuthType(host);

  if (authType === null || authType === "api-key" || authType === "vertex-ai") {
    return explicitNull;
  }

  const hasOauth = await host.fileSystem.fileExists(resolveGeminiOauthPath(host));
  const hasQuotaSnapshot = await host.fileSystem.fileExists(resolveGeminiQuotaPath(host));

  return hasOauth && hasQuotaSnapshot ? "api" : explicitNull;
};

const parseGeminiQuotaSnapshot = (
  quotaPayload: unknown,
  oauthPayload: unknown,
  updatedAt: string,
): ProviderRefreshActionResult<"gemini"> => {
  if (!isRecord(quotaPayload)) {
    return createRefreshError("gemini", "Gemini quota data is not valid JSON.");
  }

  const oauthRecord = isRecord(oauthPayload) ? oauthPayload : explicitNull;
  const bucketsValue = quotaPayload["buckets"];

  if (!Array.isArray(bucketsValue)) {
    return createRefreshError("gemini", "Gemini quota data did not include buckets.");
  }

  const metrics = [];

  for (const bucket of bucketsValue) {
    if (!isRecord(bucket)) {
      continue;
    }

    const modelId = readString(bucket, "modelId");
    const remainingFractionValue = readFiniteNumber(bucket, "remainingFraction");
    const resetTime = readString(bucket, "resetTime");

    if (remainingFractionValue === null || modelId === null) {
      continue;
    }

    if (modelId.toLowerCase().includes("pro")) {
      metrics.push({
        detail: resetTime,
        label: "Pro",
        value: formatFractionPercent(remainingFractionValue),
      });
    }

    if (modelId.toLowerCase().includes("flash")) {
      metrics.push({
        detail: resetTime,
        label: "Flash",
        value: formatFractionPercent(remainingFractionValue),
      });
    }
  }

  if (metrics.length === 0) {
    return createRefreshError("gemini", "Gemini quota data did not include Pro or Flash buckets.");
  }

  return createRefreshSuccess(
    "gemini",
    "Gemini refreshed via API.",
    createSnapshot({
      accountEmail:
        readString(quotaPayload, "email") ??
        (oauthRecord ? readString(oauthRecord, "email") : explicitNull) ??
        (oauthRecord ? readJwtEmail(oauthRecord, "id_token") : explicitNull) ??
        (oauthRecord ? readJwtEmail(oauthRecord, "idToken") : explicitNull),
      metrics,
      planLabel:
        readString(quotaPayload, "plan") ??
        readString(readNestedRecord(quotaPayload, "currentTier") ?? quotaPayload, "id"),
      sourceLabel: "api",
      updatedAt,
      version: readString(quotaPayload, "version"),
    }),
  );
};

const createGeminiProviderAdapter = (host: RuntimeHost): GeminiProviderAdapter => ({
  login: async (): Promise<ReturnType<typeof createSuccessfulProviderActionResult<"gemini", "login">>> => {
    await host.spawnTerminal("gemini", ["auth", "login"]);

    return createSuccessfulProviderActionResult("gemini", "login", "Opened Gemini login.");
  },
  refresh: async (): Promise<ProviderRefreshActionResult<"gemini">> => {
    const resolvedSource = await resolveGeminiSource(host);

    if (resolvedSource === null) {
      return createRefreshError("gemini", "Gemini OAuth credentials or quota data are unavailable.");
    }

    const quotaPayload = await readJsonFile(host, resolveGeminiQuotaPath(host));
    const oauthPayload = await readJsonFile(host, resolveGeminiOauthPath(host));

    if (quotaPayload.status !== "ok" || oauthPayload.status !== "ok") {
      return createRefreshError("gemini", "Gemini OAuth credentials or quota data are unavailable.");
    }

    return parseGeminiQuotaSnapshot(quotaPayload.value, oauthPayload.value, host.now().toISOString());
  },
});

export {
  createGeminiProviderAdapter,
  readGeminiAuthType,
  resolveGeminiOauthPath,
  resolveGeminiQuotaPath,
  resolveGeminiSettingsPath,
  resolveGeminiSource,
};
