import { expect, test } from "bun:test";
import { createDefaultProviderAdapters } from "../../src/core/actions/provider-adapter.ts";
import { createDefaultConfig } from "../../src/core/config/schema.ts";
import { minimumRefreshSchedulerIntervalMs } from "../../src/core/store/scheduler.ts";
import { createHeadlessAppRuntime } from "../../src/runtime/app-runtime.ts";
import { createFakeConfigStore, createTestBinaryLocator } from "../core/store/test-support.ts";

test("headless app runtime starts the refresh scheduler after initialization", async () => {
  const runtime = createHeadlessAppRuntime({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createDefaultConfig()),
    providerAdapters: createDefaultProviderAdapters(),
    schedulerIntervalMs: minimumRefreshSchedulerIntervalMs,
  });

  const startedState = await runtime.start();

  expect(startedState.scheduler).toEqual({
    active: true,
    intervalMs: minimumRefreshSchedulerIntervalMs,
  });

  const stoppedState = runtime.stop();

  expect(stoppedState.scheduler).toEqual({
    active: false,
    intervalMs: null,
  });
});

test("headless app runtime can leave periodic refresh disabled", async () => {
  const runtime = createHeadlessAppRuntime({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createDefaultConfig()),
    providerAdapters: createDefaultProviderAdapters(),
    schedulerEnabled: false,
  });

  const startedState = await runtime.start();

  expect(startedState.scheduler).toEqual({
    active: false,
    intervalMs: null,
  });
});
