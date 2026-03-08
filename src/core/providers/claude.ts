import { isRecord, readArray, readBoolean, readInteger, readStringEnum } from "./shared.ts";

const defaultTokenAccountIndex = 0;

const claudeCookieSources = ["auto", "manual"] as const;
const claudePromptPolicies = [
  "never_prompt",
  "only_on_user_action",
  "always_allow_prompts",
] as const;
const claudeUsageSources = ["auto", "oauth", "web", "cli"] as const;

type ClaudeCookieSource = (typeof claudeCookieSources)[number];
type ClaudePromptPolicy = (typeof claudePromptPolicies)[number];
type ClaudeUsageSource = (typeof claudeUsageSources)[number];

interface ClaudeTokenAccount {
  label: string;
  token: string;
}

interface ClaudeProviderConfig {
  enabled: boolean;
  activeTokenAccountIndex: number;
  cookieSource: ClaudeCookieSource;
  oauthPromptFreeCredentialsEnabled: boolean;
  oauthPromptPolicy: ClaudePromptPolicy;
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
  cookieSource: "auto",
  enabled: true,
  oauthPromptFreeCredentialsEnabled: false,
  oauthPromptPolicy: "only_on_user_action",
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
    cookieSource: readStringEnum(value, {
      allowedValues: claudeCookieSources,
      fallback: defaults.cookieSource,
      key: "cookieSource",
    }),
    enabled: readBoolean(value, "enabled", defaults.enabled),
    oauthPromptFreeCredentialsEnabled: readBoolean(
      value,
      "oauthPromptFreeCredentialsEnabled",
      defaults.oauthPromptFreeCredentialsEnabled,
    ),
    oauthPromptPolicy: readStringEnum(value, {
      allowedValues: claudePromptPolicies,
      fallback: defaults.oauthPromptPolicy,
      key: "oauthPromptPolicy",
    }),
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
  claudePromptPolicies,
  claudeUsageSources,
  createDefaultClaudeProviderConfig,
  normalizeClaudeProviderConfig,
  type ClaudeCookieSource,
  type ClaudePromptPolicy,
  type ClaudeProviderConfig,
  type ClaudeTokenAccount,
  type ClaudeUsageSource,
};
