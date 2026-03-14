import { providerActionNames } from "@/core/actions/action-result.ts";
import type { ProviderActionName } from "@/core/actions/action-result.ts";
import type { ProviderId } from "@/core/providers/provider-id.ts";
import { createProviderMap, explicitNull } from "@/core/providers/shared.ts";
import type { ProviderMap } from "@/core/providers/shared.ts";

const providerRuntimeStatuses = ["idle", "refreshing", "ready", "error"] as const;
const providerViewActionStatuses = ["idle", "running", "success", "error", "unsupported"] as const;
const providerMetricKinds = [
  "session",
  "weekly",
  "sonnet",
  "pro",
  "flash",
  "credits",
  "custom",
] as const;

type ProviderRuntimeStatus = (typeof providerRuntimeStatuses)[number];
type ProviderViewActionStatus = (typeof providerViewActionStatuses)[number];
type ProviderMetricKind = (typeof providerMetricKinds)[number];
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
  kind?: ProviderMetricKind;
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

interface TokenCostAggregateSnapshot {
  costUsd: number | null;
  tokens: number;
  unpricedModels: string[];
}

interface TokenCostDailyPoint {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number | null;
  date: string;
  inputTokens: number;
  modelsUsed: string[];
  outputTokens: number;
  totalTokens: number;
  unpricedModels: string[];
}

interface TokenCostSnapshot {
  daily: TokenCostDailyPoint[];
  last30Days: TokenCostAggregateSnapshot | null;
  today: TokenCostAggregateSnapshot | null;
  updatedAt: string;
}

interface ProviderQuotaBucketSnapshot {
  modelId: string;
  remainingFraction: number;
  resetTime: string | null;
}

interface ProviderRateWindowSnapshot {
  label: string;
  resetAt: string | null;
  usedPercent: number;
}

interface ProviderSourceFailureDiagnosticSnapshot {
  message: string;
  sourceLabel: string;
}

interface ProviderRuntimeDiagnosticsSnapshot {
  sourceFailures: ProviderSourceFailureDiagnosticSnapshot[];
}

interface GeminiQuotaDrilldownSnapshot {
  flashBuckets: ProviderQuotaBucketSnapshot[];
  otherBuckets: ProviderQuotaBucketSnapshot[];
  proBuckets: ProviderQuotaBucketSnapshot[];
}

interface ProviderIncidentSnapshot {
  severity: string | null;
  status: string | null;
  summary: string | null;
  updatedAt: string | null;
}

interface CodexDashboardRateLimitSnapshot {
  label: string;
  remainingPercent: number | null;
  resetAt: string | null;
}

interface CodexCreditHistoryPoint {
  amount: number;
  occurredAt: string;
  type: string | null;
}

interface CodexUsageBreakdownPoint {
  date: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface CodexDashboardSnapshot {
  additionalRateLimits: CodexDashboardRateLimitSnapshot[];
  approximateCreditUsage: {
    cloudMessages: number | null;
    localMessages: number | null;
  } | null;
  codeReviewWindow: CodexDashboardRateLimitSnapshot | null;
  creditHistory: CodexCreditHistoryPoint[];
  purchaseUrl: string | null;
  usageBreakdown: CodexUsageBreakdownPoint[];
}

interface CodexProviderDetailsSnapshot {
  dashboard: CodexDashboardSnapshot | null;
  kind: "codex";
  tokenCost: TokenCostSnapshot | null;
}

interface ClaudeProviderDetailsSnapshot {
  accountOrg: string | null;
  kind: "claude";
  tokenCost: TokenCostSnapshot | null;
}

interface GeminiProviderDetailsSnapshot {
  incidents: ProviderIncidentSnapshot[];
  kind: "gemini";
  quotaDrilldown: GeminiQuotaDrilldownSnapshot | null;
}

type ProviderDetailsSnapshot =
  | ClaudeProviderDetailsSnapshot
  | CodexProviderDetailsSnapshot
  | GeminiProviderDetailsSnapshot;

interface ProviderUsageSnapshot {
  additional: ProviderMetricView[];
  balances: ProviderUsageBalancesSnapshot;
  providerCost: ProviderCostSnapshot | null;
  quotaBuckets: ProviderQuotaBucketSnapshot[];
  rateWindows: ProviderRateWindowSnapshot[];
  windows: ProviderUsageWindowsSnapshot;
}

interface ProviderServiceStatusSnapshot {
  description: string | null;
  indicator: ProviderServiceStatusIndicator;
  updatedAt: string | null;
}

interface ProviderRuntimeSnapshot {
  diagnostics?: ProviderRuntimeDiagnosticsSnapshot | null;
  identity: ProviderIdentitySnapshot;
  latestError: string | null;
  providerDetails: ProviderDetailsSnapshot | null;
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
  providerCost: explicitNull,
  quotaBuckets: [],
  rateWindows: [],
  windows: {
    flash: explicitNull,
    pro: explicitNull,
    session: explicitNull,
    sonnet: explicitNull,
    weekly: explicitNull,
  },
});

