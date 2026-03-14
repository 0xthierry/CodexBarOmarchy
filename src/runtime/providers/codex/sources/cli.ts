import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeCommandLineSession, RuntimeHost } from "@/runtime/host.ts";
import type { CodexResolvedCliSource } from "@/runtime/providers/codex/source-plan.ts";
import {
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  formatPercent,
  isRecord,
  parseJsonText,
  readFiniteNumber,
  readNestedRecord,
  readString,
  withProviderDetails,
} from "@/runtime/providers/shared.ts";
import type { ProviderMetricInput } from "@/runtime/providers/shared.ts";

const codexAppServerArgs = ["-s", "read-only", "-a", "never", "app-server"] as const;
const codexRequestTimeoutMs = 15_000;

interface CodexAppServerAccountResult {
  account?: {
    email?: string;
    planType?: string;
    type?: string;
  };
}

interface CodexAppServerRateLimitWindow {
  resetsAt?: number;
  usedPercent?: number;
}

interface CodexAppServerCredits {
  balance?: number | string;
}

interface CodexAppServerRateLimits {
  credits?: CodexAppServerCredits | null;
  planType?: string;
  primary?: CodexAppServerRateLimitWindow;
  secondary?: CodexAppServerRateLimitWindow;
}

interface CodexAppServerRateLimitResult {
  rateLimits?: CodexAppServerRateLimits;
}

const formatResetAt = (unixSeconds: number | undefined): string | null => {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return explicitNull;
  }

  return new Date(unixSeconds * 1000).toISOString();
};

const parseCodexRpcMessage = (line: string): Record<string, unknown> | null => {
  try {
    const value = parseJsonText(line);

    return isRecord(value) ? value : explicitNull;
  } catch {
    return explicitNull;
  }
};

const readCodexRpcResponse = async (
  session: RuntimeCommandLineSession,
  requestId: number,
): Promise<Record<string, unknown> | null> => {
  while (true) {
    const line = await session.readLine({ timeoutMs: codexRequestTimeoutMs });

    if (line === null) {
      return explicitNull;
    }

    const payload = parseCodexRpcMessage(line);

    if (payload === null) {
      continue;
    }

    const payloadId = readFiniteNumber(payload, "id");

    if (payloadId === requestId) {
      return payload;
    }
  }
};

const readCodexRpcResult = (
  payload: Record<string, unknown> | null,
  methodName: string,
): Record<string, unknown> | null => {
  if (payload === null) {
    throw new Error(`Codex app-server did not return a response for ${methodName}.`);
  }

  const errorRecord = readNestedRecord(payload, "error");

  if (errorRecord !== null) {
    throw new Error(
      readString(errorRecord, "message") ?? `Codex app-server failed for ${methodName}.`,
    );
  }

  return readNestedRecord(payload, "result");
};

const readCodexRpcVersion = (initializeResult: Record<string, unknown> | null): string | null => {
  const userAgent = initializeResult ? readString(initializeResult, "userAgent") : explicitNull;
  const versionToken = userAgent?.match(/\/([0-9][^ ]*)/u)?.[1];

  return typeof versionToken === "string" && versionToken !== "" ? versionToken : explicitNull;
};

const parseCodexCliSnapshot = (
  accountResult: CodexAppServerAccountResult,
  rateLimitResult: CodexAppServerRateLimitResult,
  updatedAt: string,
  version: string | null,
): ProviderRefreshActionResult<"codex"> => {
  const { rateLimits } = rateLimitResult;
  const metrics: ProviderMetricInput[] = [];
  const primaryPercent = rateLimits?.primary?.usedPercent;
  const secondaryPercent = rateLimits?.secondary?.usedPercent;
  let creditBalance = NaN;

  if (typeof rateLimits?.credits?.balance === "number") {
    creditBalance = rateLimits.credits.balance;
  } else if (typeof rateLimits?.credits?.balance === "string") {
    creditBalance = Number(rateLimits.credits.balance);
  }

  if (typeof primaryPercent === "number") {
    metrics.push({
      detail: formatResetAt(rateLimits?.primary?.resetsAt),
      kind: "session",
      label: "Session",
      value: formatPercent(primaryPercent),
    });
  }

  if (typeof secondaryPercent === "number") {
    metrics.push({
      detail: formatResetAt(rateLimits?.secondary?.resetsAt),
      kind: "weekly",
      label: "Weekly",
      value: formatPercent(secondaryPercent),
    });
  }

  if (Number.isFinite(creditBalance)) {
    metrics.push({
      kind: "credits",
      label: "Credits",
      value: String(creditBalance),
    });
  }

  if (metrics.length === 0) {
    return createRefreshError("codex", "Codex CLI output did not contain usage metrics.");
  }

  const snapshot = createSnapshot({
    accountEmail: accountResult.account?.email ?? explicitNull,
    metrics,
    planLabel: accountResult.account?.planType ?? rateLimits?.planType ?? explicitNull,
    sourceLabel: "cli",
    updatedAt,
    version,
  });

  return createRefreshSuccess(
    "codex",
    "Codex refreshed via CLI.",
    withProviderDetails(snapshot, {
      dashboard: explicitNull,
      kind: "codex",
      tokenCost: explicitNull,
    }),
  );
};

const fetchCodexCliSnapshot = async (
  host: RuntimeHost,
  _resolvedSource: CodexResolvedCliSource,
): Promise<ProviderRefreshActionResult<"codex">> => {
  const session = await host.commands.createLineSession("codex", [...codexAppServerArgs]);

  try {
    await session.writeLine(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: {
          clientInfo: {
            name: "omarchy-agent-bar",
            version: "0.0.0",
          },
        },
      }),
    );

    const initializeResponse = readCodexRpcResult(
      await readCodexRpcResponse(session, 1),
      "initialize",
    );

    await session.writeLine(JSON.stringify({ method: "initialized", params: {} }));
    await session.writeLine(JSON.stringify({ id: 2, method: "account/read", params: {} }));

    const accountResult = readCodexRpcResult(
      await readCodexRpcResponse(session, 2),
      "account/read",
    );

    await session.writeLine(
      JSON.stringify({ id: 3, method: "account/rateLimits/read", params: {} }),
    );

    const rateLimitResult = readCodexRpcResult(
      await readCodexRpcResponse(session, 3),
      "account/rateLimits/read",
    );

    return parseCodexCliSnapshot(
      (accountResult ?? {}) as CodexAppServerAccountResult,
      (rateLimitResult ?? {}) as CodexAppServerRateLimitResult,
      host.now().toISOString(),
      readCodexRpcVersion(initializeResponse),
    );
  } catch (error) {
    if (error instanceof Error) {
      return createRefreshError("codex", error.message);
    }

    return createRefreshError("codex", "Codex CLI refresh failed.");
  } finally {
    await session.close();
  }
};

export { fetchCodexCliSnapshot };
