import { createSuccessfulProviderActionResult } from "../src/core/actions/action-result.ts";
import { createRefreshActionResult } from "../src/core/actions/provider-adapter.ts";
import { createDefaultConfig } from "../src/core/config/schema.ts";
import { createTuiController } from "../src/ui/tui/controller.ts";
import { createTuiViewModel } from "../src/ui/tui/presenter.ts";
import { renderTuiSnapshot } from "../src/ui/tui/snapshot.ts";
import { createHeadlessAppRuntime } from "../src/runtime/app-runtime.ts";
import { createFakeConfigStore, createTestBinaryLocator } from "../test/core/store/test-support.ts";

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const createSmokeConfig = () => {
  const config = createDefaultConfig();

  return {
    ...config,
    providers: {
      ...config.providers,
      claude: {
        ...config.providers.claude,
        activeTokenAccountIndex: 1,
        cookieSource: "manual" as const,
        tokenAccounts: [
          {
            label: "primary",
            token: "secret-1",
          },
          {
            label: "backup",
            token: "secret-2",
          },
        ],
      },
      codex: {
        ...config.providers.codex,
        cookieSource: "auto" as const,
        extrasEnabled: true,
      },
    },
    selectedProvider: "claude" as const,
  };
};

const createSmokeProviderAdapters = () => ({
  claude: {
    login: async () =>
      createSuccessfulProviderActionResult("claude", "login", "Claude login started."),
    openTokenFile: async () =>
      createSuccessfulProviderActionResult("claude", "openTokenFile", "Opened."),
    refresh: async () =>
      createRefreshActionResult(
        createSuccessfulProviderActionResult("claude", "refresh", "Claude refreshed."),
        {
          identity: {
            accountEmail: "claude@example.com",
            planLabel: "Max",
          },
          latestError: null,
          serviceStatus: null,
          sourceLabel: "web",
          state: "ready",
          updatedAt: "2026-03-10T12:34:56.000Z",
          usage: {
            additional: [],
            balances: {
              credits: null,
            },
            displayMetrics: [
              {
                detail: null,
                label: "Session",
                value: "72%",
              },
              {
                detail: null,
                label: "Sonnet",
                value: "41%",
              },
            ],
            providerCost: null,
            quotaBuckets: [],
            windows: {
              flash: null,
              pro: null,
              session: {
                detail: null,
                label: "Session",
                value: "72%",
              },
              sonnet: {
                detail: null,
                label: "Sonnet",
                value: "41%",
              },
              weekly: null,
            },
          },
          version: "1.0.0",
        },
      ),
    reloadTokenFile: async () =>
      createSuccessfulProviderActionResult("claude", "reloadTokenFile", "Reloaded."),
    repair: async () =>
      createSuccessfulProviderActionResult("claude", "repair", "Claude repaired."),
  },
  codex: {
    login: async () =>
      createSuccessfulProviderActionResult("codex", "login", "Codex login started."),
    refresh: async () =>
      createRefreshActionResult(
        createSuccessfulProviderActionResult("codex", "refresh", "Codex refreshed."),
        {
          identity: {
            accountEmail: "codex@example.com",
            planLabel: "OAuth",
          },
          latestError: null,
          serviceStatus: null,
          sourceLabel: "oauth",
          state: "ready",
          updatedAt: "2026-03-10T12:33:00.000Z",
          usage: {
            additional: [],
            balances: {
              credits: null,
            },
            displayMetrics: [
              {
                detail: null,
                label: "Session",
                value: "58%",
              },
              {
                detail: null,
                label: "Weekly",
                value: "81%",
              },
            ],
            providerCost: null,
            quotaBuckets: [],
            windows: {
              flash: null,
              pro: null,
              session: {
                detail: null,
                label: "Session",
                value: "58%",
              },
              sonnet: null,
              weekly: {
                detail: null,
                label: "Weekly",
                value: "81%",
              },
            },
          },
          version: "1.2.3",
        },
      ),
  },
  gemini: {
    login: async () =>
      createSuccessfulProviderActionResult("gemini", "login", "Gemini login started."),
    refresh: async () =>
      createRefreshActionResult(
        createSuccessfulProviderActionResult("gemini", "refresh", "Gemini refreshed."),
        {
          identity: {
            accountEmail: "gemini@example.com",
            planLabel: "API",
          },
          latestError: null,
          serviceStatus: null,
          sourceLabel: "api",
          state: "ready",
          updatedAt: "2026-03-10T12:35:00.000Z",
          usage: {
            additional: [],
            balances: {
              credits: null,
            },
            displayMetrics: [
              {
                detail: null,
                label: "Flash",
                value: "34%",
              },
            ],
            providerCost: null,
            quotaBuckets: [
              {
                modelId: "gemini-2.5-flash",
                remainingFraction: 0.66,
                resetTime: "2026-03-10T18:00:00.000Z",
              },
            ],
            windows: {
              flash: {
                detail: null,
                label: "Flash",
                value: "34%",
              },
              pro: null,
              session: null,
              sonnet: null,
              weekly: null,
            },
          },
          version: "0.29.7",
        },
      ),
  },
});

const main = async (): Promise<void> => {
  const runtime = createHeadlessAppRuntime({
    binaryLocator: createTestBinaryLocator({
      claude: true,
      codex: true,
      gemini: true,
    }),
    configStore: createFakeConfigStore(createSmokeConfig()),
    providerAdapters: createSmokeProviderAdapters(),
    schedulerEnabled: false,
  });

  try {
    await runtime.start();
    await runtime.appStore.refreshEnabledProviders();

    const controller = createTuiController({
      appStore: runtime.appStore,
    });
    const shellSnapshot = renderTuiSnapshot(
      createTuiViewModel(controller.getSnapshot().state, controller.getSnapshot().localState),
    );

    assert(shellSnapshot.includes("agent-stats"), "expected the TUI title in the snapshot");
    assert(
      shellSnapshot.includes("[claude]"),
      "expected the selected provider tab in the snapshot",
    );
    assert(shellSnapshot.includes("usage"), "expected the usage section in the snapshot");
    assert(shellSnapshot.includes("details"), "expected the details section in the snapshot");
    assert(shellSnapshot.includes("config"), "expected the config section in the snapshot");
    assert(shellSnapshot.includes("menu"), "expected the menu section in the snapshot");
    assert(shellSnapshot.includes("Sonnet"), "expected Claude metrics in the snapshot");

    controller.openSettings();

    const modalSnapshot = renderTuiSnapshot(
      createTuiViewModel(controller.getSnapshot().state, controller.getSnapshot().localState),
    );

    assert(modalSnapshot.includes("settings modal"), "expected the settings modal in the snapshot");
    assert(
      modalSnapshot.includes("Active token account"),
      "expected the Claude active token-account control in the snapshot",
    );
    assert(modalSnapshot.includes("backup"), "expected the active Claude token account label");

    process.stdout.write(`${shellSnapshot}\n`);
    controller.destroy();
  } finally {
    runtime.stop();
  }
};

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
