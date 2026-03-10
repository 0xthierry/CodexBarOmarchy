import { providerActionNames } from "@/core/actions/action-result.ts";
import type { ProviderActionName } from "@/core/actions/action-result.ts";
import type { ProviderId } from "@/core/providers/provider-id.ts";
import { createProviderMap, explicitNull } from "@/core/providers/shared.ts";
import type { ProviderMap } from "@/core/providers/shared.ts";

const providerRuntimeStatuses = ["idle", "refreshing", "ready", "error"] as const;
const providerViewActionStatuses = ["idle", "running", "success", "error", "unsupported"] as const;

type ProviderRuntimeStatus = (typeof providerRuntimeStatuses)[number];
type ProviderViewActionStatus = (typeof providerViewActionStatuses)[number];
const providerServiceStatusIndicators = [
  "none",
  "maintenance",
  "minor",
  "major",
  "critical",
  "unknown",
] as const;

type ProviderServiceStatusIndicator = (typeof providerServiceStatusIndicators)[number];

interface ProviderMetricView {
  detail: string | null;
  label: string;
  value: string;
}

interface ProviderIdentitySnapshot {
  accountEmail: string | null;
  planLabel: string | null;
}

interface ProviderUsageWindowsSnapshot {
  flash: ProviderMetricView | null;
  pro: ProviderMetricView | null;
  session: ProviderMetricView | null;
  sonnet: ProviderMetricView | null;
  weekly: ProviderMetricView | null;
}

interface ProviderUsageBalancesSnapshot {
  credits: ProviderMetricView | null;
}

interface ProviderCostSnapshot {
  currencyCode: string;
  limit: number;
  periodLabel: string | null;
  resetsAt: string | null;
  updatedAt: string | null;
  used: number;
}

interface ProviderQuotaBucketSnapshot {
  modelId: string;
  remainingFraction: number;
  resetTime: string | null;
}

interface ProviderUsageSnapshot {
  additional: ProviderMetricView[];
  balances: ProviderUsageBalancesSnapshot;
  displayMetrics: ProviderMetricView[];
  providerCost: ProviderCostSnapshot | null;
  quotaBuckets: ProviderQuotaBucketSnapshot[];
  windows: ProviderUsageWindowsSnapshot;
}

interface ProviderServiceStatusSnapshot {
  description: string | null;
  indicator: ProviderServiceStatusIndicator;
  updatedAt: string | null;
}

interface ProviderRuntimeSnapshot {
  identity: ProviderIdentitySnapshot;
  latestError: string | null;
  serviceStatus: ProviderServiceStatusSnapshot | null;
  sourceLabel: string | null;
  state: ProviderRuntimeStatus;
  updatedAt: string | null;
  usage: ProviderUsageSnapshot;
  version: string | null;
}

interface ProviderActionView<ActionValue extends ProviderActionName> {
  actionName: ActionValue;
  message: string | null;
  status: ProviderViewActionStatus;
  supported: boolean;
}

type ProviderActionViewMap = {
  [ActionValue in ProviderActionName]: ProviderActionView<ActionValue>;
};

interface ProviderRuntimeState {
  actions: ProviderActionViewMap;
  snapshot: ProviderRuntimeSnapshot;
}

type ProviderRuntimeStateMap = ProviderMap<ProviderRuntimeState>;

const isProviderActionSupported = (
  providerId: ProviderId,
  actionName: ProviderActionName,
): boolean => {
  if (
    actionName === "repair" ||
    actionName === "openTokenFile" ||
    actionName === "reloadTokenFile"
  ) {
    return providerId === "claude";
  }

  return true;
};

const createDefaultProviderIdentitySnapshot = (): ProviderIdentitySnapshot => ({
  accountEmail: explicitNull,
  planLabel: explicitNull,
});

const createDefaultProviderUsageSnapshot = (): ProviderUsageSnapshot => ({
  additional: [],
  balances: {
    credits: explicitNull,
  },
  displayMetrics: [],
  providerCost: explicitNull,
  quotaBuckets: [],
  windows: {
    flash: explicitNull,
    pro: explicitNull,
    session: explicitNull,
    sonnet: explicitNull,
    weekly: explicitNull,
  },
});

const createDefaultProviderRuntimeSnapshot = (): ProviderRuntimeSnapshot => ({
  identity: createDefaultProviderIdentitySnapshot(),
  latestError: explicitNull,
  serviceStatus: explicitNull,
  sourceLabel: explicitNull,
  state: "idle",
  updatedAt: explicitNull,
  usage: createDefaultProviderUsageSnapshot(),
  version: explicitNull,
});

const getProviderSnapshotMetrics = (
  snapshot: ProviderRuntimeSnapshot,
): readonly ProviderMetricView[] => snapshot.usage.displayMetrics;

const createDefaultProviderActionView = <ActionValue extends ProviderActionName>(
  providerId: ProviderId,
  actionName: ActionValue,
): ProviderActionView<ActionValue> => ({
  actionName,
  message: explicitNull,
  status: "idle",
  supported: isProviderActionSupported(providerId, actionName),
});

const createProviderActionViewMap = (providerId: ProviderId): ProviderActionViewMap => ({
  login: createDefaultProviderActionView(providerId, "login"),
  openTokenFile: createDefaultProviderActionView(providerId, "openTokenFile"),
  refresh: createDefaultProviderActionView(providerId, "refresh"),
  reloadTokenFile: createDefaultProviderActionView(providerId, "reloadTokenFile"),
  repair: createDefaultProviderActionView(providerId, "repair"),
});

const createDefaultProviderRuntimeState = (providerId: ProviderId): ProviderRuntimeState => ({
  actions: createProviderActionViewMap(providerId),
  snapshot: createDefaultProviderRuntimeSnapshot(),
});

const createDefaultProviderRuntimeStateMap = (): ProviderRuntimeStateMap =>
  createProviderMap((providerId) => createDefaultProviderRuntimeState(providerId));

export {
  createDefaultProviderRuntimeSnapshot,
  createDefaultProviderRuntimeState,
  createDefaultProviderRuntimeStateMap,
  getProviderSnapshotMetrics,
  isProviderActionSupported,
  providerActionNames,
  providerRuntimeStatuses,
  providerServiceStatusIndicators,
  providerViewActionStatuses,
  type ProviderActionView,
  type ProviderActionViewMap,
  type ProviderCostSnapshot,
  type ProviderIdentitySnapshot,
  type ProviderMetricView,
  type ProviderQuotaBucketSnapshot,
  type ProviderRuntimeSnapshot,
  type ProviderRuntimeState,
  type ProviderRuntimeStateMap,
  type ProviderRuntimeStatus,
  type ProviderServiceStatusIndicator,
  type ProviderServiceStatusSnapshot,
  type ProviderUsageBalancesSnapshot,
  type ProviderUsageSnapshot,
  type ProviderUsageWindowsSnapshot,
  type ProviderViewActionStatus,
};
