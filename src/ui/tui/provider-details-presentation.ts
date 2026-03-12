import type { TokenCostSnapshot } from "@/core/store/runtime-state.ts";
import { formatDecimalAmount } from "@/ui/tui/provider-cost-presentation.ts";
import type { ProviderView } from "@/ui/tui/types.ts";

const createTokenCostDetailLines = (tokenCost: TokenCostSnapshot | null): string[] => {
  if (tokenCost === null) {
    return [];
  }

  const lines = ["", "Cost:"];

  if (tokenCost.today !== null) {
    lines.push(
      tokenCost.today.costUsd === null
        ? "Estimated token cost today: unavailable"
        : `Estimated token cost today: USD ${formatDecimalAmount(tokenCost.today.costUsd)}`,
    );
  }

  if (tokenCost.last30Days !== null) {
    lines.push(
      tokenCost.last30Days.costUsd === null
        ? "Estimated token cost 30d: unavailable"
        : `Estimated token cost 30d: USD ${formatDecimalAmount(tokenCost.last30Days.costUsd)}`,
    );
  }

  return lines;
};

const createProviderDetailUsageLines = (providerView: ProviderView): string[] => {
  const { providerDetails } = providerView.status;

  if (providerDetails === null) {
    return [];
  }

  if (providerDetails.kind === "codex") {
    const lines: string[] = [];

    if (providerDetails.dashboard !== null) {
      if (providerDetails.dashboard.creditHistory.length > 0) {
        lines.push(
          `Credit history ${String(providerDetails.dashboard.creditHistory.length)} events`,
        );
      }

      const { approximateCreditUsage } = providerDetails.dashboard;

      if (
        approximateCreditUsage !== null &&
        (approximateCreditUsage.cloudMessages !== null ||
          approximateCreditUsage.localMessages !== null)
      ) {
        const segments: string[] = [];

        if (approximateCreditUsage.cloudMessages !== null) {
          segments.push(`${String(approximateCreditUsage.cloudMessages)} cloud`);
        }

        if (approximateCreditUsage.localMessages !== null) {
          segments.push(`${String(approximateCreditUsage.localMessages)} local`);
        }

        lines.push(`Credits approx ${segments.join(" / ")}`);
      }
    }

    lines.push(...createTokenCostDetailLines(providerDetails.tokenCost));
    return lines;
  }

  if (providerDetails.kind === "claude") {
    return createTokenCostDetailLines(providerDetails.tokenCost);
  }

  if (providerDetails.incidents.length === 0) {
    return [];
  }

  return ["", `Incidents ${String(providerDetails.incidents.length)}`];
};

const appendProviderSpecificDetailRows = (
  rows: [string, string][],
  providerView: ProviderView,
): void => {
  if (providerView.status.providerDetails?.kind === "claude") {
    if (providerView.status.providerDetails.accountOrg !== null) {
      rows.push(["org", providerView.status.providerDetails.accountOrg]);
    }

    return;
  }

  if (providerView.status.providerDetails?.kind === "gemini") {
    if (providerView.status.providerDetails.incidents.length > 0) {
      rows.push([
        "incident",
        providerView.status.providerDetails.incidents[0]?.summary ?? "active",
      ]);
    }
  }
};

export { appendProviderSpecificDetailRows, createProviderDetailUsageLines };