const createDefaultProviderRuntimeSnapshot = (): ProviderRuntimeSnapshot => ({
  diagnostics: explicitNull,
  identity: createDefaultProviderIdentitySnapshot(),
  latestError: explicitNull,
  providerDetails: explicitNull,
  serviceStatus: explicitNull,
  sourceLabel: explicitNull,
  state: "idle",
  updatedAt: explicitNull,
  usage: createDefaultProviderUsageSnapshot(),
  version: explicitNull,
});

const getProviderSnapshotMetrics = (
  snapshot: ProviderRuntimeSnapshot,
): readonly ProviderMetricView[] => {
  const metrics: ProviderMetricView[] = [];

  if (snapshot.usage.windows.session !== null) {
    metrics.push(snapshot.usage.windows.session);
  }

  if (snapshot.usage.windows.weekly !== null) {
    metrics.push(snapshot.usage.windows.weekly);
  }

  if (snapshot.usage.windows.sonnet !== null) {
    metrics.push(snapshot.usage.windows.sonnet);
  }

  if (snapshot.usage.windows.pro !== null) {
    metrics.push(snapshot.usage.windows.pro);
  }

  if (snapshot.usage.windows.flash !== null) {
    metrics.push(snapshot.usage.windows.flash);
  }

  if (snapshot.usage.balances.credits !== null) {
    metrics.push(snapshot.usage.balances.credits);
  }

  metrics.push(...snapshot.usage.additional);
  return metrics;
};

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
  providerMetricKinds,
  providerRuntimeStatuses,
  providerServiceStatusIndicators,
  providerViewActionStatuses,
  type ProviderActionView,
  type ProviderActionViewMap,
  type ProviderDetailsSnapshot,
  type ProviderCostSnapshot,
  type ProviderIncidentSnapshot,
  type ProviderIdentitySnapshot,
  type ProviderMetricKind,
  type ProviderMetricView,
  type ProviderRuntimeDiagnosticsSnapshot,
  type ProviderQuotaBucketSnapshot,
  type ProviderRateWindowSnapshot,
  type ProviderRuntimeSnapshot,
  type ProviderRuntimeState,
  type ProviderRuntimeStateMap,
  type ProviderRuntimeStatus,
  type ProviderServiceStatusIndicator,
  type ProviderServiceStatusSnapshot,
  type ProviderSourceFailureDiagnosticSnapshot,
  type ProviderUsageBalancesSnapshot,
  type ProviderUsageSnapshot,
  type ProviderUsageWindowsSnapshot,
  type ProviderViewActionStatus,
  type GeminiQuotaDrilldownSnapshot,
  type TokenCostAggregateSnapshot,
  type TokenCostDailyPoint,
  type TokenCostSnapshot,
  type CodexDashboardSnapshot,
  type CodexDashboardRateLimitSnapshot,
  type CodexCreditHistoryPoint,
  type CodexUsageBreakdownPoint,
};
