import {
  claudeCookieSources,
  claudePromptPolicies,
  claudeUsageSources,
} from "@/core/providers/claude.ts";
import { codexCookieSources, codexUsageSources } from "@/core/providers/codex.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { explicitNull } from "@/core/providers/shared.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderId = "claude" | "codex" | "gemini";

interface AppStoreState {
  config: OmarchyAgentBarConfig;
  enabledProviderIds: ProviderId[];
  providerViews: ProviderView[];
  selectedProviderId: ProviderId;
}

interface ProviderViewBase<ProviderValue extends ProviderId> {
  config: OmarchyAgentBarConfig["providers"][ProviderValue];
  enabled: boolean;
  id: ProviderValue;
  selected: boolean;
}

interface ClaudeProviderView extends ProviderViewBase<"claude"> {
  settings: {
    availableCookieSources: readonly string[];
    availablePromptPolicies: readonly string[];
    availableUsageSources: readonly string[];
  };
}

interface CodexProviderView extends ProviderViewBase<"codex"> {
  settings: {
    availableCookieSources: readonly string[];
    availableUsageSources: readonly string[];
  };
}

interface GeminiProviderView extends ProviderViewBase<"gemini"> {
  settings: Record<string, never>;
}

type ProviderView = ClaudeProviderView | CodexProviderView | GeminiProviderView;

const isProviderEnabled = (config: OmarchyAgentBarConfig, providerId: ProviderId): boolean => {
  if (providerId === "claude") {
    return config.providers.claude.enabled;
  }

  if (providerId === "codex") {
    return config.providers.codex.enabled;
  }

  return config.providers.gemini.enabled;
};

const getEnabledProviderIds = (config: OmarchyAgentBarConfig): ProviderId[] => {
  const enabledProviderIds: ProviderId[] = [];

  for (const providerId of config.providerOrder) {
    if (isProviderEnabled(config, providerId)) {
      enabledProviderIds.push(providerId);
    }
  }

  return enabledProviderIds;
};

const getFirstEnabledProviderId = (config: OmarchyAgentBarConfig): ProviderId | null => {
  for (const providerId of config.providerOrder) {
    if (isProviderEnabled(config, providerId)) {
      return providerId;
    }
  }

  return explicitNull;
};

const getProviderView = (config: OmarchyAgentBarConfig, providerId: ProviderId): ProviderView => {
  if (providerId === "claude") {
    return {
      config: config.providers.claude,
      enabled: config.providers.claude.enabled,
      id: "claude",
      selected: config.selectedProvider === "claude",
      settings: {
        availableCookieSources: claudeCookieSources,
        availablePromptPolicies: claudePromptPolicies,
        availableUsageSources: claudeUsageSources,
      },
    };
  }

  if (providerId === "codex") {
    return {
      config: config.providers.codex,
      enabled: config.providers.codex.enabled,
      id: "codex",
      selected: config.selectedProvider === "codex",
      settings: {
        availableCookieSources: codexCookieSources,
        availableUsageSources: codexUsageSources,
      },
    };
  }

  return {
    config: config.providers.gemini,
    enabled: config.providers.gemini.enabled,
    id: "gemini",
    selected: config.selectedProvider === "gemini",
    settings: {},
  };
};

const repairSelectedProvider = (config: OmarchyAgentBarConfig): OmarchyAgentBarConfig => {
  if (isProviderEnabled(config, config.selectedProvider)) {
    return config;
  }

  const firstEnabledProviderId = getFirstEnabledProviderId(config);

  if (firstEnabledProviderId === explicitNull) {
    return config;
  }

  return {
    ...config,
    selectedProvider: firstEnabledProviderId,
  };
};

const createAppStoreState = (config: OmarchyAgentBarConfig): AppStoreState => ({
  config,
  enabledProviderIds: getEnabledProviderIds(config),
  providerViews: config.providerOrder.map((providerId) => getProviderView(config, providerId)),
  selectedProviderId: config.selectedProvider,
});

const createInitialAppStoreState = (): AppStoreState => createAppStoreState(createDefaultConfig());

export {
  createAppStoreState,
  createInitialAppStoreState,
  getEnabledProviderIds,
  getProviderView,
  isProviderEnabled,
  repairSelectedProvider,
  type AppStoreState,
  type ProviderId,
  type ProviderView,
};
