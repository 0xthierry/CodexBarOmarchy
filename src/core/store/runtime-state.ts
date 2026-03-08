/* eslint-disable import/consistent-type-specifier-style, no-duplicate-imports, sort-imports */

import { providerActionNames } from "@/core/actions/action-result.ts";
import type { ProviderActionName } from "@/core/actions/action-result.ts";
import type { ProviderId } from "@/core/providers/provider-id.ts";
import { createProviderMap, explicitNull } from "@/core/providers/shared.ts";
import type { ProviderMap } from "@/core/providers/shared.ts";

const providerRuntimeStatuses = ["idle", "refreshing", "ready", "error"] as const;
const providerViewActionStatuses = ["idle", "running", "success", "error", "unsupported"] as const;

type ProviderRuntimeStatus = (typeof providerRuntimeStatuses)[number];
type ProviderViewActionStatus = (typeof providerViewActionStatuses)[number];

interface ProviderMetricView {
  detail: string | null;
  label: string;
  value: string;
}

interface ProviderRuntimeSnapshot {
  accountEmail: string | null;
  latestError: string | null;
  metrics: ProviderMetricView[];
  planLabel: string | null;
  sourceLabel: string | null;
  state: ProviderRuntimeStatus;
  updatedAt: string | null;
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

const createDefaultProviderRuntimeSnapshot = (): ProviderRuntimeSnapshot => ({
  accountEmail: explicitNull,
  latestError: explicitNull,
  metrics: [],
  planLabel: explicitNull,
  sourceLabel: explicitNull,
  state: "idle",
  updatedAt: explicitNull,
  version: explicitNull,
});

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
  isProviderActionSupported,
  providerActionNames,
  providerRuntimeStatuses,
  providerViewActionStatuses,
  type ProviderActionView,
  type ProviderActionViewMap,
  type ProviderMetricView,
  type ProviderRuntimeSnapshot,
  type ProviderRuntimeState,
  type ProviderRuntimeStateMap,
  type ProviderRuntimeStatus,
  type ProviderViewActionStatus,
};
