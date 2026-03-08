import { isRecord, readBoolean } from "./shared.ts";

interface GeminiProviderConfig {
  enabled: boolean;
}

const createDefaultGeminiProviderConfig = (): GeminiProviderConfig => ({
  enabled: true,
});

const normalizeGeminiProviderConfig = (value: unknown): GeminiProviderConfig => {
  const defaults = createDefaultGeminiProviderConfig();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    enabled: readBoolean(value, "enabled", defaults.enabled),
  };
};

export {
  createDefaultGeminiProviderConfig,
  normalizeGeminiProviderConfig,
  type GeminiProviderConfig,
};
