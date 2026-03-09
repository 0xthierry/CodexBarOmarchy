import { expect, test } from "bun:test";
import {
  blurDismissArmingDelayMs,
  createPopupController,
  createPopupWindowOptions,
} from "@/shell/window.ts";

const invokeListener = (listener: (() => void) | undefined): void => {
  if (listener !== undefined) {
    listener();
  }
};

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
  const listeners: { blur: (() => void) | undefined } = {
    blur: undefined,
  };
  const popupController = createPopupController({
    center: () => visible,
    focus: () => visible,
    hide: () => {
      visible = false;
    },
    isVisible: () => visible,
    on: (_eventName, listener) => {
      listeners.blur = listener as () => void;
    },
    show: () => {
      visible = true;
    },
  });

  expect(popupController.toggle()).toBe(true);
  expect(popupController.isVisible()).toBe(true);
  expect(popupController.toggle()).toBe(false);
  expect(popupController.hide()).toBe(false);
  expect(listeners.blur).toBeDefined();
});

test("does not dismiss immediately on blur right after opening", async () => {
  let visible = false;
  const listeners: { blur: (() => void) | undefined } = {
    blur: undefined,
  };
  const popupController = createPopupController({
    center: () => visible,
    focus: () => visible,
    hide: () => {
      visible = false;
    },
    isVisible: () => visible,
    on: (_eventName, listener) => {
      listeners.blur = listener as () => void;
    },
    show: () => {
      visible = true;
    },
  });

  popupController.toggle();
  invokeListener(listeners.blur);
  expect(popupController.isVisible()).toBe(true);

  await Bun.sleep(blurDismissArmingDelayMs + 25);

  invokeListener(listeners.blur);
  expect(popupController.isVisible()).toBe(false);
});
