import { explicitNull } from "@/core/providers/shared.ts";
import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { applyRefreshEnrichers, updateProviderDetails } from "@/runtime/providers/shared.ts";
import { tryFetchWorkspaceStatusBundle } from "@/runtime/providers/service-status.ts";

const geminiStatusWorkspaceProductId = "npdyhgECDJ6tB66MxXyo";

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
      ...updateProviderDetails(
        result.snapshot,
        "gemini",
        () => ({
          incidents: [],
          kind: "gemini",
          quotaDrilldown: explicitNull,
        }),
        (details) => ({
          ...details,
          incidents: workspaceStatus.incidents,
        }),
      ),
      serviceStatus: workspaceStatus.serviceStatus,
    },
  };
};

const finalizeGeminiRefresh = async (
  host: RuntimeHost,
  result: ProviderRefreshActionResult<"gemini">,
): Promise<ProviderRefreshActionResult<"gemini">> =>
  applyRefreshEnrichers(result, [
    (currentResult) => attachGeminiWorkspaceStatus(host, currentResult),
  ]);

export { attachGeminiWorkspaceStatus, finalizeGeminiRefresh };
