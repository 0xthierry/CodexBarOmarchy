import type { AppStoreState } from "@/shell/bridge.ts";
import type { BrowserWindowConstructorOptions } from "electron";

const popupHeight = 640;
const popupWidth = 420;

interface PopupWebContentsLike {
  send: (channel: string, state: AppStoreState) => void;
}

interface PopupWindowLike {
  center?: () => void;
  focus: () => void;
  hide: () => void;
  isVisible: () => boolean;
  loadFile: (filePath: string) => Promise<void>;
  on: (eventName: string, listener: (...args: never[]) => unknown) => unknown;
  show: () => void;
  webContents: PopupWebContentsLike;
}

type BrowserWindowConstructorLike = new (
  options: BrowserWindowConstructorOptions,
) => PopupWindowLike;

type PopupControllerWindowLike = Pick<
  PopupWindowLike,
  "center" | "focus" | "hide" | "isVisible" | "show"
>;

interface PopupController {
  hide: () => boolean;
  isVisible: () => boolean;
  toggle: () => boolean;
}

const createPopupWindowOptions = (preloadPath: string): BrowserWindowConstructorOptions => ({
  alwaysOnTop: true,
  autoHideMenuBar: true,
  frame: false,
  fullscreenable: false,
  height: popupHeight,
  maximizable: false,
  minimizable: false,
  resizable: false,
  show: false,
  skipTaskbar: true,
  title: "Omarchy Agent Bar",
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: preloadPath,
  },
  width: popupWidth,
});

const createPopupWindow = async (
  BrowserWindowClass: BrowserWindowConstructorLike,
  filePath: string,
  preloadPath: string,
): Promise<PopupWindowLike> => {
  const popupWindow = new BrowserWindowClass(createPopupWindowOptions(preloadPath));

  popupWindow.on("blur", () => {
    popupWindow.hide();
  });
  await popupWindow.loadFile(filePath);

  return popupWindow;
};

const createPopupController = (popupWindow: PopupControllerWindowLike): PopupController => ({
  hide: (): boolean => {
    if (!popupWindow.isVisible()) {
      return false;
    }

    popupWindow.hide();

    return true;
  },
  isVisible: (): boolean => popupWindow.isVisible(),
  toggle: (): boolean => {
    if (popupWindow.isVisible()) {
      popupWindow.hide();

      return false;
    }

    popupWindow.center?.();
    popupWindow.show();
    popupWindow.focus();

    return true;
  },
});

export {
  createPopupController,
  createPopupWindow,
  createPopupWindowOptions,
  type BrowserWindowConstructorLike,
  type PopupController,
  type PopupWindowLike,
};
