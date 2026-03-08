import { configVersion, defaultSelectedProvider } from "./defaults.ts";
import {
  createDefaultClaudeProviderConfig,
  normalizeClaudeProviderConfig,
} from "@/core/providers/claude.ts";
import {
  createDefaultCodexProviderConfig,
  normalizeCodexProviderConfig,
} from "@/core/providers/codex.ts";
import {
  createDefaultGeminiProviderConfig,
  normalizeGeminiProviderConfig,
} from "@/core/providers/gemini.ts";
import { createProviderMap, isRecord } from "@/core/providers/shared.ts";
import {
  defaultProviderOrder,
  normalizeProviderOrder,
  normalizeSelectedProvider,
} from "@/core/providers/provider-order.ts";

interface ProviderConfigurations {
  claude: ReturnType<typeof createDefaultClaudeProviderConfig>;
  codex: ReturnType<typeof createDefaultCodexProviderConfig>;
  gemini: ReturnType<typeof createDefaultGeminiProviderConfig>;
}

type ProviderId = "claude" | "codex" | "gemini";

interface OmarchyAgentBarConfig {
  providerOrder: ProviderId[];
  providers: ProviderConfigurations;
  selectedProvider: ProviderId;
  version: typeof configVersion;
}

interface ProviderEnabledMap {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}

const createDefaultConfig = (): OmarchyAgentBarConfig => ({
  providerOrder: [...defaultProviderOrder],
  providers: {
    claude: createDefaultClaudeProviderConfig(),
    codex: createDefaultCodexProviderConfig(),
    gemini: createDefaultGeminiProviderConfig(),
  },
  selectedProvider: defaultSelectedProvider,
  version: configVersion,
});

const normalizeProviderConfigurations = (value: unknown): ProviderConfigurations => {
  if (!isRecord(value)) {
    return {
      claude: createDefaultClaudeProviderConfig(),
      codex: createDefaultCodexProviderConfig(),
      gemini: createDefaultGeminiProviderConfig(),
    };
  }

  return {
    claude: normalizeClaudeProviderConfig(value["claude"]),
    codex: normalizeCodexProviderConfig(value["codex"]),
    gemini: normalizeGeminiProviderConfig(value["gemini"]),
  };
};

const normalizeConfig = (value: unknown): OmarchyAgentBarConfig => {
  const defaults = createDefaultConfig();

  if (!isRecord(value)) {
    return defaults;
  }

  const providerOrder = normalizeProviderOrder(value["providerOrder"]);
  const providers = normalizeProviderConfigurations(value["providers"]);

  return {
    providerOrder,
    providers,
    selectedProvider: normalizeSelectedProvider(value["selectedProvider"], providerOrder),
    version: configVersion,
  };
};

const createDefaultProviderEnabledMap = (enabled: boolean): ProviderEnabledMap =>
  createProviderMap(() => enabled);

export {
  createDefaultConfig,
  createDefaultProviderEnabledMap,
  normalizeConfig,
  type OmarchyAgentBarConfig,
  type ProviderEnabledMap,
  type ProviderConfigurations,
};
