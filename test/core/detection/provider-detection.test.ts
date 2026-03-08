import {
  createInMemoryConfigStore,
  createTestBinaryLocator,
  failedSaveMessage,
} from "./test-support.ts";
import {
  detectProviderEnablement,
  initializeConfigWithDetection,
} from "@/core/detection/provider-detection.ts";
import { expect, test } from "bun:test";
import { createConfigStore } from "@/core/config/store.ts";

const availableBinaryStates = [false, true] as const;

interface DetectionCase {
  detectedBinaries: {
    claude: boolean;
    codex: boolean;
    gemini: boolean;
  };
  enabledProviders: {
    claude: boolean;
    codex: boolean;
    gemini: boolean;
  };
}

const expectedSuccessExitCode = 0;
const tempDirectoryRoot = "/tmp";
const textDecoder = new TextDecoder();

interface FirstRunContext {
  binaryLocator: ReturnType<typeof createTestBinaryLocator>;
  configStore: ReturnType<typeof createConfigStore>;
  firstRunResult: Awaited<ReturnType<typeof initializeConfigWithDetection>>;
}

const createTemporaryDirectory = (prefix: string): string => {
  const commandResult = Bun.spawnSync({
    cmd: ["mktemp", "-d", `${tempDirectoryRoot}/${prefix}.XXXXXX`],
  });

  if (commandResult.exitCode !== expectedSuccessExitCode) {
    throw new Error("Failed to create a temporary directory for the provider detection test.");
  }

  return textDecoder.decode(commandResult.stdout).trim();
};

const createTemporaryConfigPath = (): string => {
  const directoryPath = createTemporaryDirectory("omarchy-agent-bar-provider-detection");

  return `${directoryPath}/config.json`;
};

const createDetectionCase = (
  claudeInstalled: boolean,
  codexInstalled: boolean,
  geminiInstalled: boolean,
): DetectionCase => ({
  detectedBinaries: {
    claude: claudeInstalled,
    codex: codexInstalled,
    gemini: geminiInstalled,
  },
  enabledProviders: {
    claude: claudeInstalled,
    codex: codexInstalled || (!claudeInstalled && !codexInstalled && !geminiInstalled),
    gemini: geminiInstalled,
  },
});

const createDetectionCases = (): DetectionCase[] => {
  const detectionCases: DetectionCase[] = [];

  for (const claudeInstalled of availableBinaryStates) {
    for (const codexInstalled of availableBinaryStates) {
      for (const geminiInstalled of availableBinaryStates) {
        detectionCases.push(createDetectionCase(claudeInstalled, codexInstalled, geminiInstalled));
      }
    }
  }

  return detectionCases;
};

const expectFirstRunState = (
  result: Awaited<ReturnType<typeof initializeConfigWithDetection>>,
): void => {
  expect(result.created).toBe(true);
  expect(result.detectionRun).toBe(true);
  expect(result.config.providers.claude.enabled).toBe(true);
  expect(result.config.providers.codex.enabled).toBe(false);
};

const createFirstRunResult = async (filePath: string): Promise<FirstRunContext> => {
  const binaryLocator = createTestBinaryLocator({
    claude: true,
    codex: false,
    gemini: false,
  });
  const configStore = createConfigStore({ filePath });
  const firstRunResult = await initializeConfigWithDetection({
    binaryLocator,
    configStore,
  });

  return {
    binaryLocator,
    configStore,
    firstRunResult,
  };
};

const enableCodexManually = async (
  filePath: string,
  binaryLocator: ReturnType<typeof createTestBinaryLocator>,
): Promise<void> => {
  const configStore = createConfigStore({ filePath });
  const initializationResult = await initializeConfigWithDetection({
    binaryLocator,
    configStore,
  });

  await configStore.save({
    ...initializationResult.config,
    providers: {
      ...initializationResult.config.providers,
      codex: {
        ...initializationResult.config.providers.codex,
        enabled: true,
      },
    },
  });
};

const expectInitializationFailure = async (
  configStore: ReturnType<typeof createInMemoryConfigStore>,
  binaryLocator: ReturnType<typeof createTestBinaryLocator>,
): Promise<void> => {
  try {
    await initializeConfigWithDetection({
      binaryLocator,
      configStore,
    });
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    expect(error.message).toBe(failedSaveMessage);

    return;
  }

  throw new Error("Expected initialization to fail.");
};

for (const detectionCase of createDetectionCases()) {
  test("derives enabled providers from detected binaries", () => {
    expect(detectProviderEnablement(detectionCase.detectedBinaries)).toEqual(
      detectionCase.enabledProviders,
    );
  });
}

test("runs provider detection only when the config file is first created", async () => {
  const filePath = createTemporaryConfigPath();
  const { binaryLocator, configStore, firstRunResult } = await createFirstRunResult(filePath);

  expectFirstRunState(firstRunResult);
  await enableCodexManually(filePath, binaryLocator);

  const secondRunResult = await initializeConfigWithDetection({
    binaryLocator: createTestBinaryLocator({
      claude: false,
      codex: false,
      gemini: false,
    }),
    configStore,
  });

  expect(secondRunResult.created).toBe(false);
  expect(secondRunResult.detectionRun).toBe(false);
  expect(secondRunResult.config.providers.codex.enabled).toBe(true);
});

test("repairs the selected provider when detection disables the default selection", async () => {
  const configStore = createInMemoryConfigStore();
  const initializationResult = await initializeConfigWithDetection({
    binaryLocator: createTestBinaryLocator({
      claude: false,
      codex: false,
      gemini: true,
    }),
    configStore,
  });

  expect(initializationResult.config.selectedProvider).toBe("gemini");
  expect(initializationResult.config.providers.codex.enabled).toBe(false);
  expect(initializationResult.config.providers.gemini.enabled).toBe(true);
});

test("re-applies provider detection when forced", async () => {
  const filePath = createTemporaryConfigPath();
  const configStore = createConfigStore({ filePath });
  const initialResult = await initializeConfigWithDetection({
    binaryLocator: createTestBinaryLocator({
      claude: false,
      codex: true,
      gemini: false,
    }),
    configStore,
  });

  await configStore.save({
    ...initialResult.config,
    providers: {
      ...initialResult.config.providers,
      claude: {
        ...initialResult.config.providers.claude,
        enabled: true,
      },
    },
  });

  const forcedResult = await initializeConfigWithDetection({
    binaryLocator: createTestBinaryLocator({
      claude: false,
      codex: false,
      gemini: true,
    }),
    configStore,
    forceRedetection: true,
  });

  expect(forcedResult.created).toBe(false);
  expect(forcedResult.detectionRun).toBe(true);
  expect(forcedResult.config.providers.claude.enabled).toBe(false);
  expect(forcedResult.config.providers.codex.enabled).toBe(false);
  expect(forcedResult.config.providers.gemini.enabled).toBe(true);
});

test("retries first-run detection when the initial save fails before any config exists", async () => {
  const configStore = createInMemoryConfigStore({ failFirstSave: true });
  const binaryLocator = createTestBinaryLocator({
    claude: true,
    codex: false,
    gemini: false,
  });

  await expectInitializationFailure(configStore, binaryLocator);
  const retryResult = await initializeConfigWithDetection({
    binaryLocator,
    configStore,
  });

  expect(retryResult.created).toBe(true);
  expect(retryResult.detectionRun).toBe(true);
  expect(retryResult.config.providers.claude.enabled).toBe(true);
  expect(retryResult.config.providers.codex.enabled).toBe(false);
});
