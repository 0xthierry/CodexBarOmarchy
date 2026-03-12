import type { ProviderActionName, ProviderActionStatus } from "@/core/actions/action-result.ts";
import type {
  LoginActionResult,
  OpenTokenFileActionResult,
  RecoveryActionResult,
  RefreshActionResult,
  ReloadTokenFileActionResult,
} from "@/core/actions/provider-adapter.ts";
import { explicitNull } from "@/core/providers/shared.ts";
import { updateProviderRuntimeState } from '@/core/store/app-store-runtime.ts';
import type { AppStoreRuntime } from '@/core/store/app-store-runtime.ts';
import type { createInitialAppStoreState } from "@/core/store/state.ts";
import type {
  ProviderActionView,
  ProviderRuntimeState,
  ProviderRuntimeStatus,
} from "@/core/store/runtime-state.ts";

type AppStoreState = ReturnType<typeof createInitialAppStoreState>;
type ProviderId = AppStoreState["selectedProviderId"];
type StoreActionResult =
  | LoginActionResult
  | OpenTokenFileActionResult
  | RecoveryActionResult
  | RefreshActionResult
  | ReloadTokenFileActionResult;

const createActionView = <ActionValue extends ProviderActionName>(
  currentActionView: ProviderActionView<ActionValue>,
  status: ProviderActionStatus | "idle" | "running",
  message: string | null,
): ProviderActionView<ActionValue> => ({
  ...currentActionView,
  message,
  status,
});

const createSnapshotWithState = (
  providerRuntimeState: ProviderRuntimeState,
  state: ProviderRuntimeStatus,
  latestError: string | null = providerRuntimeState.snapshot.latestError,
): ProviderRuntimeState["snapshot"] => ({
  ...providerRuntimeState.snapshot,
  latestError,
  state,
});

const resolveRefreshSnapshot = (
  providerRuntimeState: ProviderRuntimeState,
  actionResult: RefreshActionResult,
): ProviderRuntimeState["snapshot"] => {
  if (actionResult.snapshot !== null) {
    return {
      ...actionResult.snapshot,
      latestError:
        actionResult.status === "error" ? actionResult.message : actionResult.snapshot.latestError,
      state: actionResult.status === "error" ? "error" : "ready",
    };
  }

  if (actionResult.status === "error") {
    return createSnapshotWithState(providerRuntimeState, "error", actionResult.message);
  }

  if (actionResult.status === "success") {
    return createSnapshotWithState(providerRuntimeState, "ready", explicitNull);
  }

  return providerRuntimeState.snapshot;
};

const resolveNextSnapshot = (
  providerRuntimeState: ProviderRuntimeState,
  actionResult: StoreActionResult,
): ProviderRuntimeState["snapshot"] => {
  if (actionResult.actionName === "refresh") {
    return resolveRefreshSnapshot(providerRuntimeState, actionResult);
  }

  if (actionResult.status === "error") {
    return createSnapshotWithState(providerRuntimeState, "error", actionResult.message);
  }

  return providerRuntimeState.snapshot;
};

const markProviderActionRunning = (
  runtime: AppStoreRuntime,
  providerId: ProviderId,
  actionName: ProviderActionName,
): AppStoreState =>
  updateProviderRuntimeState(runtime, providerId, (providerRuntimeState) => ({
    ...providerRuntimeState,
    actions: {
      ...providerRuntimeState.actions,
      [actionName]: createActionView(
        providerRuntimeState.actions[actionName],
        "running",
        explicitNull,
      ),
    },
    snapshot:
      actionName === "refresh"
        ? {
            ...providerRuntimeState.snapshot,
            state: "refreshing",
          }
        : providerRuntimeState.snapshot,
  }));

const applyActionResult = (
  runtime: AppStoreRuntime,
  providerId: ProviderId,
  actionResult: StoreActionResult,
): AppStoreState =>
  updateProviderRuntimeState(runtime, providerId, (providerRuntimeState) => ({
    ...providerRuntimeState,
    actions: {
      ...providerRuntimeState.actions,
      [actionResult.actionName]: createActionView(
        providerRuntimeState.actions[actionResult.actionName],
        actionResult.status,
        actionResult.message,
      ),
    },
    snapshot: resolveNextSnapshot(providerRuntimeState, actionResult),
  }));

export { applyActionResult, markProviderActionRunning };
