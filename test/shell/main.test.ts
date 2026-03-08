import { expect, test } from "bun:test";
import { startShellSession } from "@/shell/session.ts";
import type { AppStoreState } from "@/shell/bridge.ts";

test("starts a shell session that wires tray clicks to popup toggling", async () => {
  let visible = false;
  let trayClickListener: (() => void) | undefined;
  let initialized = false;
  let ipcHandlersRegistered = false;
  let popupLoaded = false;
  let removedHandlers = 0;

  const session = await startShellSession({
    appStore: {
      getProviderView: () => {
        const providerView = createState().providerViews[0];

        if (providerView === undefined) {
          throw new Error("Expected at least one provider view.");
        }

        return providerView;
      },
      getState: () => createState(),
      initialize: async () => {
        initialized = true;

        return createState();
      },
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
      selectProvider: async () => createState(),
      setClaudeConfig: async () => createState(),
      setCodexConfig: async () => createState(),
      setGeminiConfig: async () => createState(),
      setProviderEnabled: async () => createState(),
      setProviderOrder: async () => createState(),
      startRefreshScheduler: () => createState(),
      stopRefreshScheduler: () => createState(),
      subscribe: () => () => {},
    },
    createPopupWindow: () => ({
      center: () => {},
      focus: () => {},
      hide: () => {
        visible = false;
      },
      isVisible: () => visible,
      loadFile: async () => {},
      on: () => {},
      show: () => {
        visible = true;
      },
      webContents: {
        send: () => {},
      },
    }),
    createTray: () => ({
      on: (_eventName, listener) => {
        trayClickListener = listener;
      },
      setToolTip: () => {},
    }),
    ipcMain: {
      handle: () => {
        ipcHandlersRegistered = true;
      },
      removeHandler: () => {
        removedHandlers += 1;
      },
    },
    loadPopupWindow: async () => {
      expect(ipcHandlersRegistered).toBe(true);
      popupLoaded = true;
    },
  });

  expect(initialized).toBe(true);
  expect(popupLoaded).toBe(true);
  expect(visible).toBe(false);

  const firstClickListener = trayClickListener;

  if (firstClickListener !== undefined) {
    firstClickListener();
  }
  expect(session.popupController.isVisible()).toBe(true);

  const secondClickListener = trayClickListener;

  if (secondClickListener !== undefined) {
    secondClickListener();
  }
  expect(session.popupController.isVisible()).toBe(false);

  session.dispose();
  expect(removedHandlers).toBeGreaterThan(0);
});

const createState = (): AppStoreState => ({
  config: {
    providerOrder: ["codex", "claude", "gemini"],
    providers: {
      claude: {
        activeTokenAccountIndex: 0,
        cookieSource: "auto",
        enabled: true,
        oauthPromptFreeCredentialsEnabled: false,
        oauthPromptPolicy: "only_on_user_action",
        source: "auto",
        tokenAccounts: [],
      },
      codex: {
        cookieHeader: null,
        cookieSource: "off",
        enabled: true,
        extrasEnabled: false,
        historicalTrackingEnabled: true,
        source: "auto",
      },
      gemini: {
        enabled: true,
      },
    },
    selectedProvider: "codex",
    version: 1,
  },
  enabledProviderIds: ["codex", "claude", "gemini"],
  providerViews: [
    {
      actions: {
        login: { actionName: "login", message: null, status: "idle", supported: true },
        openTokenFile: {
          actionName: "openTokenFile",
          message: null,
          status: "idle",
          supported: false,
        },
        refresh: { actionName: "refresh", message: null, status: "idle", supported: true },
        reloadTokenFile: {
          actionName: "reloadTokenFile",
          message: null,
          status: "idle",
          supported: false,
        },
        repair: { actionName: "repair", message: null, status: "idle", supported: false },
      },
      config: {
        cookieHeader: null,
        cookieSource: "off",
        enabled: true,
        extrasEnabled: false,
        historicalTrackingEnabled: true,
        source: "auto",
      },
      enabled: true,
      id: "codex",
      selected: true,
      settings: {
        availableCookieSources: ["auto", "manual", "off"],
        availableUsageSources: ["auto", "oauth", "cli"],
        showCookieSourceControl: false,
        showManualCookieField: false,
      },
      status: {
        accountEmail: null,
        latestError: null,
        metrics: [],
        planLabel: null,
        sourceLabel: null,
        state: "idle",
        updatedAt: null,
        version: null,
      },
    },
  ],
  scheduler: {
    active: false,
    intervalMs: null,
  },
  selectedProviderId: "codex",
});
