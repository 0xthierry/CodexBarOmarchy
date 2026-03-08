import { createDefaultConfig, createDefaultProviderEnabledMap } from "@/core/config/schema.ts";
import type { BinaryLocator } from "@/core/detection/binary-locator.ts";
import type { ConfigStore } from "@/core/config/store.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderEnabledMap = ReturnType<typeof createDefaultProviderEnabledMap>;

interface DetectedBinaryState {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}

interface DetectionInitializationResult {
  config: OmarchyAgentBarConfig;
  created: boolean;
  detectionRun: boolean;
}

interface InitializeDetectionOptions {
  binaryLocator: BinaryLocator;
  configStore: ConfigStore;
  forceRedetection?: boolean;
}

interface ProviderDetectionResult {
  detectedBinaries: DetectedBinaryState;
  enabledProviders: ProviderEnabledMap;
}

const applyProviderDetection = (
  config: OmarchyAgentBarConfig,
  enabledProviders: ProviderEnabledMap,
): OmarchyAgentBarConfig => ({
  ...config,
  providers: {
    ...config.providers,
    claude: {
      ...config.providers.claude,
      enabled: enabledProviders.claude,
    },
    codex: {
      ...config.providers.codex,
      enabled: enabledProviders.codex,
    },
    gemini: {
      ...config.providers.gemini,
      enabled: enabledProviders.gemini,
    },
  },
});

const isProviderEnabled = (config: OmarchyAgentBarConfig, providerId: ProviderId): boolean => {
  if (providerId === "claude") {
    return config.providers.claude.enabled;
  }

  if (providerId === "codex") {
    return config.providers.codex.enabled;
  }

  return config.providers.gemini.enabled;
};

const repairSelectedProvider = (config: OmarchyAgentBarConfig): OmarchyAgentBarConfig => {
  if (isProviderEnabled(config, config.selectedProvider)) {
    return config;
  }

  for (const providerId of config.providerOrder) {
    if (isProviderEnabled(config, providerId)) {
      return {
        ...config,
        selectedProvider: providerId,
      };
    }
  }

  return config;
};

const detectProviderBinaries = (binaryLocator: BinaryLocator): DetectedBinaryState => ({
  claude: binaryLocator.isInstalled("claude"),
  codex: binaryLocator.isInstalled("codex"),
  gemini: binaryLocator.isInstalled("gemini"),
});

const detectProviderEnablement = (detectedBinaries: DetectedBinaryState): ProviderEnabledMap => {
  const enabledProviders = createDefaultProviderEnabledMap(false);
  const noInstalledBinaries =
    !detectedBinaries.claude && !detectedBinaries.codex && !detectedBinaries.gemini;

  enabledProviders.claude = detectedBinaries.claude;
  enabledProviders.codex = detectedBinaries.codex || noInstalledBinaries;
  enabledProviders.gemini = detectedBinaries.gemini;

  return enabledProviders;
};

const detectProviderConfiguration = (binaryLocator: BinaryLocator): ProviderDetectionResult => {
  const detectedBinaries = detectProviderBinaries(binaryLocator);

  return {
    detectedBinaries,
    enabledProviders: detectProviderEnablement(detectedBinaries),
  };
};

type ProviderId = OmarchyAgentBarConfig["selectedProvider"];

const initializeConfigWithDetection = async (
  options: InitializeDetectionOptions,
): Promise<DetectionInitializationResult> => {
  const existingConfig = await options.configStore.load();

  if (existingConfig !== null && options.forceRedetection !== true) {
    return {
      config: existingConfig,
      created: false,
      detectionRun: false,
    };
  }

  const baseConfig = existingConfig ?? createDefaultConfig();
  const detectionResult = detectProviderConfiguration(options.binaryLocator);
  const detectedConfig = repairSelectedProvider(
    applyProviderDetection(baseConfig, detectionResult.enabledProviders),
  );
  const savedConfig = await options.configStore.save(detectedConfig);

  return {
    config: savedConfig,
    created: existingConfig === null,
    detectionRun: true,
  };
};

export {
  applyProviderDetection,
  detectProviderBinaries,
  detectProviderConfiguration,
  detectProviderEnablement,
  initializeConfigWithDetection,
  type DetectedBinaryState,
  type DetectionInitializationResult,
  type InitializeDetectionOptions,
  type ProviderDetectionResult,
};
