import { normalizeConfig } from "@/core/config/schema.ts";
import { normalizeProviderOrder } from "@/core/providers/provider-order.ts";
import { repairSelectedProvider } from "@/core/store/state.ts";

type OmarchyAgentBarConfig = ReturnType<typeof normalizeConfig>;
type ProviderId = "claude" | "codex" | "gemini";

const finalizeConfig = (config: OmarchyAgentBarConfig): OmarchyAgentBarConfig =>
  repairSelectedProvider(normalizeConfig(config));

const setClaudeConfig = (
  config: OmarchyAgentBarConfig,
  updater: (
    providerConfig: OmarchyAgentBarConfig["providers"]["claude"],
  ) => OmarchyAgentBarConfig["providers"]["claude"],
): OmarchyAgentBarConfig =>
  finalizeConfig({
    ...config,
    providers: {
      ...config.providers,
      claude: updater(config.providers.claude),
    },
  });

const setCodexConfig = (
  config: OmarchyAgentBarConfig,
  updater: (
    providerConfig: OmarchyAgentBarConfig["providers"]["codex"],
  ) => OmarchyAgentBarConfig["providers"]["codex"],
): OmarchyAgentBarConfig =>
  finalizeConfig({
    ...config,
    providers: {
      ...config.providers,
      codex: updater(config.providers.codex),
    },
  });

const setGeminiConfig = (
  config: OmarchyAgentBarConfig,
  updater: (
    providerConfig: OmarchyAgentBarConfig["providers"]["gemini"],
  ) => OmarchyAgentBarConfig["providers"]["gemini"],
): OmarchyAgentBarConfig =>
  finalizeConfig({
    ...config,
    providers: {
      ...config.providers,
      gemini: updater(config.providers.gemini),
    },
  });

const setProviderEnabled = (
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
  enabled: boolean,
): OmarchyAgentBarConfig => {
  if (providerId === "claude") {
    return setClaudeConfig(config, (providerConfig) => ({
      ...providerConfig,
      availabilityMode: "manual",
      enabled,
    }));
  }

  if (providerId === "codex") {
    return setCodexConfig(config, (providerConfig) => ({
      ...providerConfig,
      availabilityMode: "manual",
      enabled,
    }));
  }

  return setGeminiConfig(config, (providerConfig) => ({
    ...providerConfig,
    availabilityMode: "manual",
    enabled,
  }));
};

const setProviderOrder = (
  config: OmarchyAgentBarConfig,
  providerOrder: ProviderId[],
): OmarchyAgentBarConfig =>
  finalizeConfig({
    ...config,
    providerOrder: normalizeProviderOrder(providerOrder),
  });

const setSelectedProvider = (
  config: OmarchyAgentBarConfig,
  providerId: ProviderId,
): OmarchyAgentBarConfig =>
  finalizeConfig({
    ...config,
    selectedProvider: providerId,
  });

export {
  finalizeConfig,
  setClaudeConfig,
  setCodexConfig,
  setGeminiConfig,
  setProviderEnabled,
  setProviderOrder,
  setSelectedProvider,
};
