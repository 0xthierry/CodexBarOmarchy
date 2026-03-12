import type * as dbus from "dbus-next";
import { expect, test } from "bun:test";
import { trayBusName, trayItemObjectPath } from "../../src/tray/constants.ts";
import type { TrayLauncherHost } from "../../src/tray/launcher.ts";
import { startTrayService } from '../../src/tray/main.ts';
import type { TrayMessageBus } from '../../src/tray/main.ts';

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
