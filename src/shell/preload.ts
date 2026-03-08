/* eslint-disable @typescript-eslint/promise-function-async, import/consistent-type-specifier-style, sort-imports */

import { contextBridge, ipcRenderer } from "electron";
import { shellBridgeChannels } from "@/shell/bridge.ts";
import type { AppStoreState, OmarchyBarBridge, ProviderId } from "@/shell/bridge.ts";

const omarchyBarBridge: OmarchyBarBridge = {
  getState: () => ipcRenderer.invoke(shellBridgeChannels.getState),
  loginProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke(shellBridgeChannels.loginProvider, providerId),
  openClaudeTokenFile: () => ipcRenderer.invoke(shellBridgeChannels.openClaudeTokenFile),
  refreshProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke(shellBridgeChannels.refreshProvider, providerId),
  reloadClaudeTokenFile: () => ipcRenderer.invoke(shellBridgeChannels.reloadClaudeTokenFile),
  repairProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke(shellBridgeChannels.repairProvider, providerId),
  selectProvider: (providerId: ProviderId) =>
    ipcRenderer.invoke(shellBridgeChannels.selectProvider, providerId),
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) =>
    ipcRenderer.invoke(shellBridgeChannels.setProviderEnabled, { enabled, providerId }),
  setProviderOrder: (providerOrder: ProviderId[]) =>
    ipcRenderer.invoke(shellBridgeChannels.setProviderOrder, providerOrder),
  startRefreshScheduler: (intervalMs: number) =>
    ipcRenderer.invoke(shellBridgeChannels.startRefreshScheduler, intervalMs),
  stopRefreshScheduler: () => ipcRenderer.invoke(shellBridgeChannels.stopRefreshScheduler),
  subscribe: (listener: (state: AppStoreState) => void) => {
    const subscriptionListener = (_event: unknown, state: AppStoreState): void => {
      listener(state);
    };

    ipcRenderer.on(shellBridgeChannels.stateChanged, subscriptionListener);

    return (): void => {
      ipcRenderer.removeListener(shellBridgeChannels.stateChanged, subscriptionListener);
    };
  },
  updateClaudeConfig: (patch) => ipcRenderer.invoke(shellBridgeChannels.updateClaudeConfig, patch),
  updateCodexConfig: (patch) => ipcRenderer.invoke(shellBridgeChannels.updateCodexConfig, patch),
  updateGeminiConfig: (patch) => ipcRenderer.invoke(shellBridgeChannels.updateGeminiConfig, patch),
};

contextBridge.exposeInMainWorld("omarchyBar", omarchyBarBridge);
