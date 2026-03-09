import type { AppStore } from "@/core/store/app-store.ts";
import { registerStoreIpc } from "@/shell/ipc.ts";
import type { IpcMainLike } from "@/shell/ipc.ts";
import { connectTrayToPopup } from "@/shell/tray.ts";
import { createPopupController } from "@/shell/window.ts";
import type { PopupController, PopupWindowLike } from "@/shell/window.ts";

interface TrayLike {
  destroy?: () => void;
  on: (eventName: "click", listener: () => void) => void;
  setToolTip: (text: string) => void;
}

interface ShellSession {
  dispose: () => void;
  popupController: PopupController;
  popupWindow: PopupWindowLike;
  tray: TrayLike;
}

interface StartShellSessionOptions {
  appStore: AppStore;
  createPopupWindow: () => PopupWindowLike;
  createTray: () => TrayLike;
  ipcMain: IpcMainLike;
  loadPopupWindow: (popupWindow: PopupWindowLike) => Promise<void>;
}

const startShellSession = async (options: StartShellSessionOptions): Promise<ShellSession> => {
  await options.appStore.initialize();

  const popupWindow = options.createPopupWindow();
  const popupController = createPopupController(popupWindow);
  const tray = options.createTray();
  const disposeIpc = registerStoreIpc(options.ipcMain, popupWindow.webContents, options.appStore);

  connectTrayToPopup(tray, popupController);

  try {
    await options.loadPopupWindow(popupWindow);
  } catch (error) {
    disposeIpc();
    popupController.hide();
    tray.destroy?.();
    throw error;
  }

  return {
    dispose: (): void => {
      disposeIpc();
      popupController.hide();
      tray.destroy?.();
    },
    popupController,
    popupWindow,
    tray,
  };
};

export { startShellSession, type ShellSession, type StartShellSessionOptions, type TrayLike };
