import { createTestRenderer } from "@opentui/core/testing";
import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { createTuiController } from "@/ui/tui/controller.ts";
import { mountOpenTuiApp } from "@/ui/tui/opentui-app.ts";
import type { OmarchyTheme } from "@/ui/tui/types.ts";
import { createFakeConfigStore, createTestBinaryLocator } from "../core/store/test-support.ts";

const testTheme: OmarchyTheme = {
  accent: "#ffaa00",
  background: "#111111",
  color1: "#aa0000",
  color2: "#00aa00",
  color3: "#0000aa",
  color4: "#aaaa00",
  color5: "#aa00aa",
  color8: "#888888",
  cursor: "#ffffff",
  foreground: "#eeeeee",
};

test("mounts the OpenTUI app and keeps modal provider switching suppressed", async () => {
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createDefaultConfig()),
  });

  await appStore.initialize();

  const controller = createTuiController({ appStore });
  const { captureCharFrame, mockInput, renderOnce, renderer } = await createTestRenderer({
    autoFocus: true,
    height: 40,
    width: 100,
  });
  const mountedApp = mountOpenTuiApp({
    controller,
    renderer,
    theme: testTheme,
  });

  await renderOnce();
  expect(captureCharFrame()).toContain("menu");

  await mockInput.typeText(",");
  await renderOnce();
  expect(captureCharFrame()).toContain("settings");

  await mockInput.typeText("2");
  await renderOnce();

  expect(controller.getSnapshot().localState.focusedProviderId).toBe("codex");

  mountedApp.destroy();
  controller.destroy();
  renderer.destroy();
});
