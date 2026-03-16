import { expect, test } from "bun:test";
import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";
import { createRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { getStartupRefreshOrder, startStartupRefresh } from "@/ui/tui/startup-refresh.ts";

const createStartupRefreshStore = (
  selectedProviderId: "claude" | "codex" | "gemini",
  enabledProviderIds: ("claude" | "codex" | "gemini")[],
  refreshProvider: (
    providerId: "claude" | "codex" | "gemini",
  ) => Promise<ReturnType<typeof createRefreshActionResult<"claude" | "codex" | "gemini">>>,
) => {
  const config = createDefaultConfig();

  config.selectedProvider = selectedProviderId;

  for (const providerId of ["claude", "codex", "gemini"] as const) {
    config.providers[providerId].enabled = enabledProviderIds.includes(providerId);
  }

  const state = createAppStoreState(config, createDefaultProviderRuntimeStateMap());

  return {
    getState: () => state,
    refreshProvider,
  };
};

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

test("getStartupRefreshOrder prioritizes the selected enabled provider", () => {
  const appStore = createStartupRefreshStore(
    "claude",
    ["claude", "codex", "gemini"],
    async (providerId) =>
      createRefreshActionResult(
        createSuccessfulProviderActionResult(providerId, "refresh", `${providerId} refreshed.`),
      ),
  );

  expect(getStartupRefreshOrder(appStore)).toEqual(["claude", "codex", "gemini"]);
});

test("getStartupRefreshOrder falls back to enabled provider order when selection is disabled", () => {
  const appStore = createStartupRefreshStore("claude", ["codex", "gemini"], async (providerId) =>
    createRefreshActionResult(
      createSuccessfulProviderActionResult(providerId, "refresh", `${providerId} refreshed.`),
    ),
  );

  expect(getStartupRefreshOrder(appStore)).toEqual(["codex", "gemini"]);
});

test("startup refresh waits for the selected provider before refreshing the rest", async () => {
  let resolveSelectedRefresh!: () => void;
  const refreshCalls: string[] = [];
  const selectedRefresh = new Promise<void>((resolve) => {
    resolveSelectedRefresh = resolve;
  });
  const appStore = createStartupRefreshStore(
    "claude",
    ["claude", "codex", "gemini"],
    async (providerId) => {
      refreshCalls.push(providerId);

      if (providerId === "claude") {
        await selectedRefresh;
      }

      return createRefreshActionResult(
        createSuccessfulProviderActionResult(providerId, "refresh", `${providerId} refreshed.`),
      );
    },
  );

  const startupRefresh = startStartupRefresh(appStore);
  await flush();

  expect(refreshCalls).toEqual(["claude"]);

  resolveSelectedRefresh();
  await startupRefresh.completion;

  expect(refreshCalls).toEqual(["claude", "codex", "gemini"]);
});

test("startup refresh abort prevents remaining providers from starting after the selected provider", async () => {
  let resolveSelectedRefresh!: () => void;
  const refreshCalls: string[] = [];
  const selectedRefresh = new Promise<void>((resolve) => {
    resolveSelectedRefresh = resolve;
  });
  const appStore = createStartupRefreshStore(
    "claude",
    ["claude", "codex", "gemini"],
    async (providerId) => {
      refreshCalls.push(providerId);

      if (providerId === "claude") {
        await selectedRefresh;
      }

      return createRefreshActionResult(
        createSuccessfulProviderActionResult(providerId, "refresh", `${providerId} refreshed.`),
      );
    },
  );

  const startupRefresh = startStartupRefresh(appStore);
  await flush();

  startupRefresh.abort();
  resolveSelectedRefresh();
  await startupRefresh.completion;

  expect(refreshCalls).toEqual(["claude"]);
});
