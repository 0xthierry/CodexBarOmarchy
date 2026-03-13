import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface TrayIdentity {
  trayBusName: string;
  trayTuiAppId: string;
}

const trayTuiAppIdBase = "org.omarchy.agent-stats";
const trayBusNameBase = "org.omarchy.AgentStatsTray";
const trayItemObjectPath = "/StatusNotifierItem";
const trayItemInterfaceName = "org.kde.StatusNotifierItem";
const trayWatcherBusName = "org.kde.StatusNotifierWatcher";
const trayWatcherInterfaceName = "org.kde.StatusNotifierWatcher";
const trayWatcherObjectPath = "/StatusNotifierWatcher";
const trayNoMenuObjectPath = "/NO_DBUSMENU";
const trayIconName = "agent-stats-tray";
const trayIdentitySuffixEnvVar = "OMARCHY_AGENT_BAR_ID_SUFFIX";

const createTrayAssetDirectoryCandidates = (moduleUrl = import.meta.url): string[] => [
  fileURLToPath(new URL("../../assets/tray", moduleUrl)),
  join(dirname(process.execPath), "assets", "tray"),
  join(process.cwd(), "assets", "tray"),
];

const resolveTrayIconThemePath = (moduleUrl = import.meta.url): string => {
  for (const directoryPath of createTrayAssetDirectoryCandidates(moduleUrl)) {
    if (existsSync(join(directoryPath, `${trayIconName}.svg`))) {
      return directoryPath;
    }
  }

  return fileURLToPath(new URL("../../assets/tray", moduleUrl));
};

const normalizeTrayIdentitySuffix = (value?: string): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "" ? null : normalizedValue;
};

const buildTrayIdentity = (suffix: string | null): TrayIdentity => {
  if (suffix === null) {
    return {
      trayBusName: trayBusNameBase,
      trayTuiAppId: trayTuiAppIdBase,
    };
  }

  return {
    trayBusName: `${trayBusNameBase}.${suffix}`,
    trayTuiAppId: `${trayTuiAppIdBase}.${suffix}`,
  };
};

const trayIdentity = buildTrayIdentity(
  normalizeTrayIdentitySuffix(process.env[trayIdentitySuffixEnvVar]),
);
const { trayBusName, trayTuiAppId } = trayIdentity;
const trayIconThemePath = resolveTrayIconThemePath();

export {
  buildTrayIdentity,
  createTrayAssetDirectoryCandidates,
  normalizeTrayIdentitySuffix,
  trayBusName,
  resolveTrayIconThemePath,
  trayIconName,
  trayIconThemePath,
  trayIdentitySuffixEnvVar,
  trayItemInterfaceName,
  trayItemObjectPath,
  trayNoMenuObjectPath,
  trayTuiAppId,
  trayWatcherBusName,
  trayWatcherInterfaceName,
  trayWatcherObjectPath,
  trayTuiAppIdBase,
};
