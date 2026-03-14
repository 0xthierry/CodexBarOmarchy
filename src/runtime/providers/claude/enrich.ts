import { explicitNull } from "@/core/providers/shared.ts";
import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { fetchTokenCostSnapshot } from "@/runtime/cost/fetcher.ts";
import { tryFetchProviderServiceStatus } from "@/runtime/providers/service-status.ts";

const claudeStatusPageUrl = "https://status.claude.com";

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
        accountOrg: existingDetails?.accountOrg ?? explicitNull,
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

export { finalizeClaudeRefresh };
