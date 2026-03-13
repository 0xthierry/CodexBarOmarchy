import { isRecord, readBoolean, readStringEnum } from "./shared.ts";
import { providerAvailabilityModes } from './claude.ts';
import type { ProviderAvailabilityMode } from './claude.ts';

interface GeminiProviderConfig {
  availabilityMode: ProviderAvailabilityMode;
  enabled: boolean;
}

const createDefaultGeminiProviderConfig = (): GeminiProviderConfig => ({
  availabilityMode: "auto",
  enabled: true,
});

const normalizeGeminiProviderConfig = (value: unknown): GeminiProviderConfig => {
  const defaults = createDefaultGeminiProviderConfig();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    availabilityMode: readStringEnum(value, {
      allowedValues: providerAvailabilityModes,
      fallback: defaults.availabilityMode,
      key: "availabilityMode",
    }),
    enabled: readBoolean(value, "enabled", defaults.enabled),
  };
};

export {
  createDefaultGeminiProviderConfig,
  normalizeGeminiProviderConfig,
  type GeminiProviderConfig,
};
