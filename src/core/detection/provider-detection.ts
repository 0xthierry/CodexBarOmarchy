import type { BinaryLocator } from "@/core/detection/binary-locator.ts";
import type { ConfigStore } from "@/core/config/store.ts";
import { createDefaultProviderEnabledMap } from "@/core/config/schema.ts";

type OmarchyAgentBarConfig = Awaited<ReturnType<ConfigStore["loadOrCreateDefault"]>>["config"];
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

const initializeConfigWithDetection = async (
  options: InitializeDetectionOptions,
): Promise<DetectionInitializationResult> => {
  const loadResult = await options.configStore.loadOrCreateDefault();

  if (!loadResult.created && options.forceRedetection !== true) {
    return {
      config: loadResult.config,
      created: false,
      detectionRun: false,
    };
  }

  const detectionResult = detectProviderConfiguration(options.binaryLocator);
  const detectedConfig = applyProviderDetection(
    loadResult.config,
    detectionResult.enabledProviders,
  );
  const savedConfig = await options.configStore.save(detectedConfig);

  return {
    config: savedConfig,
    created: loadResult.created,
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
