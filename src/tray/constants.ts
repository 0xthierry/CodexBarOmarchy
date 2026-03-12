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
const trayIconPath = fileURLToPath(
  new URL("../../assets/tray/agent-stats-tray.svg", import.meta.url),
);
const trayIdentitySuffixEnvVar = "OMARCHY_AGENT_BAR_ID_SUFFIX";

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

export {
  buildTrayIdentity,
  normalizeTrayIdentitySuffix,
  trayBusName,
  trayIconPath,
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
