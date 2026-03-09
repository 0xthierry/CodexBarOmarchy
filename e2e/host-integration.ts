import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfigStore } from "../src/core/config/store.ts";
import { createBinaryLocator } from "../src/core/detection/binary-locator.ts";
import {
  claudeCookieSources,
  claudePromptPolicies,
  claudeUsageSources,
} from "../src/core/providers/claude.ts";
import { codexCookieSources, codexUsageSources } from "../src/core/providers/codex.ts";
import { createAppStore } from "../src/core/store/app-store.ts";
import type { AppStoreState } from "../src/core/store/state.ts";
import { createRuntimeProviderAdapters } from "../src/runtime/provider-adapters.ts";
import { createRuntimeHost } from "../src/runtime/node-host.ts";

const providerIds = ["codex", "claude", "gemini"] as const;

type ProviderId = (typeof providerIds)[number];
type ProviderView = AppStoreState["providerViews"][number];

const fail = (message: string): never => {
  throw new Error(message);
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    fail(message);
  }
};

const isProviderId = (value: string): value is ProviderId =>
  value === providerIds[0] || value === providerIds[1] || value === providerIds[2];

const sanitizeTokenAccounts = (
  tokenAccounts: { label: string; token: string }[],
): { label: string; token: string }[] =>
  tokenAccounts.map((account) => ({
    label: account.label,
    token: "[redacted]",
  }));

const parseRequestedProviders = (): ProviderId[] => {
  const args = process.argv.slice(2);
  const providerArg = args.find((value) => value.startsWith("--provider="));

  if (providerArg === undefined) {
    return [...providerIds];
  }

  const rawProviderIds = providerArg
    .slice("--provider=".length)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (rawProviderIds.length === 0) {
    fail("Expected at least one provider in --provider=<codex,claude,gemini>.");
  }

  const selectedProviderIds: ProviderId[] = [];

  for (const providerId of rawProviderIds) {
    if (!isProviderId(providerId)) {
      fail(`Unknown provider "${providerId}". Expected one of: ${providerIds.join(", ")}.`);
    } else {
      selectedProviderIds.push(providerId);
    }
  }

  return selectedProviderIds;
};

const assertExactStringArray = (
  actual: readonly string[],
  expected: readonly string[],
  messagePrefix: string,
): void => {
  assert(
    actual.length === expected.length,
    `${messagePrefix}: expected [${expected.join(", ")}], got [${actual.join(", ")}].`,
  );

  expected.forEach((value, index) => {
    assert(
      actual[index] === value,
      `${messagePrefix}: expected [${expected.join(", ")}], got [${actual.join(", ")}].`,
    );
  });
};

const assertMetricShape = (
  providerId: ProviderId,
  metrics: ProviderView["status"]["metrics"],
): void => {
  assert(metrics.length > 0, `${providerId}: expected at least one metric.`);

  for (const metric of metrics) {
    assert(metric.label.trim() !== "", `${providerId}: metric label must not be empty.`);
    assert(metric.value.trim() !== "", `${providerId}: metric value must not be empty.`);
    assert(
      metric.detail === null || metric.detail.trim() !== "",
      `${providerId}: metric detail must be null or a non-empty string.`,
    );
  }
};

const assertActionState = (
  providerId: ProviderId,
  providerView: ProviderView,
  actionName: keyof ProviderView["actions"],
  expectedSupported: boolean,
): void => {
  const actionView = providerView.actions[actionName];

  assert(
    actionView.supported === expectedSupported,
    `${providerId}: action "${actionName}" support mismatch.`,
  );
  assert(
    actionView.status === "idle" ||
      actionView.status === "running" ||
      actionView.status === "success" ||
      actionView.status === "error" ||
      actionView.status === "unsupported",
    `${providerId}: action "${actionName}" has unexpected status "${actionView.status}".`,
  );
  assert(
    actionView.message === null || actionView.message.trim() !== "",
    `${providerId}: action "${actionName}" message must be null or non-empty.`,
  );
};

const assertSharedProviderView = (providerId: ProviderId, providerView: ProviderView): void => {
  assert(providerView.id === providerId, `${providerId}: provider view id mismatch.`);
  assert(providerView.status.state === "ready", `${providerId}: snapshot state must be ready.`);
  assert(
    providerView.status.updatedAt !== null && providerView.status.updatedAt.trim() !== "",
    `${providerId}: updatedAt must be present after refresh.`,
  );
  assert(
    providerView.status.version === null || providerView.status.version.trim() !== "",
    `${providerId}: version must be null or a non-empty string.`,
  );
  assert(
    providerView.status.accountEmail === null || providerView.status.accountEmail.trim() !== "",
    `${providerId}: accountEmail must be null or a non-empty string.`,
  );
  assert(
    providerView.status.planLabel === null || providerView.status.planLabel.trim() !== "",
    `${providerId}: planLabel must be null or a non-empty string.`,
  );
  assert(
    providerView.status.latestError === null,
    `${providerId}: latestError should be null after a successful refresh.`,
  );
  assertMetricShape(providerId, providerView.status.metrics);

  assertActionState(providerId, providerView, "login", true);
  assertActionState(providerId, providerView, "refresh", true);
  assertActionState(providerId, providerView, "repair", providerId === "claude");
  assertActionState(providerId, providerView, "openTokenFile", providerId === "claude");
  assertActionState(providerId, providerView, "reloadTokenFile", providerId === "claude");

  assert(
    providerView.actions.refresh.status === "success",
    `${providerId}: refresh action should have succeeded.`,
  );
  assert(
    providerView.actions.refresh.message !== null &&
      providerView.actions.refresh.message.trim() !== "",
    `${providerId}: refresh action message must be present.`,
  );
};

