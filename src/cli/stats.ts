import { createStatsSnapshot } from "@/cli/stats-output.ts";
import { createHeadlessAppRuntime } from "@/runtime/app-runtime.ts";

const runStatsCommand = async (): Promise<void> => {
  const runtime = createHeadlessAppRuntime({
    schedulerEnabled: false,
  });

  try {
    await runtime.start();
    await runtime.appStore.refreshEnabledProviders();

    const snapshot = createStatsSnapshot(runtime.appStore.getState());
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } finally {
    runtime.stop();
  }
};

if (import.meta.main) {
  await runStatsCommand();
}

export { runStatsCommand };
