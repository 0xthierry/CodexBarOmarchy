import type { AppStore } from "@/core/store/app-store.ts";

type AppStoreState = ReturnType<AppStore["getState"]>;
type ProviderId = AppStoreState["selectedProviderId"];

type CodexConfigPatch = Partial<AppStoreState["config"]["providers"]["codex"]>;
type ClaudeConfigPatch = Partial<AppStoreState["config"]["providers"]["claude"]>;
type GeminiConfigPatch = Partial<AppStoreState["config"]["providers"]["gemini"]>;
type LoginActionResult = Awaited<ReturnType<AppStore["loginProvider"]>>;
type OpenTokenFileActionResult = Awaited<ReturnType<AppStore["openClaudeTokenFile"]>>;
type RecoveryActionResult = Awaited<ReturnType<AppStore["repairProvider"]>>;
type RefreshActionResult = Awaited<ReturnType<AppStore["refreshProvider"]>>;
type ReloadTokenFileActionResult = Awaited<ReturnType<AppStore["reloadClaudeTokenFile"]>>;

const shellBridgeChannels = {
  getState: "omarchy-agent-bar:get-state",
  loginProvider: "omarchy-agent-bar:login-provider",
  openClaudeTokenFile: "omarchy-agent-bar:open-claude-token-file",
  refreshProvider: "omarchy-agent-bar:refresh-provider",
  reloadClaudeTokenFile: "omarchy-agent-bar:reload-claude-token-file",
  repairProvider: "omarchy-agent-bar:repair-provider",
  selectProvider: "omarchy-agent-bar:select-provider",
  setProviderEnabled: "omarchy-agent-bar:set-provider-enabled",
  setProviderOrder: "omarchy-agent-bar:set-provider-order",
  startRefreshScheduler: "omarchy-agent-bar:start-refresh-scheduler",
  stateChanged: "omarchy-agent-bar:state-changed",
  stopRefreshScheduler: "omarchy-agent-bar:stop-refresh-scheduler",
  updateClaudeConfig: "omarchy-agent-bar:update-claude-config",
  updateCodexConfig: "omarchy-agent-bar:update-codex-config",
  updateGeminiConfig: "omarchy-agent-bar:update-gemini-config",
} as const;

interface OmarchyBarBridge {
  getState: () => Promise<AppStoreState>;
  loginProvider: (providerId: ProviderId) => Promise<LoginActionResult>;
  openClaudeTokenFile: () => Promise<OpenTokenFileActionResult>;
  refreshProvider: (providerId: ProviderId) => Promise<RefreshActionResult>;
  reloadClaudeTokenFile: () => Promise<ReloadTokenFileActionResult>;
  repairProvider: (providerId: ProviderId) => Promise<RecoveryActionResult>;
  selectProvider: (providerId: ProviderId) => Promise<AppStoreState>;
  setProviderEnabled: (providerId: ProviderId, enabled: boolean) => Promise<AppStoreState>;
  setProviderOrder: (providerOrder: ProviderId[]) => Promise<AppStoreState>;
  startRefreshScheduler: (intervalMs: number) => Promise<AppStoreState>;
  stopRefreshScheduler: () => Promise<AppStoreState>;
  subscribe: (listener: (state: AppStoreState) => void) => () => void;
  updateClaudeConfig: (patch: ClaudeConfigPatch) => Promise<AppStoreState>;
  updateCodexConfig: (patch: CodexConfigPatch) => Promise<AppStoreState>;
  updateGeminiConfig: (patch: GeminiConfigPatch) => Promise<AppStoreState>;
}

export {
  shellBridgeChannels,
  type AppStoreState,
  type ClaudeConfigPatch,
  type CodexConfigPatch,
  type GeminiConfigPatch,
  type OmarchyBarBridge,
  type ProviderId,
};
