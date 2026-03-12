import { fileURLToPath } from "node:url";

const trayTuiAppId = "org.omarchy.agent-stats";
const trayBusName = "org.omarchy.AgentStatsTray";
const trayItemObjectPath = "/StatusNotifierItem";
const trayItemInterfaceName = "org.kde.StatusNotifierItem";
const trayWatcherBusName = "org.kde.StatusNotifierWatcher";
const trayWatcherInterfaceName = "org.kde.StatusNotifierWatcher";
const trayWatcherObjectPath = "/StatusNotifierWatcher";
const trayNoMenuObjectPath = "/NO_DBUSMENU";
const trayIconPath = fileURLToPath(
  new URL("../../assets/tray/agent-stats-tray.svg", import.meta.url),
);

export {
  trayBusName,
  trayIconPath,
  trayItemInterfaceName,
  trayItemObjectPath,
  trayNoMenuObjectPath,
  trayTuiAppId,
  trayWatcherBusName,
  trayWatcherInterfaceName,
  trayWatcherObjectPath,
};
