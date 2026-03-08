import { createDefaultConfig, normalizeConfig } from "@/core/config/schema.ts";
import { describe, expect, test } from "bun:test";

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const expectedDefaultConfig: ReturnType<typeof createDefaultConfig> = {
  providerOrder: ["codex", "claude", "gemini"],
  providers: {
    claude: {
      activeTokenAccountIndex: 0,
      cookieSource: "auto",
      enabled: true,
      oauthPromptFreeCredentialsEnabled: false,
      oauthPromptPolicy: "only_on_user_action",
      source: "auto",
      tokenAccounts: [],
    },
    codex: {
      cookieHeader: explicitNull,
      cookieSource: "off",
      enabled: true,
      extrasEnabled: false,
      historicalTrackingEnabled: true,
      source: "auto",
    },
    gemini: {
      enabled: true,
    },
  },
  selectedProvider: "codex",
  version: 1,
};

const normalizationInput = {
  providerOrder: ["gemini", "gemini", "bogus"],
  providers: {
    claude: {
      activeTokenAccountIndex: 4,
      cookieSource: "manual",
      oauthPromptPolicy: "always_allow_prompts",
      tokenAccounts: [
        {
          label: "primary",
          token: "secret",
        },
        {
          label: "broken",
          token: 123,
        },
      ],
    },
    codex: {
      cookieHeader: "Cookie: sid=123",
      cookieSource: "manual",
      enabled: false,
      extrasEnabled: true,
      historicalTrackingEnabled: false,
      source: "oauth",
    },
    gemini: {
      enabled: false,
    },
  },
  selectedProvider: "bogus",
  version: 99,
};

const expectedNormalizedConfig: ReturnType<typeof createDefaultConfig> = {
  providerOrder: ["gemini", "codex", "claude"],
  providers: {
    claude: {
      activeTokenAccountIndex: 0,
      cookieSource: "manual",
      enabled: true,
      oauthPromptFreeCredentialsEnabled: false,
      oauthPromptPolicy: "always_allow_prompts",
      source: "auto",
      tokenAccounts: [
        {
          label: "primary",
          token: "secret",
        },
      ],
    },
    codex: {
      cookieHeader: "Cookie: sid=123",
      cookieSource: "manual",
      enabled: false,
      extrasEnabled: true,
      historicalTrackingEnabled: false,
      source: "oauth",
    },
    gemini: {
      enabled: false,
    },
  },
  selectedProvider: "gemini",
  version: 1,
};

const roundTripInput = {
  providerOrder: ["claude", "codex", "gemini"],
  providers: {
    claude: {
      tokenAccounts: [
        {
          label: "main",
          token: "abc",
        },
      ],
    },
    codex: {
      extrasEnabled: true,
    },
  },
  selectedProvider: "claude",
};

describe("config schema", () => {
  test("creates the default config expected by the spec", () => {
    expect(createDefaultConfig()).toEqual(expectedDefaultConfig);
  });

  test("normalizes partial and invalid input", () => {
    expect(normalizeConfig(normalizationInput)).toEqual(expectedNormalizedConfig);
  });

  test("round-trips through JSON without changing normalized shape", () => {
    const initialConfig = normalizeConfig(roundTripInput);
    const serialized = JSON.stringify(initialConfig);
    const parsed = JSON.parse(serialized) as unknown;

    expect(normalizeConfig(parsed)).toEqual(initialConfig);
  });
});