const assertCodexProviderView = (providerView: Extract<ProviderView, { id: "codex" }>): void => {
  assertSharedProviderView("codex", providerView);
  assert(
    providerView.status.sourceLabel === "oauth" || providerView.status.sourceLabel === "cli",
    `codex: unexpected source "${providerView.status.sourceLabel ?? "null"}".`,
  );
  assertExactStringArray(
    providerView.settings.availableUsageSources,
    codexUsageSources,
    "codex: unexpected usage source options",
  );
  assertExactStringArray(
    providerView.settings.availableCookieSources,
    codexCookieSources,
    "codex: unexpected cookie source options",
  );
  assert(
    providerView.settings.showCookieSourceControl === providerView.config.extrasEnabled,
    "codex: cookie source visibility must follow extrasEnabled.",
  );
  assert(
    providerView.settings.showManualCookieField ===
      (providerView.config.extrasEnabled && providerView.config.cookieSource === "manual"),
    "codex: manual cookie field visibility is inconsistent with config.",
  );
  assert(
    providerView.status.accountEmail !== null,
    "codex: accountEmail should be present for the UI.",
  );
  assert(providerView.status.planLabel !== null, "codex: planLabel should be present for the UI.");
  assert(providerView.status.version !== null, "codex: version should be present for the UI.");

  const metricLabels = new Set(providerView.status.metrics.map((metric) => metric.label));

  assert(
    metricLabels.has("Session") || metricLabels.has("Weekly") || metricLabels.has("Credits"),
    "codex: expected at least one Codex usage metric.",
  );
};

const assertClaudeProviderView = (providerView: Extract<ProviderView, { id: "claude" }>): void => {
  assertSharedProviderView("claude", providerView);
  assert(
    providerView.status.sourceLabel === "oauth" ||
      providerView.status.sourceLabel === "cli" ||
      providerView.status.sourceLabel === "web" ||
      providerView.status.sourceLabel === "local",
    `claude: unexpected source "${providerView.status.sourceLabel ?? "null"}".`,
  );
  assertExactStringArray(
    providerView.settings.availableUsageSources,
    claudeUsageSources,
    "claude: unexpected usage source options",
  );
  assertExactStringArray(
    providerView.settings.availableCookieSources,
    claudeCookieSources,
    "claude: unexpected cookie source options",
  );
  assertExactStringArray(
    providerView.settings.availablePromptPolicies,
    claudePromptPolicies,
    "claude: unexpected prompt policy options",
  );
  assert(
    providerView.settings.showPromptPolicyControl,
    "claude: prompt policy control should be visible.",
  );
  assert(
    providerView.settings.activeTokenAccountIndex === providerView.config.activeTokenAccountIndex,
    "claude: active token account index mismatch.",
  );
  assert(
    providerView.settings.tokenAccounts.length === providerView.config.tokenAccounts.length,
    "claude: token account count mismatch.",
  );
  assert(providerView.status.planLabel !== null, "claude: planLabel should be present for the UI.");
  assert(providerView.status.version !== null, "claude: version should be present for the UI.");

  const metricLabels = new Set(providerView.status.metrics.map((metric) => metric.label));

  if (providerView.status.sourceLabel === "local") {
    assert(
      providerView.status.accountEmail !== null,
      "claude: local source should expose accountEmail.",
    );
    assert(
      metricLabels.has("Tokens") ||
        metricLabels.has("Messages") ||
        metricLabels.has("Sessions") ||
        metricLabels.has("Tools"),
      "claude: local fallback did not expose local stats metrics.",
    );

    return;
  }

  if (providerView.status.sourceLabel === "oauth" || providerView.status.sourceLabel === "cli") {
    assert(
      providerView.status.accountEmail !== null,
      `claude: ${providerView.status.sourceLabel} should expose accountEmail.`,
    );
  }

  assert(
    metricLabels.has("Session") || metricLabels.has("Weekly") || metricLabels.has("Sonnet"),
    "claude: expected Claude usage window metrics.",
  );
};

