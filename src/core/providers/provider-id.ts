const providerIds = ["codex", "claude", "gemini"] as const;

type ProviderId = (typeof providerIds)[number];

const isProviderId = (value: unknown): value is ProviderId => {
  if (typeof value !== "string") {
    return false;
  }

  for (const providerId of providerIds) {
    if (providerId === value) {
      return true;
    }
  }

  return false;
};

export { isProviderId, providerIds, type ProviderId };
