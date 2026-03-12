import { expect, test } from "bun:test";
import { createConfigStore } from "@/core/config/store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";

const expectedSuccessExitCode = 0;
const fileMode = 0o600;
const fileModeString = "600";
const tempDirectoryRoot = "/tmp";
const textDecoder = new TextDecoder();

interface RecordingFileSystem {
  chmod: (path: string, mode: number) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  recordedWriteMode: number;
  rename: (from: string, to: string) => Promise<void>;
  rm: (path: string) => Promise<void>;
  writeFile: (path: string, contents: string, mode: number) => Promise<void>;
}

const createTemporaryDirectory = (prefix: string): string => {
  const commandResult = Bun.spawnSync({
    cmd: ["mktemp", "-d", `${tempDirectoryRoot}/${prefix}.XXXXXX`],
  });

  if (commandResult.exitCode !== expectedSuccessExitCode) {
    throw new Error("Failed to create a temporary directory for the config store test.");
  }

  return textDecoder.decode(commandResult.stdout).trim();
};

const createTemporaryConfigPath = (): string => {
  const directoryPath = createTemporaryDirectory("omarchy-agent-bar-config-store");

  return `${directoryPath}/config.json`;
};

const readFileMode = (filePath: string): string => {
  const commandResult = Bun.spawnSync({
    cmd: ["stat", "-c", "%a", filePath],
  });

  if (commandResult.exitCode !== expectedSuccessExitCode) {
    throw new Error("Failed to read file permissions for the config store test.");
  }

  return textDecoder.decode(commandResult.stdout).trim();
};

const createRecordingFileSystem = (): RecordingFileSystem => {
  const fileSystem: RecordingFileSystem = {
    chmod: async (): Promise<void> => {
      await Promise.resolve();
    },
    mkdir: async (): Promise<void> => {
      await Promise.resolve();
    },
    readFile: async (): Promise<string> => {
      await Promise.resolve();
      throw Object.assign(new Error("Missing test file."), { code: "ENOENT" });
    },
    recordedWriteMode: 0,
    rename: async (): Promise<void> => {
      await Promise.resolve();
    },
    rm: async (): Promise<void> => {
      await Promise.resolve();
    },
    writeFile: async (_path: string, _contents: string, mode: number): Promise<void> => {
      fileSystem.recordedWriteMode = mode;
      await Promise.resolve();
    },
  };

  return fileSystem;
};

test("config store creates and loads the default config", async () => {
  const filePath = createTemporaryConfigPath();
  const configStore = createConfigStore({ filePath });
  const loadResult = await configStore.loadOrCreateDefault();
  const serializedConfig = await Bun.file(filePath).text();

  expect(loadResult.created).toBe(true);
  expect(loadResult.config).toEqual(createDefaultConfig());
  expect(serializedConfig.endsWith("\n")).toBe(true);
  expect(await configStore.load()).toEqual(createDefaultConfig());
});

test("config store normalizes config before saving it", async () => {
  const filePath = createTemporaryConfigPath();
  const configStore = createConfigStore({ filePath });
  const defaultConfig = createDefaultConfig();
  const savedConfig = await configStore.save({
    ...defaultConfig,
    providerOrder: ["gemini", "gemini", "codex"],
    providers: {
      ...defaultConfig.providers,
      claude: {
        ...defaultConfig.providers.claude,
        cookieSource: "manual",
      },
      codex: {
        ...defaultConfig.providers.codex,
        enabled: false,
        source: "oauth",
      },
    },
    selectedProvider: "gemini",
  });

  expect(savedConfig.providerOrder).toEqual(["gemini", "codex", "claude"]);
  expect(savedConfig.providers.claude.cookieSource).toBe("manual");
  expect(savedConfig.providers.codex.enabled).toBe(false);
  expect(savedConfig.selectedProvider).toBe("gemini");
});

test("config store writes the config file with owner-only permissions", async () => {
  const filePath = createTemporaryConfigPath();
  const configStore = createConfigStore({ filePath });

  await configStore.save(createDefaultConfig());

  expect(readFileMode(filePath)).toBe(fileModeString);
});

test("config store creates the temporary file with owner-only permissions from the first write", async () => {
  const fileSystem = createRecordingFileSystem();
  const configStore = createConfigStore({
    filePath: "test-config/recorded-config.json",
    fileSystem,
  });

  await configStore.save(createDefaultConfig());

  expect(fileSystem.recordedWriteMode).toBe(fileMode);
});
