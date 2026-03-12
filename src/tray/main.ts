import { spawn } from "node:child_process";
import * as dbus from "dbus-next";
import type { RuntimeCommandResult } from "@/runtime/host.ts";
import { createRuntimeHost } from "@/runtime/node-host.ts";
import { trayBusName, trayItemObjectPath } from "@/tray/constants.ts";
import { activateTrayTui } from '@/tray/launcher.ts';
import type { TrayLauncherHost } from '@/tray/launcher.ts';
import { createStatusNotifierItem, registerStatusNotifierItem } from "@/tray/status-notifier.ts";

interface TrayMessageBus {
  call: (message: dbus.Message) => Promise<unknown>;
  disconnect: () => void;
  export: (path: string, value: dbus.interface.Interface) => void;
  on: (event: "error", listener: (error: unknown) => void) => void;
  requestName: (name: string, flags: number) => Promise<unknown>;
}

interface TrayService {
  bus: TrayMessageBus;
  stop: () => void;
}

interface StartTrayServiceOptions {
  launcherHost?: TrayLauncherHost;
  logError?: (error: unknown) => void;
  sessionBusFactory?: () => TrayMessageBus;
}

const spawnDetached = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      env: process.env,
      stdio: "ignore",
    });

    child.once("error", (error) => {
      reject(error);
    });
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
};

const createNodeTrayLauncherHost = (): TrayLauncherHost => {
  const runtimeHost = createRuntimeHost();

  return {
    runCommand: (command: string, args: string[]): Promise<RuntimeCommandResult> =>
      runtimeHost.commands.run(command, args),
    spawnDetached,
    whichCommand: (command: string): Promise<string | null> => runtimeHost.commands.which(command),
  };
};

const defaultLogError = (error: unknown): void => {
  console.error(error);
};

const startTrayService = async (options: StartTrayServiceOptions = {}): Promise<TrayService> => {
  const bus: TrayMessageBus = options.sessionBusFactory?.() ?? dbus.sessionBus();
  const logError = options.logError ?? defaultLogError;
  const launcherHost = options.launcherHost ?? createNodeTrayLauncherHost();

  bus.on("error", (error) => {
    logError(error);
  });

  await bus.requestName(trayBusName, 0);

  const item = createStatusNotifierItem({
    onActivate: () => {
      void activateTrayTui(launcherHost).catch(logError);
    },
  });

  bus.export(trayItemObjectPath, item);
  await registerStatusNotifierItem(bus, trayBusName);

  return {
    bus,
    stop: () => {
      bus.disconnect();
    },
  };
};

const waitForever = async (): Promise<void> => {
  await new Promise<void>(() => {
    // Keep the tray resident until a signal terminates the process.
  });
};

const runTrayCommand = async (): Promise<void> => {
  const service = await startTrayService();
  const cleanup = (): void => {
    service.stop();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await waitForever();
};

if (import.meta.main) {
  await runTrayCommand();
}

export {
  createNodeTrayLauncherHost,
  runTrayCommand,
  startTrayService,
  type StartTrayServiceOptions,
  type TrayMessageBus,
  type TrayService,
};
