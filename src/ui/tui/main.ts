import { createCliRenderer } from "@opentui/core";
import { createTuiController } from "@/ui/tui/controller.ts";
import { mountOpenTuiApp } from "@/ui/tui/opentui-app.ts";
import { createTuiViewModel } from "@/ui/tui/presenter.ts";
import { renderTuiSnapshot } from "@/ui/tui/snapshot.ts";
import { loadActiveOmarchyTheme } from "@/ui/tui/theme.ts";
import { createHeadlessAppRuntime } from "@/runtime/app-runtime.ts";

const runProductionTui = async (): Promise<void> => {
  const runtime = createHeadlessAppRuntime();

  try {
    await runtime.start();
    await runtime.appStore.refreshEnabledProviders();
    const controller = createTuiController({
      appStore: runtime.appStore,
    });

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      const snapshot = controller.getSnapshot();
      const viewModel = createTuiViewModel(snapshot.state, snapshot.localState);

      process.stdout.write(`${renderTuiSnapshot(viewModel)}\n`);
      controller.destroy();
      runtime.stop();
      return;
    }

    const theme = await loadActiveOmarchyTheme();
    const renderer = await createCliRenderer({
      autoFocus: true,
      backgroundColor: theme.background,
      exitOnCtrlC: false,
      useAlternateScreen: true,
      useConsole: false,
    });
    const mountedApp = mountOpenTuiApp({
      controller,
      renderer,
      theme,
    });

    const cleanup = (): void => {
      mountedApp.destroy();
      controller.destroy();
      renderer.destroy();
      runtime.stop();
    };

    const unsubscribe = controller.subscribe((snapshot) => {
      if (!snapshot.localState.quitRequested) {
        return;
      }

      unsubscribe();
      cleanup();
      process.exit(0);
    });

    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });

    await new Promise<void>(() => {
      // Keep the renderer alive until the process exits.
    });
  } finally {
    await Promise.resolve();
  }
};

if (import.meta.main) {
  await runProductionTui();
}

export { runProductionTui };
