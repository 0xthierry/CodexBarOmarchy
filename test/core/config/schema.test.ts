import { createDefaultConfig, normalizeConfig } from "@/core/config/schema.ts";
import { describe, expect, test } from "bun:test";

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const expectedDefaultConfig: ReturnType<typeof createDefaultConfig> = {
  detectedBinaries: null,
  providerOrder: ["codex", "claude", "gemini"],
  providers: {
    claude: {
      activeTokenAccountIndex: 0,
      availabilityMode: "auto",
      cookieSource: "auto",
      enabled: true,
      source: "auto",
      tokenAccounts: [],
    },
    codex: {
      availabilityMode: "auto",
      cookieHeader: explicitNull,
      cookieSource: "off",
      enabled: true,
      extrasEnabled: false,
      historicalTrackingEnabled: true,
      source: "auto",
    },
    gemini: {
      availabilityMode: "auto",
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
      availabilityMode: "manual",
      cookieSource: "manual",
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
      availabilityMode: "manual",
      cookieHeader: "Cookie: sid=123",
      cookieSource: "manual",
      enabled: false,
      extrasEnabled: true,
      historicalTrackingEnabled: false,
      source: "oauth",
    },
    gemini: {
      availabilityMode: "manual",
      enabled: false,
    },
  },
  selectedProvider: "bogus",
  version: 99,
};

const expectedNormalizedConfig: ReturnType<typeof createDefaultConfig> = {
  detectedBinaries: null,
  providerOrder: ["gemini", "codex", "claude"],
  providers: {
    claude: {
      activeTokenAccountIndex: 0,
      availabilityMode: "manual",
      cookieSource: "manual",
      enabled: true,
      source: "auto",
      tokenAccounts: [
        {
          label: "primary",
          token: "secret",
        },
      ],
    },
    codex: {
      availabilityMode: "manual",
      cookieHeader: "Cookie: sid=123",
      cookieSource: "manual",
      enabled: false,
      extrasEnabled: true,
      historicalTrackingEnabled: false,
      source: "oauth",
    },
    gemini: {
      availabilityMode: "manual",
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
