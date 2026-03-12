import type * as dbus from "dbus-next";
import { expect, test } from "bun:test";
import { trayBusName, trayItemObjectPath } from "../../src/tray/constants.ts";
import type { TrayLauncherHost } from "../../src/tray/launcher.ts";
import { startTrayService } from "../../src/tray/main.ts";
import type { TrayMessageBus } from "../../src/tray/main.ts";

interface ActivatableTrayItem {
  Activate: (x: number, y: number) => void;
}

const isActivatableTrayItem = (value: unknown): value is ActivatableTrayItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof Reflect.get(value, "Activate") === "function";
};

test("startTrayService requests the bus name, exports the item, and registers it", async () => {
  const events = new Map<string, (error: unknown) => void>();
  const exportedItems: { path: string; value: unknown }[] = [];
  const requestedNames: string[] = [];
  const calledMessages: unknown[] = [];
  let disconnected = false;

  const bus: TrayMessageBus = {
    call: async (message): Promise<unknown> => {
      calledMessages.push(message);
      return undefined;
    },
    disconnect: (): void => {
      disconnected = true;
    },
    export: (path: string, value: dbus.interface.Interface): void => {
      exportedItems.push({ path, value });
    },
    on: (event: "error", listener: (error: unknown) => void): void => {
      events.set(event, listener);
    },
    requestName: async (name: string): Promise<unknown> => {
      requestedNames.push(name);
      return undefined;
    },
  };

  const launcherHost: TrayLauncherHost = {
    runCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "[]",
    }),
    spawnDetached: async (): Promise<void> => {
      await Promise.resolve();
    },
    whichCommand: async (): Promise<string | null> => "/usr/bin/fake",
  };

  const service = await startTrayService({
    launcherHost,
    sessionBusFactory: () => bus,
  });

  expect(requestedNames).toEqual([trayBusName]);
  expect(exportedItems).toHaveLength(1);
  expect(exportedItems[0]?.path).toBe(trayItemObjectPath);
  expect(calledMessages).toHaveLength(1);
  expect(events.has("error")).toBe(true);

  service.stop();

  expect(disconnected).toBe(true);
});

test("the exported tray item activates the injected launcher host", async () => {
  const exportedItems: { path: string; value: unknown }[] = [];
  let resolveLaunch: (() => void) | null = null;
  const launched = new Promise<void>((resolve) => {
    resolveLaunch = resolve;
  });

  const bus: TrayMessageBus = {
    call: async (): Promise<unknown> => undefined,
    disconnect: (): void => {},
    export: (path: string, value: dbus.interface.Interface): void => {
      exportedItems.push({ path, value });
    },
    on: (): void => {},
    requestName: async (): Promise<unknown> => undefined,
  };

  const launcherHost: TrayLauncherHost = {
    runCommand: async () => ({
      exitCode: 0,
      stderr: "",
      stdout: "[]",
    }),
    spawnDetached: async (): Promise<void> => {
      resolveLaunch?.();
    },
    whichCommand: async (): Promise<string | null> => "/usr/bin/fake",
  };

  const service = await startTrayService({
    launcherHost,
    sessionBusFactory: () => bus,
  });

  expect(exportedItems).toHaveLength(1);
  expect(exportedItems[0]?.path).toBe(trayItemObjectPath);

  const item = exportedItems[0]?.value;

  expect(isActivatableTrayItem(item)).toBe(true);

  if (!isActivatableTrayItem(item)) {
    throw new Error("Expected exported tray item to expose an Activate method.");
  }

  item.Activate(0, 0);

  await launched;
  service.stop();
});

test("startTrayService forwards bus errors to the configured logger", async () => {
  const events = new Map<string, (error: unknown) => void>();
  const loggedErrors: unknown[] = [];

  const bus: TrayMessageBus = {
    call: async (): Promise<unknown> => undefined,
    disconnect: (): void => {},
    export: (): void => {},
    on: (event: "error", listener: (error: unknown) => void): void => {
      events.set(event, listener);
    },
    requestName: async (): Promise<unknown> => undefined,
  };

  const service = await startTrayService({
    launcherHost: {
      runCommand: async () => ({
        exitCode: 0,
        stderr: "",
        stdout: "[]",
      }),
      spawnDetached: async (): Promise<void> => {
        await Promise.resolve();
      },
      whichCommand: async (): Promise<string | null> => "/usr/bin/fake",
    },
    logError: (error: unknown): void => {
      loggedErrors.push(error);
    },
    sessionBusFactory: () => bus,
  });

  const busError = new Error("dbus disconnected");
  const errorListener = events.get("error");

  expect(typeof errorListener).toBe("function");

  errorListener?.(busError);

  expect(loggedErrors).toEqual([busError]);
  service.stop();
});

test("startTrayService logs activation failures from the launcher host", async () => {
  const exportedItems: { path: string; value: unknown }[] = [];
  const activationError = new Error("missing hyprctl");
  let resolveLoggedError: (() => void) | null = null;
  const loggedError = new Promise<void>((resolve) => {
    resolveLoggedError = resolve;
  });
  const loggedErrors: unknown[] = [];

  const bus: TrayMessageBus = {
    call: async (): Promise<unknown> => undefined,
    disconnect: (): void => {},
    export: (path: string, value: dbus.interface.Interface): void => {
      exportedItems.push({ path, value });
    },
    on: (): void => {},
    requestName: async (): Promise<unknown> => undefined,
  };

  const service = await startTrayService({
    launcherHost: {
      runCommand: async () => {
        throw activationError;
      },
      spawnDetached: async (): Promise<void> => {
        await Promise.resolve();
      },
      whichCommand: async (): Promise<string | null> => "/usr/bin/fake",
    },
    logError: (error: unknown): void => {
      loggedErrors.push(error);
      resolveLoggedError?.();
    },
    sessionBusFactory: () => bus,
  });

  const item = exportedItems[0]?.value;

  expect(isActivatableTrayItem(item)).toBe(true);

  if (!isActivatableTrayItem(item)) {
    throw new Error("Expected exported tray item to expose an Activate method.");
  }

  item.Activate(0, 0);

  await loggedError;

  expect(loggedErrors).toEqual([activationError]);
  service.stop();
});
