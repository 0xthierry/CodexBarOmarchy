import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { shellBridgeChannels } from "@/shell/bridge.ts";
import { registerStoreIpc } from "@/shell/ipc.ts";

test("registers IPC handlers and forwards store updates to the renderer", async () => {
  const handledChannels: string[] = [];
  const removedChannels: string[] = [];
  const sentStates: unknown[] = [];
  let subscribedListener: ((state: ReturnType<typeof createState>) => void) | undefined;
  const state = createState();
  const dispose = registerStoreIpc(
    {
      handle: (channel, _listener) => {
        handledChannels.push(channel);
      },
      removeHandler: (channel) => {
        removedChannels.push(channel);
      },
    },
    {
      send: (_channel, nextState) => {
        sentStates.push(nextState);
      },
    },
    {
      getProviderView: () => {
        const providerView = state.providerViews[0];

        if (providerView === undefined) {
          throw new Error("Expected at least one provider view.");
        }

        return providerView;
      },
      getState: () => state,
      initialize: async () => state,
      loginProvider: async () => ({
        actionName: "login",
        message: "ok",
        providerId: "codex",
        status: "success",
      }),
      openClaudeTokenFile: async () => ({
        actionName: "openTokenFile",
        message: "ok",
        providerId: "claude",
        status: "success",
      }),
      refreshEnabledProviders: async () => [],
      refreshProvider: async () => ({
        actionName: "refresh",
        message: "ok",
        providerId: "codex",
        snapshot: null,
        status: "success",
      }),
      reloadClaudeTokenFile: async () => ({
        actionName: "reloadTokenFile",
        message: "ok",
        providerId: "claude",
        status: "success",
      }),
      repairProvider: async () => ({
        actionName: "repair",
        message: "ok",
        providerId: "claude",
        status: "success",
      }),
      selectProvider: async () => state,
      setClaudeConfig: async () => state,
      setCodexConfig: async () => state,
      setGeminiConfig: async () => state,
      setProviderEnabled: async () => state,
      setProviderOrder: async () => state,
      startRefreshScheduler: () => state,
      stopRefreshScheduler: () => state,
      subscribe: (listener) => {
        subscribedListener = listener;

        return (): void => {
          subscribedListener = undefined;
        };
      },
    },
  );

  expect(handledChannels).toContain(shellBridgeChannels.getState);
  if (subscribedListener !== undefined) {
    subscribedListener(state);
  }
  expect(sentStates).toEqual([state]);

  dispose();

  expect(removedChannels).toContain(shellBridgeChannels.updateCodexConfig);
});

const createState = () => createAppStoreState(createDefaultConfig());
