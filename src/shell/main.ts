/* eslint-disable import/no-nodejs-modules, sort-imports */

import { app, BrowserWindow, ipcMain, nativeImage, Tray } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDefaultProviderAdapters } from "@/core/actions/provider-adapter.ts";
import { createConfigStore } from "@/core/config/store.ts";
import { createBinaryLocator } from "@/core/detection/binary-locator.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { startShellSession } from "@/shell/session.ts";
import type { ShellSession } from "@/shell/session.ts";
import { createPopupWindow } from "@/shell/window.ts";
import type { BrowserWindowConstructorLike } from "@/shell/window.ts";

const shellDirectoryPath = dirname(fileURLToPath(import.meta.url));
const distDirectoryPath = join(shellDirectoryPath, "..");

const createElectronTray = (): Tray => {
  const trayIcon = nativeImage
    .createFromPath(join(distDirectoryPath, "resources", "tray-icon.png"))
    .resize({ height: 20, width: 20 });

  return new Tray(trayIcon);
};

let activeSessionPromise: Promise<ShellSession> | undefined;

const startShell = async (): Promise<ShellSession> => {
  const appStore = createAppStore({
    binaryLocator: createBinaryLocator(),
    configStore: createConfigStore(),
    providerAdapters: createDefaultProviderAdapters(),
  });

  return startShellSession({
    appStore,
    createPopupWindow: async () =>
      await createPopupWindow(
        BrowserWindow as unknown as BrowserWindowConstructorLike,
        join(distDirectoryPath, "ui", "index.html"),
        join(shellDirectoryPath, "preload.cjs"),
      ),
    createTray: createElectronTray,
    ipcMain,
  });
};

const ensureShellSession = (): Promise<ShellSession> => {
  if (activeSessionPromise === undefined) {
    activeSessionPromise = startShell();
  }

  return activeSessionPromise;
};

const runShell = async (): Promise<void> => {
  await app.whenReady();
  await ensureShellSession();

  app.on("before-quit", () => {
    const sessionPromise = activeSessionPromise;

    if (sessionPromise === undefined) {
      return;
    }

    sessionPromise.then((session) => {
      session.dispose();
    }).catch((error: unknown) => {
      console.error("Failed to dispose the shell session.", error);
    });
  });
  app.on("activate", () => {
    const togglePopup = async (): Promise<void> => {
      const session = await ensureShellSession();

      session.popupController.toggle();
    };

    togglePopup().catch((error: unknown) => {
      console.error("Failed to toggle the popup window.", error);
    });
  });
  app.on("window-all-closed", () => {
    return undefined;
  });
};

if (process.env["OMARCHY_AGENT_BAR_DISABLE_AUTO_START"] !== "1") {
  runShell().catch((error: unknown) => {
    console.error("Failed to start the Omarchy Agent Bar shell.", error);
    app.exit(1);
  });
}

export { ensureShellSession, runShell, startShell };
