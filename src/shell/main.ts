/* eslint-disable import/consistent-type-specifier-style, import/no-nodejs-modules, no-console, sort-imports, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/promise-function-async, @typescript-eslint/return-await, promise/always-return, promise/prefer-await-to-callbacks, promise/prefer-await-to-then, unicorn/no-null, unicorn/prefer-top-level-await */

import { app, BrowserWindow, ipcMain, nativeImage, Tray } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createConfigStore } from "@/core/config/store.ts";
import { createBinaryLocator } from "@/core/detection/binary-locator.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { createRuntimeProviderAdapters } from "@/runtime/provider-adapters.ts";
import { createRuntimeHost } from "@/shell/runtime-host.ts";
import { startShellSession } from "@/shell/session.ts";
import type { ShellSession } from "@/shell/session.ts";
import { createPopupWindow, loadPopupWindowContent } from "@/shell/window.ts";
import type { BrowserWindowConstructorLike } from "@/shell/window.ts";

const startupFailureExitCode = 1;
const shellDirectoryPath = dirname(fileURLToPath(import.meta.url));
const distDirectoryPath = join(shellDirectoryPath, "..");

const createElectronTray = (): Tray => {
  const trayIcon = nativeImage
    .createFromPath(join(distDirectoryPath, "resources", "tray-icon.png"))
    .resize({ height: 20, width: 20 });

  return new Tray(trayIcon);
};

let activeSessionPromise: Promise<ShellSession> | null = null;

const startShell = (): Promise<ShellSession> => {
  const appStore = createAppStore({
    binaryLocator: createBinaryLocator(),
    configStore: createConfigStore(),
    providerAdapters: createRuntimeProviderAdapters(createRuntimeHost()),
  });

  return startShellSession({
    appStore,
    createPopupWindow: () =>
      createPopupWindow(
        BrowserWindow as unknown as BrowserWindowConstructorLike,
        join(shellDirectoryPath, "preload.cjs"),
      ),
    createTray: createElectronTray,
    ipcMain,
    loadPopupWindow: async (popupWindow) =>
      await loadPopupWindowContent(popupWindow, join(distDirectoryPath, "ui", "index.html")),
  });
};

const ensureShellSession = (): Promise<ShellSession> => {
  activeSessionPromise ??= startShell();

  return activeSessionPromise;
};

const runShell = async (): Promise<void> => {
  await app.whenReady();
  await ensureShellSession();

  app.on("before-quit", () => {
    const sessionPromise = activeSessionPromise;

    if (sessionPromise === null) {
      return;
    }

    sessionPromise
      .then((session) => {
        session.dispose();
      })
      .catch((error: unknown) => {
        console.error("Failed to dispose the shell session.", error);
      });
  });
  app.on("activate", () => {
    ensureShellSession()
      .then((session) => {
        session.popupController.toggle();
      })
      .catch((error: unknown) => {
        console.error("Failed to toggle the popup window.", error);
      });
  });
  app.on("window-all-closed", () => {});
};

if (process.env["OMARCHY_AGENT_BAR_DISABLE_AUTO_START"] !== "1") {
  runShell().catch((error: unknown) => {
    console.error("Failed to start the Omarchy Agent Bar shell.", error);
    app.exit(startupFailureExitCode);
  });
}

export { ensureShellSession, runShell, startShell };
