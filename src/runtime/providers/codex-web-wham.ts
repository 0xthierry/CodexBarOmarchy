import { explicitNull } from "@/core/providers/shared.ts";
import type {
  CodexCreditHistoryPoint,
  CodexDashboardRateLimitSnapshot,
  CodexDashboardSnapshot,
  CodexUsageBreakdownPoint,
} from "@/core/store/runtime-state.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import type { CodexWebAuthSession } from "@/runtime/providers/codex-web-auth-models.ts";
import {
  isRecord,
  parseJsonText,
  readArray,
  readFiniteNumber,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

const codexWhamBaseUrl = "https://chatgpt.com/backend-api/wham/usage";

const fetchCodexWhamJson = async (
  host: RuntimeHost,
  session: CodexWebAuthSession,
  path: string,
): Promise<unknown | null> => {
  const response = await host.http.request(`${codexWhamBaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      Cookie: session.cookieHeader,
    },
    method: "GET",
    timeoutMs: 15_000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }

  try {
    return parseJsonText(response.bodyText);
  } catch {
    return null;
  }
};

const toDashboardRateLimitSnapshot = (
  label: string,
  value: unknown,
): CodexDashboardRateLimitSnapshot | null => {
  if (!isRecord(value)) {
    return null;
  }

  const remainingPercent =
    readFiniteNumber(value, "remaining_percent") ??
    (() => {
      const usedPercent = readFiniteNumber(value, "used_percent");
      return usedPercent === null ? null : Math.max(0, 100 - usedPercent);
    })();

  return {
    label,
    remainingPercent,
    resetAt: readString(value, "reset_at"),
  };
};

const parseCreditHistory = (payload: unknown): CodexCreditHistoryPoint[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const data = readArray(payload, "data");

  if (data === null) {
    return [];
  }

  return data
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      amount:
        readFiniteNumber(entry, "amount") ??
        readFiniteNumber(entry, "credit_amount") ??
        readFiniteNumber(entry, "delta") ??
        0,
      occurredAt:
        readString(entry, "occurred_at") ??
        readString(entry, "created_at") ??
        readString(entry, "timestamp") ??
        new Date(0).toISOString(),
      type: readString(entry, "type") ?? readString(entry, "event_type"),
    }))
    .filter((entry) => entry.occurredAt !== new Date(0).toISOString());
};

const parseUsageBreakdown = (payload: unknown): CodexUsageBreakdownPoint[] => {
  if (!isRecord(payload)) {
    return [];
  }

  const data = readArray(payload, "data");

  if (data === null) {
    return [];
  }

  return data
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      date: readString(entry, "date") ?? readString(entry, "day") ?? "",
      inputTokens: readFiniteNumber(entry, "input_tokens"),
      outputTokens: readFiniteNumber(entry, "output_tokens"),
      totalTokens: readFiniteNumber(entry, "total_tokens"),
    }))
    .filter((entry) => entry.date !== "");
};

const fetchCodexWhamDashboard = async (
  host: RuntimeHost,
  session: CodexWebAuthSession,
): Promise<CodexDashboardSnapshot | null> => {
  const [usagePayload, creditHistoryPayload, usageBreakdownPayload, approximateUsagePayload] =
    await Promise.all([
      fetchCodexWhamJson(host, session, ""),
      fetchCodexWhamJson(host, session, "/credit-usage-events"),
      fetchCodexWhamJson(host, session, "/daily-token-usage-breakdown"),
      fetchCodexWhamJson(host, session, "/approximate-credit-usage?credit_amount=125"),
    ]);

  if (!isRecord(usagePayload)) {
    return null;
  }

  const codeReviewWindow = toDashboardRateLimitSnapshot(
    "Code review",
    readNestedRecord(usagePayload, "code_review_rate_limit"),
  );
  const additionalRateLimitEntries = readArray(usagePayload, "additional_rate_limits") ?? [];
  const additionalRateLimits = additionalRateLimitEntries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry, index) =>
      toDashboardRateLimitSnapshot(
        readString(entry, "label") ?? `Additional ${String(index + 1)}`,
        entry,
      ),
    )
    .filter((entry): entry is CodexDashboardRateLimitSnapshot => entry !== null);

  return {
    additionalRateLimits,
    approximateCreditUsage: isRecord(approximateUsagePayload)
      ? {
          cloudMessages: readFiniteNumber(approximateUsagePayload, "approx_cloud_messages"),
          localMessages: readFiniteNumber(approximateUsagePayload, "approx_local_messages"),
        }
      : explicitNull,
    codeReviewWindow,
    creditHistory: parseCreditHistory(creditHistoryPayload),
    purchaseUrl:
      readString(usagePayload, "purchase_url") ??
      readString(usagePayload, "buy_credits_url") ??
      explicitNull,
    usageBreakdown: parseUsageBreakdown(usageBreakdownPayload),
  };
};

export { fetchCodexWhamDashboard };
