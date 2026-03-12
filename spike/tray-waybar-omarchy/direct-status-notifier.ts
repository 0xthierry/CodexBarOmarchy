import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import * as dbus from "dbus-next";

const currentFilePath = process.argv[1] ?? "spike/tray-waybar-omarchy/direct-status-notifier.ts";
const spikeDirectoryPath = dirname(resolve(currentFilePath));
const launcherPath = `${spikeDirectoryPath}/launch-or-focus-agent-stats.sh`;
const iconPath = `${spikeDirectoryPath}/agent-stats-tray.svg`;
const busName = "org.omarchy.AgentStatsTraySpikeTs";
const itemObjectPath = "/StatusNotifierItem";
const watcherBusName = "org.kde.StatusNotifierWatcher";
const watcherObjectPath = "/StatusNotifierWatcher";
const watcherInterfaceName = "org.kde.StatusNotifierWatcher";
const itemInterfaceName = "org.kde.StatusNotifierItem";
const noMenuObjectPath = "/NO_DBUSMENU";

const { Interface, ACCESS_READ } = dbus.interface;

const runLauncher = (): void => {
  const child = spawn(launcherPath, [], {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
};

class StatusNotifierItemInterface extends Interface {
  Id = "agent-stats-spike-ts";
  Category = "ApplicationStatus";
  Status = "Active";
  IconName = iconPath;
  IconAccessibleDesc = "agent-stats tray spike";
  AttentionIconName = "";
  AttentionAccessibleDesc = "";
  Title = "agent-stats";
  IconThemePath = "";
  Menu = noMenuObjectPath;
  WindowId = 0;

  constructor() {
    super(itemInterfaceName);
  }

  Activate(_x: number, _y: number): void {
    runLauncher();
  }

  ContextMenu(_x: number, _y: number): void {}

  SecondaryActivate(_x: number, _y: number): void {
    runLauncher();
  }

  Scroll(_delta: number, _orientation: string): void {}
}

(StatusNotifierItemInterface as typeof Interface).configureMembers({
  methods: {
    Activate: {
      inSignature: "ii",
      outSignature: "",
    },
    ContextMenu: {
      inSignature: "ii",
      outSignature: "",
    },
    Scroll: {
      inSignature: "is",
      outSignature: "",
    },
    SecondaryActivate: {
      inSignature: "ii",
      outSignature: "",
    },
  },
  properties: {
    AttentionAccessibleDesc: {
      access: ACCESS_READ,
      signature: "s",
    },
    AttentionIconName: {
      access: ACCESS_READ,
      signature: "s",
    },
    Category: {
      access: ACCESS_READ,
      signature: "s",
    },
    IconAccessibleDesc: {
      access: ACCESS_READ,
      signature: "s",
    },
    IconName: {
      access: ACCESS_READ,
      signature: "s",
    },
    IconThemePath: {
      access: ACCESS_READ,
      signature: "s",
    },
    Id: {
      access: ACCESS_READ,
      signature: "s",
    },
    Menu: {
      access: ACCESS_READ,
      signature: "o",
    },
    Status: {
      access: ACCESS_READ,
      signature: "s",
    },
    Title: {
      access: ACCESS_READ,
      signature: "s",
    },
    WindowId: {
      access: ACCESS_READ,
      signature: "u",
    },
  },
});

const registerStatusNotifierItem = async (
  bus: dbus.MessageBus,
  serviceName: string,
): Promise<void> => {
  const message = new dbus.Message({
    body: [serviceName],
    destination: watcherBusName,
    interface: watcherInterfaceName,
    member: "RegisterStatusNotifierItem",
    path: watcherObjectPath,
    signature: "s",
  });

  await bus.call(message);
};

const main = async (): Promise<void> => {
  const bus = dbus.sessionBus();
  bus.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
  });

  await bus.requestName(busName, 0);

  const item = new StatusNotifierItemInterface();
  bus.export(itemObjectPath, item);
  await registerStatusNotifierItem(bus, busName);

  process.on("SIGINT", () => {
    bus.disconnect();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    bus.disconnect();
    process.exit(0);
  });

  await new Promise<void>(() => {});
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
