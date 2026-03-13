import { expect, test } from "bun:test";
import type * as dbus from "dbus-next";
import { trayBusName, trayIconName, trayIconThemePath } from "../../src/tray/constants.ts";
import {
  createStatusNotifierItem,
  registerStatusNotifierItem,
} from "../../src/tray/status-notifier.ts";

test("createStatusNotifierItem exposes the tray metadata and activates the callback", () => {
  let activationCount = 0;
  const item = createStatusNotifierItem({
    onActivate: () => {
      activationCount += 1;
    },
  });

  expect(item.Id).toBe("agent-stats");
  expect(item.IconName).toBe(trayIconName);
  expect(item.IconThemePath).toBe(trayIconThemePath);
  expect(item.ItemIsMenu).toBe(false);
  expect(item.Status).toBe("Active");

  item.Activate(0, 0);
  item.SecondaryActivate(0, 0);

  expect(activationCount).toBe(2);
});

test("registerStatusNotifierItem uses the well-known bus name with the watcher call", async () => {
  const messages: dbus.Message[] = [];

  await registerStatusNotifierItem(
    {
      call: async (message: dbus.Message): Promise<unknown> => {
        messages.push(message);
        return undefined;
      },
    },
    trayBusName,
  );

  expect(messages).toHaveLength(1);
  expect(messages[0]?.body).toEqual([trayBusName]);
  expect(messages[0]?.destination).toBe("org.kde.StatusNotifierWatcher");
  expect(messages[0]?.interface).toBe("org.kde.StatusNotifierWatcher");
  expect(messages[0]?.member).toBe("RegisterStatusNotifierItem");
  expect(messages[0]?.path).toBe("/StatusNotifierWatcher");
  expect(messages[0]?.signature).toBe("s");
});
