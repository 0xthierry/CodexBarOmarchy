/* eslint-disable @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/promise-function-async, import/consistent-type-specifier-style, max-lines-per-function, max-statements, no-continue, no-duplicate-imports, sort-imports */

import type { IpcMainInvokeEvent } from "electron";
import type { AppStore } from "@/core/store/app-store.ts";
import { shellBridgeChannels } from "@/shell/bridge.ts";
import type { AppStoreState } from "@/shell/bridge.ts";

interface IpcMainLike {
  handle: (
    channel: string,
    listener: (event: IpcMainInvokeEvent, payload?: unknown) => unknown,
  ) => void;
  removeHandler: (channel: string) => void;
}

interface WebContentsLike {
  send: (channel: string, state: AppStoreState) => void;
}

const applyConfigPatch = <ValueType extends object>(
  currentValue: ValueType,
  patch: Partial<ValueType>,
): ValueType => ({
  ...currentValue,
  ...patch,
});

const registerStoreIpc = (
  ipcMain: IpcMainLike,
  webContents: WebContentsLike,
  appStore: AppStore,
): (() => void) => {
  const registerHandler = <PayloadType, ResultType>(
    channel: string,
    listener: (_payload: PayloadType) => Promise<ResultType> | ResultType,
  ): void => {
    ipcMain.handle(channel, (_event, payload) => listener(payload as PayloadType));
  };

  ipcMain.handle(shellBridgeChannels.getState, () => appStore.getState());
  registerHandler(
    shellBridgeChannels.loginProvider,
    (providerId: AppStoreState["selectedProviderId"]) => appStore.loginProvider(providerId),
  );
  registerHandler(shellBridgeChannels.openClaudeTokenFile, () => appStore.openClaudeTokenFile());
  registerHandler(
    shellBridgeChannels.refreshProvider,
    (providerId: AppStoreState["selectedProviderId"]) => appStore.refreshProvider(providerId),
  );
  registerHandler(shellBridgeChannels.reloadClaudeTokenFile, () =>
    appStore.reloadClaudeTokenFile(),
  );
  registerHandler(
    shellBridgeChannels.repairProvider,
    (providerId: AppStoreState["selectedProviderId"]) => appStore.repairProvider(providerId),
  );
  registerHandler(
    shellBridgeChannels.selectProvider,
    (providerId: AppStoreState["selectedProviderId"]) => appStore.selectProvider(providerId),
  );
  registerHandler(
    shellBridgeChannels.setProviderEnabled,
    (payload: { enabled: boolean; providerId: AppStoreState["selectedProviderId"] }) =>
      appStore.setProviderEnabled(payload.providerId, payload.enabled),
  );
  registerHandler(
    shellBridgeChannels.setProviderOrder,
    (providerOrder: AppStoreState["selectedProviderId"][]) =>
      appStore.setProviderOrder(providerOrder),
  );
  registerHandler(shellBridgeChannels.startRefreshScheduler, (intervalMs: number) =>
    appStore.startRefreshScheduler(intervalMs),
  );
  registerHandler(shellBridgeChannels.stopRefreshScheduler, () => appStore.stopRefreshScheduler());
  registerHandler(
    shellBridgeChannels.updateClaudeConfig,
    (patch: Partial<AppStoreState["config"]["providers"]["claude"]>) =>
      appStore.setClaudeConfig((providerConfig) => applyConfigPatch(providerConfig, patch)),
  );
  registerHandler(
    shellBridgeChannels.updateCodexConfig,
    (patch: Partial<AppStoreState["config"]["providers"]["codex"]>) =>
      appStore.setCodexConfig((providerConfig) => applyConfigPatch(providerConfig, patch)),
  );
  registerHandler(
    shellBridgeChannels.updateGeminiConfig,
    (patch: Partial<AppStoreState["config"]["providers"]["gemini"]>) =>
      appStore.setGeminiConfig((providerConfig) => applyConfigPatch(providerConfig, patch)),
  );

  const unsubscribe = appStore.subscribe((state) => {
    webContents.send(shellBridgeChannels.stateChanged, state);
  });

  return (): void => {
    unsubscribe();
    for (const channel of Object.values(shellBridgeChannels)) {
      if (channel === shellBridgeChannels.stateChanged) {
        continue;
      }

      ipcMain.removeHandler(channel);
    }
  };
};

export { registerStoreIpc, type IpcMainLike, type WebContentsLike };
