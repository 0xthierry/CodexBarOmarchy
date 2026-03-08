import { defaultProviderOrder } from "@/core/providers/provider-order.ts";

const configVersionValue = 1;
const defaultConfigDirectoryName = "omarchy-agent-bar";
const defaultConfigFileName = "config.json";
const defaultConfigDirectorySegments = [".config", defaultConfigDirectoryName] as const;
const defaultProviderOrderSnapshot = [...defaultProviderOrder];
const defaultSelectedProvider = "codex" as const;

const configVersion = configVersionValue;

export {
  configVersion,
  defaultConfigDirectoryName,
  defaultConfigDirectorySegments,
  defaultConfigFileName,
  defaultProviderOrderSnapshot,
  defaultSelectedProvider,
};
