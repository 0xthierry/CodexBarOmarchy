import {
  explicitNull,
  isRecord,
  readBoolean,
  readNullableString,
  readStringEnum,
} from "./shared.ts";
import { providerAvailabilityModes } from './claude.ts';
import type { ProviderAvailabilityMode } from './claude.ts';

const codexCookieSources = ["auto", "manual", "off"] as const;
const codexUsageSources = ["auto", "oauth", "cli"] as const;

type CodexCookieSource = (typeof codexCookieSources)[number];
type CodexUsageSource = (typeof codexUsageSources)[number];

interface CodexProviderConfig {
  availabilityMode: ProviderAvailabilityMode;
  cookieHeader: string | null;
  cookieSource: CodexCookieSource;
  enabled: boolean;
  extrasEnabled: boolean;
  historicalTrackingEnabled: boolean;
  source: CodexUsageSource;
}

const createDefaultCodexProviderConfig = (): CodexProviderConfig => ({
  availabilityMode: "auto",
  cookieHeader: explicitNull,
  cookieSource: "off",
  enabled: true,
  extrasEnabled: false,
  historicalTrackingEnabled: true,
  source: "auto",
});

const normalizeCodexProviderConfig = (value: unknown): CodexProviderConfig => {
  const defaults = createDefaultCodexProviderConfig();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    availabilityMode: readStringEnum(value, {
      allowedValues: providerAvailabilityModes,
      fallback: defaults.availabilityMode,
      key: "availabilityMode",
    }),
    cookieHeader: readNullableString(value, "cookieHeader", defaults.cookieHeader),
    cookieSource: readStringEnum(value, {
      allowedValues: codexCookieSources,
      fallback: defaults.cookieSource,
      key: "cookieSource",
    }),
    enabled: readBoolean(value, "enabled", defaults.enabled),
    extrasEnabled: readBoolean(value, "extrasEnabled", defaults.extrasEnabled),
    historicalTrackingEnabled: readBoolean(
      value,
      "historicalTrackingEnabled",
      defaults.historicalTrackingEnabled,
    ),
    source: readStringEnum(value, {
      allowedValues: codexUsageSources,
      fallback: defaults.source,
      key: "source",
    }),
  };
};

export {
  codexCookieSources,
  codexUsageSources,
  createDefaultCodexProviderConfig,
  normalizeCodexProviderConfig,
  type CodexCookieSource,
  type CodexProviderConfig,
  type CodexUsageSource,
};
