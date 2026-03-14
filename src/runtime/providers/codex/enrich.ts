import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { CodexProviderConfig } from "@/core/providers/codex.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { fetchTokenCostSnapshot } from "@/runtime/cost/fetcher.ts";
import { applyRefreshEnrichers, updateProviderDetails } from "@/runtime/providers/shared.ts";
import { resolveCodexWebSession } from "@/runtime/providers/codex-web-auth.ts";
import { fetchCodexWhamDashboard } from "@/runtime/providers/codex-web-wham.ts";
import { tryFetchProviderServiceStatus } from "@/runtime/providers/service-status.ts";

const codexStatusPageUrl = "https://status.openai.com";

const tryFetchCodexTokenCost = async (host: RuntimeHost) => {
  try {
    return await fetchTokenCostSnapshot("codex", {
      env: host.env,
      homeDirectory: host.homeDirectory,
      now: host.now(),
    });
  } catch {
    return explicitNull;
  }
};

const attachCodexServiceStatus = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"codex">,
): Promise<ProviderRefreshActionResult<"codex">> => {
  if (result.snapshot === null) {
    return result;
  }

  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      serviceStatus: await tryFetchProviderServiceStatus(host, {
        baseUrl: codexStatusPageUrl,
        componentName: "Codex",
        kind: "statuspage",
      }),
    },
  };
};

const attachCodexWebDetails = async (
  host: RuntimeHost,
  providerConfig: CodexProviderConfig,
  result: ProviderRefreshActionResult<"codex">,
): Promise<ProviderRefreshActionResult<"codex">> => {
  if (
    result.snapshot === null ||
    !providerConfig.extrasEnabled ||
    providerConfig.cookieSource === "off"
  ) {
    return result;
  }

  try {
    const webSession = await resolveCodexWebSession(host, {
      cookieHeader: providerConfig.cookieHeader,
      cookieSource: providerConfig.cookieSource,
      expectedEmail: result.snapshot.identity.accountEmail,
    });

    if (webSession === null) {
      return result;
    }

    const dashboard = await fetchCodexWhamDashboard(host, webSession);

    if (dashboard === null) {
      return result;
    }

    return {
      ...result,
      snapshot: {
        ...updateProviderDetails(
          result.snapshot,
          "codex",
          () => ({
            dashboard: explicitNull,
            kind: "codex",
            tokenCost: explicitNull,
          }),
          (details) => ({
            ...details,
            dashboard,
          }),
        ),
        identity: {
          ...result.snapshot.identity,
          accountEmail: result.snapshot.identity.accountEmail ?? webSession.accountEmail,
        },
      },
    };
  } catch {
    return result;
  }
};

const attachCodexTokenCost = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"codex">,
): Promise<ProviderRefreshActionResult<"codex">> => {
  if (result.snapshot === null) {
    return result;
  }

  const tokenCost = await tryFetchCodexTokenCost(host);

  if (
    tokenCost === null ||
    (tokenCost.daily.length === 0 && tokenCost.today === null && tokenCost.last30Days === null)
  ) {
    return result;
  }

  return {
    ...result,
    snapshot: updateProviderDetails(
      result.snapshot,
      "codex",
      () => ({
        dashboard: explicitNull,
        kind: "codex",
        tokenCost: explicitNull,
      }),
      (details) => ({
        ...details,
        tokenCost,
      }),
    ),
  };
};

const finalizeCodexRefresh = async (
  host: RuntimeHost,
  providerConfig: CodexProviderConfig,
  result: ProviderRefreshActionResult<"codex">,
): Promise<ProviderRefreshActionResult<"codex">> =>
  applyRefreshEnrichers(result, [
    (currentResult) => attachCodexWebDetails(host, providerConfig, currentResult),
    (currentResult) => attachCodexTokenCost(host, currentResult),
    (currentResult) => attachCodexServiceStatus(host, currentResult),
  ]);

export { finalizeCodexRefresh };
