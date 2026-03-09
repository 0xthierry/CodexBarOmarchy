import { createDefaultConfig } from "@/core/config/schema.ts";
import {
  claudeCookieSources,
  claudePromptPolicies,
  claudeUsageSources,
} from "@/core/providers/claude.ts";
import { codexCookieSources, codexUsageSources } from "@/core/providers/codex.ts";
import type { ProviderId } from "@/core/providers/provider-id.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import type {
  ProviderActionViewMap,
  ProviderRuntimeSnapshot,
  ProviderRuntimeStateMap,
} from "@/core/store/runtime-state.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;

interface SchedulerState {
  active: boolean;
  intervalMs: number | null;
}

interface AppStoreState {
  config: OmarchyAgentBarConfig;
  enabledProviderIds: ProviderId[];
  providerViews: ProviderView[];
  scheduler: SchedulerState;
  selectedProviderId: ProviderId;
}

interface ProviderViewBase<ProviderValue extends ProviderId> {
  actions: ProviderActionViewMap;
  config: OmarchyAgentBarConfig["providers"][ProviderValue];
  enabled: boolean;
  id: ProviderValue;
  selected: boolean;
  status: ProviderRuntimeSnapshot;
}

interface ClaudeProviderView extends ProviderViewBase<"claude"> {
  settings: {
    activeTokenAccountIndex: number;
    availableCookieSources: readonly string[];
    availablePromptPolicies: readonly string[];
    availableUsageSources: readonly string[];
    showPromptPolicyControl: boolean;
    tokenAccounts: OmarchyAgentBarConfig["providers"]["claude"]["tokenAccounts"];
  };
}

interface CodexProviderView extends ProviderViewBase<"codex"> {
  settings: {
    availableCookieSources: readonly string[];
    availableUsageSources: readonly string[];
    showCookieSourceControl: boolean;
    showManualCookieField: boolean;
  };
}

interface GeminiProviderView extends ProviderViewBase<"gemini"> {
  settings: Record<string, never>;
}

type ProviderView = ClaudeProviderView | CodexProviderView | GeminiProviderView;

const defaultSchedulerState: SchedulerState = {
  active: false,
  intervalMs: explicitNull,
};

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

const createClaudeProviderView = (
  config: OmarchyAgentBarConfig,
  providerRuntimeStates: ProviderRuntimeStateMap,
): ClaudeProviderView => ({
  actions: providerRuntimeStates.claude.actions,
  config: config.providers.claude,
  enabled: config.providers.claude.enabled,
  id: "claude",
  selected: config.selectedProvider === "claude",
  settings: {
    activeTokenAccountIndex: config.providers.claude.activeTokenAccountIndex,
    availableCookieSources: claudeCookieSources,
    availablePromptPolicies: claudePromptPolicies,
    availableUsageSources: claudeUsageSources,
    showPromptPolicyControl: true,
    tokenAccounts: config.providers.claude.tokenAccounts,
  },
  status: providerRuntimeStates.claude.snapshot,
});

const createCodexProviderView = (
  config: OmarchyAgentBarConfig,
  providerRuntimeStates: ProviderRuntimeStateMap,
): CodexProviderView => ({
  actions: providerRuntimeStates.codex.actions,
  config: config.providers.codex,
  enabled: config.providers.codex.enabled,
  id: "codex",
  selected: config.selectedProvider === "codex",
  settings: {
    availableCookieSources: codexCookieSources,
    availableUsageSources: codexUsageSources,
    showCookieSourceControl: config.providers.codex.extrasEnabled,
    showManualCookieField:
      config.providers.codex.extrasEnabled && config.providers.codex.cookieSource === "manual",
  },
  status: providerRuntimeStates.codex.snapshot,
});

const createGeminiProviderView = (
  config: OmarchyAgentBarConfig,
  providerRuntimeStates: ProviderRuntimeStateMap,
): GeminiProviderView => ({
  actions: providerRuntimeStates.gemini.actions,
  config: config.providers.gemini,
  enabled: config.providers.gemini.enabled,
  id: "gemini",
  selected: config.selectedProvider === "gemini",
  settings: {},
  status: providerRuntimeStates.gemini.snapshot,
});

const getProviderView = (
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
  providerRuntimeStates: ProviderRuntimeStateMap = createDefaultProviderRuntimeStateMap(),
): ProviderView => {
  if (providerId === "claude") {
    return createClaudeProviderView(config, providerRuntimeStates);
  }

  if (providerId === "codex") {
    return createCodexProviderView(config, providerRuntimeStates);
  }

  return createGeminiProviderView(config, providerRuntimeStates);
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

const createAppStoreState = (
  config: OmarchyAgentBarConfig,
  providerRuntimeStates: ProviderRuntimeStateMap = createDefaultProviderRuntimeStateMap(),
  scheduler: SchedulerState = defaultSchedulerState,
): AppStoreState => ({
  config,
  enabledProviderIds: getEnabledProviderIds(config),
  providerViews: config.providerOrder.map((providerId) =>
    getProviderView(config, providerId, providerRuntimeStates),
  ),
  scheduler,
  selectedProviderId: config.selectedProvider,
});

const createInitialAppStoreState = (): AppStoreState => createAppStoreState(createDefaultConfig());

export {
  createAppStoreState,
  createInitialAppStoreState,
  defaultSchedulerState,
  getEnabledProviderIds,
  getProviderView,
  isProviderEnabled,
  repairSelectedProvider,
  type AppStoreState,
  type ProviderId,
  type ProviderView,
  type SchedulerState,
};
