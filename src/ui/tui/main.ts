import { createCliRenderer } from "@opentui/core";
import { createTuiController } from "@/ui/tui/controller.ts";
import { mountOpenTuiApp } from "@/ui/tui/opentui-app.ts";
import { createTuiViewModel } from "@/ui/tui/presenter.ts";
import { renderTuiSnapshot } from "@/ui/tui/snapshot.ts";
import { startStartupRefresh } from "@/ui/tui/startup-refresh.ts";
import { loadActiveOmarchyTheme } from "@/ui/tui/theme.ts";
import { createHeadlessAppRuntime } from "@/runtime/app-runtime.ts";

const runProductionTui = async (): Promise<void> => {
  const runtime = createHeadlessAppRuntime();
  let startupRefresh: ReturnType<typeof startStartupRefresh> | null = null;

  try {
    await runtime.start();

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      await runtime.appStore.refreshEnabledProviders();
      const controller = createTuiController({
        appStore: runtime.appStore,
      });
      const snapshot = controller.getSnapshot();
      const viewModel = createTuiViewModel(snapshot.state, snapshot.localState);

      process.stdout.write(`${renderTuiSnapshot(viewModel)}\n`);
      controller.destroy();
      runtime.stop();
      return;
    }

    const controller = createTuiController({
      appStore: runtime.appStore,
    });
    startupRefresh = startStartupRefresh(runtime.appStore);
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
      startupRefresh?.abort();
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
    startupRefresh?.abort();
    await Promise.resolve();
  }
};

if (import.meta.main) {
  await runProductionTui();
}

export { runProductionTui };
