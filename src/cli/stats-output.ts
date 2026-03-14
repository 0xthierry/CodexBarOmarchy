import type { AppStoreState, ProviderView } from "@/core/store/state.ts";
import { getProviderSnapshotMetrics } from "@/core/store/runtime-state.ts";

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
  enabled: boolean;
  id: ProviderView["id"];
  diagnostics: ProviderView["status"]["diagnostics"];
  identity: ProviderView["status"]["identity"];
  latestError: string | null;
  metrics: ReturnType<typeof getProviderSnapshotMetrics>;
  providerDetails: ProviderView["status"]["providerDetails"];
  serviceStatus: ProviderView["status"]["serviceStatus"];
  selected: boolean;
  settings: StatsProviderSettings;
  sourceLabel: string | null;
  state: ProviderView["status"]["state"];
  updatedAt: string | null;
  usage: ProviderView["status"]["usage"];
  version: string | null;
  accountEmail: string | null;
  planLabel: string | null;
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
  accountEmail: providerView.status.identity.accountEmail,
  diagnostics: providerView.status.diagnostics ?? null,
  enabled: providerView.enabled,
  id: providerView.id,
  identity: providerView.status.identity,
  latestError: providerView.status.latestError,
  metrics: getProviderSnapshotMetrics(providerView.status),
  planLabel: providerView.status.identity.planLabel,
  providerDetails: providerView.status.providerDetails,
  selected: providerView.selected,
  serviceStatus: providerView.status.serviceStatus,
  settings: toStatsProviderSettings(providerView),
  sourceLabel: providerView.status.sourceLabel,
  state: providerView.status.state,
  updatedAt: providerView.status.updatedAt,
  usage: providerView.status.usage,
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