const assertGeminiProviderView = (providerView: Extract<ProviderView, { id: "gemini" }>): void => {
  assertSharedProviderView("gemini", providerView);
  assert(
    providerView.status.sourceLabel === "api",
    `gemini: unexpected source "${providerView.status.sourceLabel ?? "null"}".`,
  );
  assert(
    Object.keys(providerView.settings).length === 0,
    "gemini: expected no provider-specific settings.",
  );
  assert(
    providerView.status.accountEmail !== null,
    "gemini: accountEmail should be present for the UI.",
  );
  assert(providerView.status.planLabel !== null, "gemini: planLabel should be present for the UI.");
  assert(providerView.status.version !== null, "gemini: version should be present for the UI.");

  const metricLabels = providerView.status.metrics.map((metric) => metric.label);
  const uniqueMetricLabels = new Set(metricLabels);

  assert(
    metricLabels.length === uniqueMetricLabels.size,
    "gemini: duplicate quota metrics detected.",
  );

  for (const label of uniqueMetricLabels) {
    assert(label === "Pro" || label === "Flash", `gemini: unexpected metric label "${label}".`);
  }
};

const sanitizeProviderView = (providerView: ProviderView): unknown => {
  if (providerView.id === "codex") {
    return {
      actions: providerView.actions,
      config: {
        ...providerView.config,
        cookieHeader: providerView.config.cookieHeader === null ? null : "[redacted]",
      },
      enabled: providerView.enabled,
      id: providerView.id,
      selected: providerView.selected,
      settings: providerView.settings,
      status: providerView.status,
    };
  }

  if (providerView.id === "claude") {
    return {
      actions: providerView.actions,
      config: {
        ...providerView.config,
        tokenAccounts: sanitizeTokenAccounts(providerView.config.tokenAccounts),
      },
      enabled: providerView.enabled,
      id: providerView.id,
      selected: providerView.selected,
      settings: {
        ...providerView.settings,
        tokenAccounts: sanitizeTokenAccounts(providerView.settings.tokenAccounts),
      },
      status: providerView.status,
    };
  }

  return {
    actions: providerView.actions,
    config: providerView.config,
    enabled: providerView.enabled,
    id: providerView.id,
    selected: providerView.selected,
    settings: providerView.settings,
    status: providerView.status,
  };
};

const printAppUiState = (state: AppStoreState): void => {
  console.log(JSON.stringify(state, null, 2));
};

const printProviderView = (_providerId: ProviderId, providerView: ProviderView): void => {
  void sanitizeProviderView(providerView);
};

const getProviderView = (state: AppStoreState, providerId: ProviderId): ProviderView => {
  const providerView = state.providerViews.find((candidate) => candidate.id === providerId);

  if (providerView !== undefined) {
    return providerView;
  }

  throw new Error(`${providerId}: expected provider view in app state.`);
};

const assertAppUiState = (state: AppStoreState): void => {
  assert(
    state.providerViews.length === state.config.providerOrder.length,
    "app-ui: expected one provider view for each provider in config order.",
  );
  assert(
    state.selectedProviderId === state.config.selectedProvider,
    "app-ui: selected provider mismatch.",
  );
  assert(!state.scheduler.active, "app-ui: scheduler should be inactive during host integration.");
  assert(
    state.scheduler.intervalMs === null,
    "app-ui: scheduler interval should be null before the loop starts.",
  );

  for (const providerId of state.enabledProviderIds) {
    const providerView = getProviderView(state, providerId);

    assert(
      providerView.enabled,
      `${providerId}: enabled provider must be marked enabled in its view.`,
    );
  }
};

const main = async (): Promise<void> => {
  const selectedProviderIds = parseRequestedProviders();
  const host = createRuntimeHost();
  const tempDirectoryPath = await mkdtemp(join(tmpdir(), "omarchy-agent-bar-host-integration-"));
  const configStore = createConfigStore({
    filePath: join(tempDirectoryPath, "config.json"),
  });
  const appStore = createAppStore({
    binaryLocator: createBinaryLocator(),
    configStore,
    providerAdapters: createRuntimeProviderAdapters(host),
  });

  try {
    await appStore.initialize({ forceRedetection: true });

    for (const providerId of selectedProviderIds) {
      const refreshResult = await appStore.refreshProvider(providerId);

      assert(
        refreshResult.status === "success",
        `${providerId}: expected success, got ${refreshResult.status}: ${refreshResult.message}`,
      );
      assert(refreshResult.snapshot !== null, `${providerId}: expected refresh snapshot.`);
    }

    const state = appStore.getState();

    assertAppUiState(state);
    printAppUiState(state);

    for (const providerId of selectedProviderIds) {
      const providerView = getProviderView(state, providerId);

      printProviderView(providerId, providerView);

      if (providerView.id === "codex") {
        assertCodexProviderView(providerView);
        continue;
      }

      if (providerView.id === "claude") {
        assertClaudeProviderView(providerView);
        continue;
      }

      assertGeminiProviderView(providerView);
    }
  } finally {
    await rm(tempDirectoryPath, { force: true, recursive: true });
  }
};

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exit(1);
});
