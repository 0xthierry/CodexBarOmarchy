import type { AppStoreState, ProviderView } from "@/core/store/state.ts";

interface ClaudeStatsSettings {
  activeTokenAccountIndex: number;
  tokenAccountLabels: string[];
}

interface CodexStatsSettings {
  showCookieSourceControl: boolean;
  showManualCookieField: boolean;
}

interface GeminiStatsSettings {}

type StatsProviderSettings = ClaudeStatsSettings | CodexStatsSettings | GeminiStatsSettings;

interface StatsProviderSnapshot {
  accountEmail: string | null;
  enabled: boolean;
  id: ProviderView["id"];
  latestError: string | null;
  metrics: ProviderView["status"]["metrics"];
  planLabel: string | null;
  selected: boolean;
  settings: StatsProviderSettings;
  sourceLabel: string | null;
  state: ProviderView["status"]["state"];
  updatedAt: string | null;
  version: string | null;
}

interface StatsSnapshot {
  enabledProviderIds: AppStoreState["enabledProviderIds"];
  generatedAt: string;
  providers: StatsProviderSnapshot[];
  selectedProviderId: AppStoreState["selectedProviderId"];
}

const toStatsProviderSettings = (providerView: ProviderView): StatsProviderSettings => {
  if (providerView.id === "claude") {
    return {
      activeTokenAccountIndex: providerView.settings.activeTokenAccountIndex,
      tokenAccountLabels: providerView.settings.tokenAccounts.map(
        (tokenAccount) => tokenAccount.label,
      ),
    };
  }

  if (providerView.id === "codex") {
    return {
      showCookieSourceControl: providerView.settings.showCookieSourceControl,
      showManualCookieField: providerView.settings.showManualCookieField,
    };
  }

  return {};
};

const toStatsProviderSnapshot = (providerView: ProviderView): StatsProviderSnapshot => ({
  accountEmail: providerView.status.accountEmail,
  enabled: providerView.enabled,
  id: providerView.id,
  latestError: providerView.status.latestError,
  metrics: providerView.status.metrics,
  planLabel: providerView.status.planLabel,
  selected: providerView.selected,
  settings: toStatsProviderSettings(providerView),
  sourceLabel: providerView.status.sourceLabel,
  state: providerView.status.state,
  updatedAt: providerView.status.updatedAt,
  version: providerView.status.version,
});

const createStatsSnapshot = (state: AppStoreState, now: Date = new Date()): StatsSnapshot => ({
  enabledProviderIds: state.enabledProviderIds,
  generatedAt: now.toISOString(),
  providers: state.providerViews.map(toStatsProviderSnapshot),
  selectedProviderId: state.selectedProviderId,
});

export { createStatsSnapshot };
export type { StatsProviderSnapshot, StatsSnapshot };
