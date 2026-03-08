import { defaultProviderOrder } from "@/core/providers/provider-order.ts";

const configVersionValue = 1;
const defaultConfigDirectoryName = "omarchy-agent-bar";
const defaultConfigFileName = "config.json";
const defaultConfigFileMode = 0o600;
const defaultConfigDirectorySegments = [".config", defaultConfigDirectoryName] as const;
const defaultProviderOrderSnapshot = [...defaultProviderOrder];
const defaultSelectedProvider = "codex" as const;
const jsonIndentWidth = 2;
const rootPathStartIndex = 0;
const pathSeparator = "/";

const configVersion = configVersionValue;

const stripTrailingPathSeparator = (value: string): string => {
  if (value.endsWith(pathSeparator)) {
    return value.slice(rootPathStartIndex, -pathSeparator.length);
  }

  return value;
};

const getDefaultHomeDirectory = (): string => {
  const configuredHomeDirectory = Bun.env["HOME"];

  if (typeof configuredHomeDirectory === "string" && configuredHomeDirectory !== "") {
    return stripTrailingPathSeparator(configuredHomeDirectory);
  }

  throw new Error("HOME is required to resolve the default config path.");
};

const resolveDefaultConfigPath = (homeDirectory: string = getDefaultHomeDirectory()): string => {
  const directoryPath = [
    stripTrailingPathSeparator(homeDirectory),
    ...defaultConfigDirectorySegments,
  ].join(pathSeparator);

  return `${directoryPath}${pathSeparator}${defaultConfigFileName}`;
};

export {
  configVersion,
  defaultConfigDirectoryName,
  defaultConfigFileMode,
  defaultConfigDirectorySegments,
  defaultConfigFileName,
  defaultProviderOrderSnapshot,
  defaultSelectedProvider,
  jsonIndentWidth,
  resolveDefaultConfigPath,
};
