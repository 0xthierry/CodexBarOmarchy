import { describe, expect, test } from "bun:test";
import { createConfigStore } from "@/core/config/store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";

const expectedSuccessExitCode = 0;
const fileModeString = "600";
const tempDirectoryRoot = "/tmp";
const textDecoder = new TextDecoder();

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

describe("config store", () => {
  test("creates and loads the default config", async () => {
    const filePath = createTemporaryConfigPath();
    const configStore = createConfigStore({ filePath });
    const loadResult = await configStore.loadOrCreateDefault();
    const serializedConfig = await Bun.file(filePath).text();

    expect(loadResult.created).toBe(true);
    expect(loadResult.config).toEqual(createDefaultConfig());
    expect(serializedConfig.endsWith("\n")).toBe(true);
    expect(await configStore.load()).toEqual(createDefaultConfig());
  });

  test("normalizes config before saving it", async () => {
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

  test("writes the config file with owner-only permissions", async () => {
    const filePath = createTemporaryConfigPath();
    const configStore = createConfigStore({ filePath });

    await configStore.save(createDefaultConfig());

    expect(readFileMode(filePath)).toBe(fileModeString);
  });
});
