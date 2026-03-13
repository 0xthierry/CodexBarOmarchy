import { isRecord, readArray, readBoolean, readInteger, readStringEnum } from "./shared.ts";

const defaultTokenAccountIndex = 0;

const providerAvailabilityModes = ["auto", "manual"] as const;
const claudeCookieSources = ["auto", "manual"] as const;
const claudeUsageSources = ["auto", "oauth", "web", "cli"] as const;

type ProviderAvailabilityMode = (typeof providerAvailabilityModes)[number];
type ClaudeCookieSource = (typeof claudeCookieSources)[number];
type ClaudeUsageSource = (typeof claudeUsageSources)[number];

interface ClaudeTokenAccount {
  label: string;
  token: string;
}

interface ClaudeProviderConfig {
  activeTokenAccountIndex: number;
  availabilityMode: ProviderAvailabilityMode;
  cookieSource: ClaudeCookieSource;
  enabled: boolean;
  source: ClaudeUsageSource;
  tokenAccounts: ClaudeTokenAccount[];
}

const normalizeClaudeTokenAccounts = (value: unknown[]): ClaudeTokenAccount[] => {
  const normalized: ClaudeTokenAccount[] = [];

  for (const entry of value) {
    if (isRecord(entry)) {
      const { label, token } = entry;

      if (typeof label === "string" && typeof token === "string") {
        normalized.push({ label, token });
      }
    }
  }

  return normalized;
};

const normalizeTokenAccountIndex = (index: number, tokenAccountCount: number): number => {
  if (tokenAccountCount === defaultTokenAccountIndex) {
    return defaultTokenAccountIndex;
  }

  if (index < defaultTokenAccountIndex || index >= tokenAccountCount) {
    return defaultTokenAccountIndex;
  }

  return index;
};

const createDefaultClaudeProviderConfig = (): ClaudeProviderConfig => ({
  activeTokenAccountIndex: defaultTokenAccountIndex,
  availabilityMode: "auto",
  cookieSource: "auto",
  enabled: true,
  source: "auto",
  tokenAccounts: [],
});

const normalizeClaudeProviderConfig = (value: unknown): ClaudeProviderConfig => {
  const defaults = createDefaultClaudeProviderConfig();

  if (!isRecord(value)) {
    return defaults;
  }

  const tokenAccounts = normalizeClaudeTokenAccounts(readArray(value, "tokenAccounts"));
  const configuredIndex = readInteger(
    value,
    "activeTokenAccountIndex",
    defaults.activeTokenAccountIndex,
  );

  return {
    activeTokenAccountIndex: normalizeTokenAccountIndex(configuredIndex, tokenAccounts.length),
    availabilityMode: readStringEnum(value, {
      allowedValues: providerAvailabilityModes,
      fallback: defaults.availabilityMode,
      key: "availabilityMode",
    }),
    cookieSource: readStringEnum(value, {
      allowedValues: claudeCookieSources,
      fallback: defaults.cookieSource,
      key: "cookieSource",
    }),
    enabled: readBoolean(value, "enabled", defaults.enabled),
    source: readStringEnum(value, {
      allowedValues: claudeUsageSources,
      fallback: defaults.source,
      key: "source",
    }),
    tokenAccounts,
  };
};

export {
  claudeCookieSources,
  claudeUsageSources,
  createDefaultClaudeProviderConfig,
  normalizeClaudeProviderConfig,
  providerAvailabilityModes,
  type ClaudeCookieSource,
  type ClaudeProviderConfig,
  type ProviderAvailabilityMode,
  type ClaudeTokenAccount,
  type ClaudeUsageSource,
};
