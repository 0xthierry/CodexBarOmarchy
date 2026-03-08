import type { AppStoreState } from "@/shell/bridge.ts";
import type { BrowserWindowConstructorOptions } from "electron";

const blurDismissArmingDelayMs = 250;
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
  "center" | "focus" | "hide" | "isVisible" | "on" | "show"
>;

interface PopupController {
  hide: () => boolean;
  isVisible: () => boolean;
  toggle: () => boolean;
}

interface BlurDismissState {
  armed: boolean;
  timerHandle: ReturnType<typeof globalThis.setTimeout> | null;
}

const createBlurDismissState = (): BlurDismissState => ({
  armed: false,
  timerHandle: null,
});

const clearBlurDismissTimer = (blurDismissState: BlurDismissState): void => {
  if (blurDismissState.timerHandle !== null) {
    globalThis.clearTimeout(blurDismissState.timerHandle);
    blurDismissState.timerHandle = null;
  }
};

const disarmBlurDismiss = (blurDismissState: BlurDismissState): void => {
  clearBlurDismissTimer(blurDismissState);
  blurDismissState.armed = false;
};

const armBlurDismiss = (blurDismissState: BlurDismissState): void => {
  clearBlurDismissTimer(blurDismissState);
  blurDismissState.timerHandle = globalThis.setTimeout(() => {
    blurDismissState.armed = true;
    blurDismissState.timerHandle = null;
  }, blurDismissArmingDelayMs);
};

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

const createPopupWindow = (
  BrowserWindowClass: BrowserWindowConstructorLike,
  preloadPath: string,
): PopupWindowLike => {
  return new BrowserWindowClass(createPopupWindowOptions(preloadPath));
};

const loadPopupWindowContent = async (
  popupWindow: PopupWindowLike,
  filePath: string,
): Promise<void> => {
  await popupWindow.loadFile(filePath);
};

const createPopupController = (popupWindow: PopupControllerWindowLike): PopupController => {
  const blurDismissState = createBlurDismissState();

  popupWindow.on("blur", () => {
    if (!blurDismissState.armed) {
      return;
    }

    disarmBlurDismiss(blurDismissState);
    popupWindow.hide();
  });

  return {
    hide: (): boolean => {
      disarmBlurDismiss(blurDismissState);

      if (!popupWindow.isVisible()) {
        return false;
      }

      popupWindow.hide();

      return true;
    },
    isVisible: (): boolean => popupWindow.isVisible(),
    toggle: (): boolean => {
      if (popupWindow.isVisible()) {
        disarmBlurDismiss(blurDismissState);
        popupWindow.hide();

        return false;
      }

      popupWindow.center?.();
      popupWindow.show();
      popupWindow.focus();
      armBlurDismiss(blurDismissState);

      return true;
    },
  };
};

export {
  blurDismissArmingDelayMs,
  createPopupController,
  createPopupWindow,
  createPopupWindowOptions,
  loadPopupWindowContent,
  type BrowserWindowConstructorLike,
  type PopupController,
  type PopupWindowLike,
};
