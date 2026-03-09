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

const providerIds = ["codex", "claude", "gemini"] as const;

const applyConfigPatch = <ValueType extends object>(
  currentValue: ValueType,
  patch: Partial<ValueType>,
): ValueType => ({
  ...currentValue,
  ...patch,
});

const createInvalidPayloadError = (channel: string): TypeError =>
  new TypeError(`Invalid payload for IPC channel "${channel}".`);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isProviderId = (value: unknown): value is AppStoreState["selectedProviderId"] =>
  typeof value === "string" && providerIds.some((providerId) => providerId === value);

const isProviderIdArray = (value: unknown): value is AppStoreState["selectedProviderId"][] =>
  Array.isArray(value) && value.every((providerId) => isProviderId(providerId));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSetProviderEnabledPayload = (
  value: unknown,
): value is { enabled: boolean; providerId: AppStoreState["selectedProviderId"] } =>
  isRecord(value) && typeof value["enabled"] === "boolean" && isProviderId(value["providerId"]);

const isClaudeConfigPatch = (
  value: unknown,
): value is Partial<AppStoreState["config"]["providers"]["claude"]> => isRecord(value);

const isCodexConfigPatch = (
  value: unknown,
): value is Partial<AppStoreState["config"]["providers"]["codex"]> => isRecord(value);

const isGeminiConfigPatch = (
  value: unknown,
): value is Partial<AppStoreState["config"]["providers"]["gemini"]> => isRecord(value);

const registerStoreIpc = (
  ipcMain: IpcMainLike,
  webContents: WebContentsLike,
  appStore: AppStore,
): (() => void) => {
  const registerHandler = <ResultType>(
    channel: string,
    listener: (_payload: unknown) => Promise<ResultType> | ResultType,
  ): void => {
    ipcMain.handle(channel, (_event, payload) => listener(payload));
  };

  ipcMain.handle(shellBridgeChannels.getState, () => appStore.getState());
  registerHandler(shellBridgeChannels.loginProvider, (providerId) => {
    if (!isProviderId(providerId)) {
      throw createInvalidPayloadError(shellBridgeChannels.loginProvider);
    }

    return appStore.loginProvider(providerId);
  });
  registerHandler(shellBridgeChannels.openClaudeTokenFile, () => appStore.openClaudeTokenFile());
  registerHandler(shellBridgeChannels.refreshProvider, (providerId) => {
    if (!isProviderId(providerId)) {
      throw createInvalidPayloadError(shellBridgeChannels.refreshProvider);
    }

    return appStore.refreshProvider(providerId);
  });
  registerHandler(shellBridgeChannels.reloadClaudeTokenFile, () =>
    appStore.reloadClaudeTokenFile(),
  );
  registerHandler(shellBridgeChannels.repairProvider, (providerId) => {
    if (!isProviderId(providerId)) {
      throw createInvalidPayloadError(shellBridgeChannels.repairProvider);
    }

    return appStore.repairProvider(providerId);
  });
  registerHandler(shellBridgeChannels.selectProvider, (providerId) => {
    if (!isProviderId(providerId)) {
      throw createInvalidPayloadError(shellBridgeChannels.selectProvider);
    }

    return appStore.selectProvider(providerId);
  });
  registerHandler(shellBridgeChannels.setProviderEnabled, (payload) => {
    if (!isSetProviderEnabledPayload(payload)) {
      throw createInvalidPayloadError(shellBridgeChannels.setProviderEnabled);
    }

    return appStore.setProviderEnabled(payload.providerId, payload.enabled);
  });
  registerHandler(shellBridgeChannels.setProviderOrder, (providerOrder) => {
    if (!isProviderIdArray(providerOrder)) {
      throw createInvalidPayloadError(shellBridgeChannels.setProviderOrder);
    }

    return appStore.setProviderOrder(providerOrder);
  });
  registerHandler(shellBridgeChannels.startRefreshScheduler, (intervalMs) => {
    if (!isFiniteNumber(intervalMs)) {
      throw createInvalidPayloadError(shellBridgeChannels.startRefreshScheduler);
    }

    return appStore.startRefreshScheduler(intervalMs);
  });
  registerHandler(shellBridgeChannels.stopRefreshScheduler, () => appStore.stopRefreshScheduler());
  registerHandler(shellBridgeChannels.updateClaudeConfig, (patch) => {
    if (!isClaudeConfigPatch(patch)) {
      throw createInvalidPayloadError(shellBridgeChannels.updateClaudeConfig);
    }

    return appStore.setClaudeConfig((providerConfig) => applyConfigPatch(providerConfig, patch));
  });
  registerHandler(shellBridgeChannels.updateCodexConfig, (patch) => {
    if (!isCodexConfigPatch(patch)) {
      throw createInvalidPayloadError(shellBridgeChannels.updateCodexConfig);
    }

    return appStore.setCodexConfig((providerConfig) => applyConfigPatch(providerConfig, patch));
  });
  registerHandler(shellBridgeChannels.updateGeminiConfig, (patch) => {
    if (!isGeminiConfigPatch(patch)) {
      throw createInvalidPayloadError(shellBridgeChannels.updateGeminiConfig);
    }

    return appStore.setGeminiConfig((providerConfig) => applyConfigPatch(providerConfig, patch));
  });

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
