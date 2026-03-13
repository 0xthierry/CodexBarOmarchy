import type { ConfigStore } from "@/core/config/store.ts";
import type { BinaryLocator } from "@/core/detection/binary-locator.ts";
import type { createDefaultProviderEnabledMap } from "@/core/config/schema.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderEnabledMap = ReturnType<typeof createDefaultProviderEnabledMap>;
type ProviderId = OmarchyAgentBarConfig["selectedProvider"];

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

const providerIds: ProviderId[] = ["claude", "codex", "gemini"];

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

const detectProviderEnablement = (detectedBinaries: DetectedBinaryState): ProviderEnabledMap => ({
  claude: detectedBinaries.claude,
  codex: detectedBinaries.codex,
  gemini: detectedBinaries.gemini,
});

const detectProviderConfiguration = (binaryLocator: BinaryLocator): ProviderDetectionResult => {
  const detectedBinaries = detectProviderBinaries(binaryLocator);

  return {
    detectedBinaries,
    enabledProviders: detectProviderEnablement(detectedBinaries),
  };
};

const applyProviderDetection = (
  config: OmarchyAgentBarConfig,
  enabledProviders: ProviderEnabledMap,
  detectedBinaries: DetectedBinaryState,
): OmarchyAgentBarConfig => ({
  ...config,
  detectedBinaries: {
    claude: detectedBinaries.claude,
    codex: detectedBinaries.codex,
    gemini: detectedBinaries.gemini,
  },
  providers: {
    ...config.providers,
    claude: {
      ...config.providers.claude,
      availabilityMode: "auto",
      enabled: enabledProviders.claude,
    },
    codex: {
      ...config.providers.codex,
      availabilityMode: "auto",
      enabled: enabledProviders.codex,
    },
    gemini: {
      ...config.providers.gemini,
      availabilityMode: "auto",
      enabled: enabledProviders.gemini,
    },
  },
});

const hasMatchingDetectedBinaries = (
  currentValue: ProviderEnabledMap | null,
  nextValue: DetectedBinaryState,
): boolean =>
  currentValue !== null &&
  currentValue.claude === nextValue.claude &&
  currentValue.codex === nextValue.codex &&
  currentValue.gemini === nextValue.gemini;

const mergeDetectedProviderAvailability = (
  config: OmarchyAgentBarConfig,
  detectedBinaries: DetectedBinaryState,
): OmarchyAgentBarConfig => {
  const previousDetectedBinaries = config.detectedBinaries;

  let nextConfig: OmarchyAgentBarConfig = {
    ...config,
    detectedBinaries: {
      claude: detectedBinaries.claude,
      codex: detectedBinaries.codex,
      gemini: detectedBinaries.gemini,
    },
  };

  for (const providerId of providerIds) {
    const wasInstalled = previousDetectedBinaries?.[providerId] ?? false;
    const isInstalledNow = detectedBinaries[providerId];

    if (
      nextConfig.providers[providerId].availabilityMode === "auto" &&
      wasInstalled !== isInstalledNow
    ) {
      nextConfig = {
        ...nextConfig,
        providers: {
          ...nextConfig.providers,
          [providerId]: {
            ...nextConfig.providers[providerId],
            enabled: isInstalledNow,
          },
        },
      };
    }
  }

  return repairSelectedProvider(nextConfig);
};

const initializeConfigWithDetection = async (
  options: InitializeDetectionOptions,
): Promise<DetectionInitializationResult> => {
  const existingConfig = await options.configStore.load();
  const detectionResult = detectProviderConfiguration(options.binaryLocator);

  if (existingConfig === null || options.forceRedetection === true) {
    const baseConfig = existingConfig ?? createDefaultConfig();
    const detectedConfig = repairSelectedProvider(
      applyProviderDetection(
        baseConfig,
        detectionResult.enabledProviders,
        detectionResult.detectedBinaries,
      ),
    );
    const savedConfig = await options.configStore.save(detectedConfig);

    return {
      config: savedConfig,
      created: existingConfig === null,
      detectionRun: true,
    };
  }

  const mergedConfig = mergeDetectedProviderAvailability(
    existingConfig,
    detectionResult.detectedBinaries,
  );

  if (
    hasMatchingDetectedBinaries(existingConfig.detectedBinaries, detectionResult.detectedBinaries)
  ) {
    return {
      config: existingConfig,
      created: false,
      detectionRun: false,
    };
  }

  const savedConfig = await options.configStore.save(mergedConfig);

  return {
    config: savedConfig,
    created: false,
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
