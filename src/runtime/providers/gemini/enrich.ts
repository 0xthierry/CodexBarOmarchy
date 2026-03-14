import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
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

export { attachGeminiWorkspaceStatus };
