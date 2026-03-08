import {
  detectProviderEnablement,
  initializeConfigWithDetection,
} from "@/core/detection/provider-detection.ts";
import { expect, test } from "bun:test";
import { createConfigStore } from "@/core/config/store.ts";

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const detectionCases: {
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
}[] = [
  {
    detectedBinaries: {
      claude: false,
      codex: false,
      gemini: false,
    },
    enabledProviders: {
      claude: false,
      codex: true,
      gemini: false,
    },
  },
  {
    detectedBinaries: {
      claude: false,
      codex: true,
      gemini: false,
    },
    enabledProviders: {
      claude: false,
      codex: true,
      gemini: false,
    },
  },
  {
    detectedBinaries: {
      claude: true,
      codex: false,
      gemini: true,
    },
    enabledProviders: {
      claude: true,
      codex: false,
      gemini: true,
    },
  },
];

const expectedSuccessExitCode = 0;
const tempDirectoryRoot = "/tmp";
const textDecoder = new TextDecoder();

interface TestBinaryLocator {
  findBinary: (binaryName: "claude" | "codex" | "gemini") => string | null;
  isInstalled: (binaryName: "claude" | "codex" | "gemini") => boolean;
}

interface FirstRunContext {
  binaryLocator: TestBinaryLocator;
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

const createTestBinaryLocator = (installedBinaries: {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}): TestBinaryLocator => ({
  findBinary: (binaryName: "claude" | "codex" | "gemini"): string | null => {
    if (installedBinaries[binaryName]) {
      return `/usr/bin/${binaryName}`;
    }

    return explicitNull;
  },
  isInstalled: (binaryName: "claude" | "codex" | "gemini"): boolean =>
    installedBinaries[binaryName],
});

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
  binaryLocator: TestBinaryLocator,
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

for (const detectionCase of detectionCases) {
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
