import { expect, test } from "bun:test";
import { createPopupController, createPopupWindowOptions } from "@/shell/window.ts";
import type { AppStoreState } from "@/shell/bridge.ts";

const createWebContents = (): { send: (_channel: string, _state: AppStoreState) => void } => ({
  send: () => undefined,
});

test("creates compact popup window options with preload isolation", () => {
  const popupWindowOptions = createPopupWindowOptions("/tmp/preload.js");

  expect(popupWindowOptions.width).toBe(420);
  expect(popupWindowOptions.height).toBe(640);
  expect(popupWindowOptions.show).toBe(false);
  expect(popupWindowOptions.webPreferences?.contextIsolation).toBe(true);
  expect(popupWindowOptions.webPreferences?.preload).toBe("/tmp/preload.js");
});

test("toggles popup visibility through the popup controller", () => {
  let visible = false;
  const popupController = createPopupController({
    center: () => undefined,
    focus: () => undefined,
    hide: () => {
      visible = false;
    },
    isVisible: () => visible,
    loadFile: async () => undefined,
    on: () => undefined,
    show: () => {
      visible = true;
    },
    webContents: createWebContents(),
  });

  expect(popupController.toggle()).toBe(true);
  expect(popupController.isVisible()).toBe(true);
  expect(popupController.toggle()).toBe(false);
  expect(popupController.hide()).toBe(false);
});
