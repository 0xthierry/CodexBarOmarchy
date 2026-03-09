import {
  chmod as chmodFile,
  mkdir as createDirectory,
  readFile as readTextFile,
  rm as removeFile,
  rename as renameFile,
  writeFile as writeTextFile,
} from "node:fs/promises";
import {
  defaultConfigFileMode,
  jsonIndentWidth,
  resolveDefaultConfigPath,
} from "@/core/config/defaults.ts";
import { createDefaultConfig, normalizeConfig } from "@/core/config/schema.ts";
import { explicitNull } from "@/core/providers/shared.ts";

interface ConfigStore {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<OmarchyAgentBarConfig | null>;
  loadOrCreateDefault: () => Promise<ConfigStoreLoadResult>;
  save: (config: OmarchyAgentBarConfig) => Promise<OmarchyAgentBarConfig>;
}

interface ConfigStoreFileSystem {
  chmod: (path: string, mode: number) => Promise<void>;
  mkdir: (path: string) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  rename: (from: string, to: string) => Promise<void>;
  rm: (path: string) => Promise<void>;
  writeFile: (path: string, contents: string, mode: number) => Promise<void>;
}

interface ConfigStoreLoadResult {
  config: OmarchyAgentBarConfig;
  created: boolean;
}

interface CreateConfigStoreOptions {
  filePath?: string;
  fileSystem?: ConfigStoreFileSystem;
}

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;

interface FilePathContext {
  filePath: string;
  fileSystem: ConfigStoreFileSystem;
}

const decimalBase = 10;
const missingPathIndex = -1;
const rootPathStartIndex = 0;

const createTemporaryFileName = (): string => {
  const processId = process.pid.toString(decimalBase);
  const timestamp = Date.now().toString(decimalBase);

  return `.config.${processId}.${timestamp}.tmp`;
};

const getDirectoryPath = (filePath: string): string => {
  const lastSlashIndex = filePath.lastIndexOf("/");

  if (lastSlashIndex === missingPathIndex) {
    return ".";
  }

  return filePath.slice(rootPathStartIndex, lastSlashIndex);
};

const isMissingFileError = (error: unknown): boolean => {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === "ENOENT";
};

const serializeConfig = (config: OmarchyAgentBarConfig): string =>
  `${JSON.stringify(config, explicitNull, jsonIndentWidth)}\n`;

const createDeleteIfPresent = (context: FilePathContext) => async (): Promise<void> => {
  await context.fileSystem.rm(context.filePath);
};

const createLoad =
  (context: FilePathContext) => async (): Promise<OmarchyAgentBarConfig | null> => {
    try {
      const serializedConfig = await context.fileSystem.readFile(context.filePath);
      const parsedConfig: unknown = JSON.parse(serializedConfig);

      return normalizeConfig(parsedConfig);
    } catch (error) {
      if (isMissingFileError(error)) {
        return explicitNull;
      }

      throw error;
    }
  };

const createSave =
  (context: FilePathContext) =>
  async (config: OmarchyAgentBarConfig): Promise<OmarchyAgentBarConfig> => {
    const normalizedConfig = normalizeConfig(config);
    const configDirectoryPath = getDirectoryPath(context.filePath);
    const serializedConfig = serializeConfig(normalizedConfig);
    const temporaryFilePath = `${configDirectoryPath}/${createTemporaryFileName()}`;

    await context.fileSystem.mkdir(configDirectoryPath);
    await context.fileSystem.writeFile(temporaryFilePath, serializedConfig, defaultConfigFileMode);
    await context.fileSystem.rename(temporaryFilePath, context.filePath);
    await context.fileSystem.chmod(context.filePath, defaultConfigFileMode);

    return normalizedConfig;
  };

const createLoadOrCreateDefault = (context: FilePathContext) => {
  const load = createLoad(context);
  const save = createSave(context);

  return async (): Promise<ConfigStoreLoadResult> => {
    const existingConfig = await load();

    if (existingConfig !== null) {
      return {
        config: existingConfig,
        created: false,
      };
    }

    const defaultConfig = createDefaultConfig();
    const savedConfig = await save(defaultConfig);

    return {
      config: savedConfig,
      created: true,
    };
  };
};

const defaultFileSystem: ConfigStoreFileSystem = {
  chmod: async (path: string, mode: number): Promise<void> => {
    await chmodFile(path, mode);
  },
  mkdir: async (path: string): Promise<void> => {
    await createDirectory(path, { recursive: true });
  },
  readFile: async (path: string): Promise<string> => {
    const fileContents = await readTextFile(path, "utf8");

    return fileContents;
  },
  rename: async (from: string, to: string): Promise<void> => {
    await renameFile(from, to);
  },
  rm: async (path: string): Promise<void> => {
    await removeFile(path, { force: true });
  },
  writeFile: async (path: string, contents: string, mode: number): Promise<void> => {
    await writeTextFile(path, contents, {
      encoding: "utf8",
      mode,
    });
    await chmodFile(path, mode);
  },
};

const createConfigStore = (options: CreateConfigStoreOptions = {}): ConfigStore => {
  const filePath = options.filePath ?? resolveDefaultConfigPath();
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const filePathContext = {
    filePath,
    fileSystem,
  };

  return {
    deleteIfPresent: createDeleteIfPresent(filePathContext),
    filePath,
    load: createLoad(filePathContext),
    loadOrCreateDefault: createLoadOrCreateDefault(filePathContext),
    save: createSave(filePathContext),
  };
};

export {
  createConfigStore,
  type ConfigStore,
  type ConfigStoreFileSystem,
  type ConfigStoreLoadResult,
  type CreateConfigStoreOptions,
};
