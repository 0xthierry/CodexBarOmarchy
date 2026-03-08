import { isProviderId, providerIds } from "./provider-id.ts";

type ProviderId = (typeof providerIds)[number];

const defaultProviderOrder = [...providerIds];
const emptyProviderOrderLength = 0;

const appendMissingProviders = (providerOrder: readonly ProviderId[]): ProviderId[] => {
  const normalizedProviderOrder = [...providerOrder];

  for (const providerId of defaultProviderOrder) {
    if (!normalizedProviderOrder.includes(providerId)) {
      normalizedProviderOrder.push(providerId);
    }
  }

  return normalizedProviderOrder;
};

const collectKnownProviderIds = (values: readonly unknown[]): ProviderId[] => {
  const normalizedProviderOrder: ProviderId[] = [];

  for (const entry of values) {
    if (isProviderId(entry) && !normalizedProviderOrder.includes(entry)) {
      normalizedProviderOrder.push(entry);
    }
  }

  return normalizedProviderOrder;
};

const normalizeProviderOrder = (value: unknown): ProviderId[] => {
  if (!Array.isArray(value)) {
    return [...defaultProviderOrder];
  }

  const deduplicatedOrder = collectKnownProviderIds(value);

  return appendMissingProviders(deduplicatedOrder);
};

const normalizeSelectedProvider = (
  value: unknown,
  providerOrder: readonly ProviderId[],
): ProviderId => {
  if (isProviderId(value) && providerOrder.includes(value)) {
    return value;
  }

  if (providerOrder.length === emptyProviderOrderLength) {
    return "codex";
  }

  return providerOrder[emptyProviderOrderLength] ?? "codex";
};

export { defaultProviderOrder, normalizeProviderOrder, normalizeSelectedProvider };
