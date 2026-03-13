import * as dbus from "dbus-next";
import {
  trayIconName,
  trayIconThemePath,
  trayItemInterfaceName,
  trayNoMenuObjectPath,
  trayWatcherBusName,
  trayWatcherInterfaceName,
  trayWatcherObjectPath,
} from "@/tray/constants.ts";

const { ACCESS_READ, Interface } = dbus.interface;

interface StatusNotifierCallbacks {
  onActivate: () => void;
}

interface WatcherRegistrationBus {
  call: (message: dbus.Message) => Promise<unknown>;
}

class StatusNotifierItemInterface extends Interface {
  AttentionAccessibleDesc = "";
  AttentionIconName = "";
  Category = "ApplicationStatus";
  IconAccessibleDesc = "agent-stats tray";
  IconName = trayIconName;
  IconThemePath = trayIconThemePath;
  Id = "agent-stats";
  ItemIsMenu = false;
  Menu = trayNoMenuObjectPath;
  Status = "Active";
  Title = "agent-stats";
  WindowId = 0;

  readonly #callbacks: StatusNotifierCallbacks;

  constructor(callbacks: StatusNotifierCallbacks) {
    super(trayItemInterfaceName);
    this.#callbacks = callbacks;
  }

  Activate(_x: number, _y: number): void {
    this.#callbacks.onActivate();
  }

  ContextMenu(_x: number, _y: number): void {}

  Scroll(_delta: number, _orientation: string): void {}

  SecondaryActivate(_x: number, _y: number): void {
    this.#callbacks.onActivate();
  }
}

StatusNotifierItemInterface.configureMembers({
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
    ItemIsMenu: {
      access: ACCESS_READ,
      signature: "b",
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
      signature: "i",
    },
  },
});

const createStatusNotifierItem = (
  callbacks: StatusNotifierCallbacks,
): StatusNotifierItemInterface => new StatusNotifierItemInterface(callbacks);

const registerStatusNotifierItem = async (
  bus: WatcherRegistrationBus,
  serviceName: string,
): Promise<void> => {
  await bus.call(
    new dbus.Message({
      body: [serviceName],
      destination: trayWatcherBusName,
      interface: trayWatcherInterfaceName,
      member: "RegisterStatusNotifierItem",
      path: trayWatcherObjectPath,
      signature: "s",
    }),
  );
};

export { createStatusNotifierItem, registerStatusNotifierItem, StatusNotifierItemInterface };
