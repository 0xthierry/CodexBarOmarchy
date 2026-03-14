import type { ProviderRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import type { ProviderId } from "@/runtime/providers/collection/snapshot.ts";
import { createRefreshError } from "@/runtime/providers/collection/snapshot.ts";

type RefreshEnricher<ProviderValue extends ProviderId> = (
  result: ProviderRefreshActionResult<ProviderValue>,
) => Promise<ProviderRefreshActionResult<ProviderValue>>;

const applyRefreshEnrichers = async <ProviderValue extends ProviderId>(
  result: ProviderRefreshActionResult<ProviderValue>,
  enrichers: RefreshEnricher<ProviderValue>[],
): Promise<ProviderRefreshActionResult<ProviderValue>> => {
  let currentResult = result;

  for (const enricher of enrichers) {
    currentResult = await enricher(currentResult);
  }

  return currentResult;
};

const runResolvedRefresh = async <ProviderValue extends ProviderId, ResolvedSource>(input: {
  finalizeResult?: (
    result: ProviderRefreshActionResult<ProviderValue>,
  ) => Promise<ProviderRefreshActionResult<ProviderValue>>;
  providerId: ProviderValue;
  refreshFromResolvedSource: (
    resolvedSource: ResolvedSource,
  ) => Promise<ProviderRefreshActionResult<ProviderValue>>;
  resolveSource: () => Promise<ResolvedSource | null>;
  unavailableMessage: string;
}): Promise<ProviderRefreshActionResult<ProviderValue>> => {
  const resolvedSource = await input.resolveSource();

  if (resolvedSource === null) {
    return createRefreshError(input.providerId, input.unavailableMessage);
  }

  const result = await input.refreshFromResolvedSource(resolvedSource);

  if (input.finalizeResult !== undefined) {
    return input.finalizeResult(result);
  }

  return result;
};

export { applyRefreshEnrichers, runResolvedRefresh, type RefreshEnricher };
