/* eslint-disable no-magic-numbers, no-undefined, sort-imports */

import { expect, test } from "bun:test";
import { createPopupController, createPopupWindowOptions } from "@/shell/window.ts";

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
    center: () => visible,
    focus: () => visible,
    hide: () => {
      visible = false;
    },
    isVisible: () => visible,
    show: () => {
      visible = true;
    },
  });

  expect(popupController.toggle()).toBe(true);
  expect(popupController.isVisible()).toBe(true);
  expect(popupController.toggle()).toBe(false);
  expect(popupController.hide()).toBe(false);
});
