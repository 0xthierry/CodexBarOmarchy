import type {
  AppStoreState,
  ClaudeConfigPatch,
  CodexConfigPatch,
  GeminiConfigPatch,
  OmarchyBarBridge,
  ProviderId,
} from "@/shell/bridge.ts";
import {
  claudeCookieSources,
  claudePromptPolicies,
  claudeUsageSources,
} from "@/core/providers/claude.ts";
import { codexCookieSources, codexUsageSources } from "@/core/providers/codex.ts";
import {
  defaultRefreshSchedulerIntervalMs,
  minimumRefreshSchedulerIntervalMs,
  normalizeRefreshSchedulerIntervalMs,
} from "@/core/store/scheduler.ts";
const providerIds = ["codex", "claude", "gemini"] as const;

type ClaudeTokenAction = "open" | "reload" | "remove";
type ProviderAction = "login" | "refresh" | "repair";
type ProviderConfigUpdate =
  | {
      patch: ClaudeConfigPatch;
      providerId: "claude";
    }
  | {
      patch: CodexConfigPatch;
      providerId: "codex";
    }
  | {
      patch: GeminiConfigPatch;
      providerId: "gemini";
    };
type SchedulerAction = "start" | "stop";
type FormFieldElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const formatOptionalValue = (value: string | null): string => {
  if (value === null || value === "") {
    return "Unavailable";
  }

  return escapeHtml(value);
};

const renderMetricRows = (
  metrics: AppStoreState["providerViews"][number]["status"]["metrics"],
): string => {
  if (metrics.length === 0) {
    return '<p class="empty">No metrics loaded yet.</p>';
  }

  return metrics
    .map(
      (metric) => `
        <div class="metric-row">
          <span>${escapeHtml(metric.label)}</span>
          <strong>${escapeHtml(metric.value)}</strong>
          <small>${formatOptionalValue(metric.detail)}</small>
        </div>
      `,
    )
    .join("");
};

const renderProviderManagement = (state: AppStoreState): string =>
  state.config.providerOrder
    .map((providerId, index) => {
      const providerView = state.providerViews.find((candidate) => candidate.id === providerId);

      if (providerView === undefined) {
        return "";
      }

      return `
        <div class="provider-order-row">
          <label>
            <input
              data-provider-enabled="${providerId}"
              type="checkbox"
              ${providerView.enabled ? "checked" : ""}
            />
            <span>${escapeHtml(providerId)}</span>
          </label>
          <div class="provider-order-actions">
            <button data-move-provider="${providerId}" data-direction="up" ${
              index === 0 ? "disabled" : ""
            }>Up</button>
            <button data-move-provider="${providerId}" data-direction="down" ${
              index === state.config.providerOrder.length - 1 ? "disabled" : ""
            }>Down</button>
          </div>
        </div>
      `;
    })
    .join("");

const renderCodexSettings = (
  providerView: Extract<AppStoreState["providerViews"][number], { id: "codex" }>,
): string => `
  <label>
    Usage source
    <select data-provider-config="codex" data-config-key="source">
      ${providerView.settings.availableUsageSources
        .map(
          (value) =>
            `<option value="${value}" ${providerView.config.source === value ? "selected" : ""}>${value}</option>`,
        )
        .join("")}
    </select>
  </label>
  <label>
    <input
      data-provider-config="codex"
      data-config-key="extrasEnabled"
      type="checkbox"
      ${providerView.config.extrasEnabled ? "checked" : ""}
    />
    OpenAI web extras
  </label>
  ${
    providerView.settings.showCookieSourceControl
      ? `
        <label>
          OpenAI cookies
          <select data-provider-config="codex" data-config-key="cookieSource">
            ${providerView.settings.availableCookieSources
              .map(
                (value) =>
                  `<option value="${value}" ${providerView.config.cookieSource === value ? "selected" : ""}>${value}</option>`,
              )
              .join("")}
          </select>
        </label>
      `
      : ""
  }
  ${
    providerView.settings.showManualCookieField
      ? `
        <label>
          Manual cookie header
          <textarea data-provider-config="codex" data-config-key="cookieHeader">${providerView.config.cookieHeader ?? ""}</textarea>
        </label>
      `
      : ""
  }
  <label>
    <input
      data-provider-config="codex"
      data-config-key="historicalTrackingEnabled"
      type="checkbox"
      ${providerView.config.historicalTrackingEnabled ? "checked" : ""}
    />
    Historical tracking
  </label>
`;

const renderClaudeSettings = (
  providerView: Extract<AppStoreState["providerViews"][number], { id: "claude" }>,
): string => `
  <label>
    Usage source
    <select data-provider-config="claude" data-config-key="source">
      ${providerView.settings.availableUsageSources
        .map(
          (value) =>
            `<option value="${value}" ${providerView.config.source === value ? "selected" : ""}>${value}</option>`,
        )
        .join("")}
    </select>
  </label>
  <label>
    Claude cookies
    <select data-provider-config="claude" data-config-key="cookieSource">
      ${providerView.settings.availableCookieSources
        .map(
          (value) =>
            `<option value="${value}" ${providerView.config.cookieSource === value ? "selected" : ""}>${value}</option>`,
        )
        .join("")}
    </select>
  </label>
  ${
    providerView.settings.showPromptPolicyControl
      ? `
        <label>
          Prompt policy
          <select data-provider-config="claude" data-config-key="oauthPromptPolicy">
            ${providerView.settings.availablePromptPolicies
              .map(
                (value) =>
                  `<option value="${value}" ${providerView.config.oauthPromptPolicy === value ? "selected" : ""}>${value}</option>`,
              )
              .join("")}
          </select>
        </label>
      `
      : ""
  }
  <label>
    <input
      data-provider-config="claude"
      data-config-key="oauthPromptFreeCredentialsEnabled"
      type="checkbox"
      ${providerView.config.oauthPromptFreeCredentialsEnabled ? "checked" : ""}
    />
    Avoid prompt interruptions
  </label>
  <label>
    Token account
    <select id="claude-token-account-select">
      ${providerView.settings.tokenAccounts
        .map(
          (account, index) =>
            `<option value="${index}" ${providerView.settings.activeTokenAccountIndex === index ? "selected" : ""}>${escapeHtml(account.label)}</option>`,
        )
        .join("")}
    </select>
  </label>
  <div class="token-actions">
    <button data-claude-token-action="open">Open token file</button>
    <button data-claude-token-action="reload">Reload token file</button>
    <button data-claude-token-action="remove" ${
      providerView.settings.tokenAccounts.length === 0 ? "disabled" : ""
    }>Remove selected</button>
  </div>
  <form id="claude-token-form">
    <input id="claude-token-label" name="label" placeholder="Label" required type="text" />
    <input id="claude-token-value" name="token" placeholder="Token" required type="password" />
    <button type="submit">Add account</button>
  </form>
`;

const renderProviderSettings = (providerView: AppStoreState["providerViews"][number]): string => {
  if (providerView.id === "codex") {
    return renderCodexSettings(providerView);
  }

  if (providerView.id === "claude") {
    return renderClaudeSettings(providerView);
  }

  return '<p class="empty">Gemini uses shared controls only.</p>';
};

const renderProviderActions = (providerView: AppStoreState["providerViews"][number]): string => `
  <div class="toolbar">
    <label class="toggle">
      <input
        data-provider-enabled="${providerView.id}"
        type="checkbox"
        ${providerView.enabled ? "checked" : ""}
      />
      Enabled
    </label>
    <button data-provider-action="refresh" data-provider-id="${providerView.id}">Refresh</button>
    <button data-provider-action="login" data-provider-id="${providerView.id}">Login</button>
    ${
      providerView.actions.repair.supported
        ? `<button data-provider-action="repair" data-provider-id="${providerView.id}">Repair</button>`
        : ""
    }
  </div>
`;

const renderProviderCard = (providerView: AppStoreState["providerViews"][number]): string => `
  <section class="provider-card">
    <header>
      <div>
        <h2>${escapeHtml(providerView.id)}</h2>
        <p class="muted">State: ${escapeHtml(providerView.status.state)}</p>
      </div>
      ${renderProviderActions(providerView)}
    </header>
    <dl class="info-grid">
      <div><dt>Source</dt><dd>${formatOptionalValue(providerView.status.sourceLabel)}</dd></div>
      <div><dt>Version</dt><dd>${formatOptionalValue(providerView.status.version)}</dd></div>
      <div><dt>Updated</dt><dd>${formatOptionalValue(providerView.status.updatedAt)}</dd></div>
      <div><dt>Account</dt><dd>${formatOptionalValue(providerView.status.accountEmail)}</dd></div>
      <div><dt>Plan</dt><dd>${formatOptionalValue(providerView.status.planLabel)}</dd></div>
      <div><dt>Error</dt><dd>${formatOptionalValue(providerView.status.latestError)}</dd></div>
    </dl>
    <section class="metrics">
      <h3>Metrics</h3>
      ${renderMetricRows(providerView.status.metrics)}
    </section>
    <section class="settings">
      <h3>Settings</h3>
      ${renderProviderSettings(providerView)}
    </section>
  </section>
`;

const getEnabledProviderViews = (state: AppStoreState): AppStoreState["providerViews"] =>
  state.enabledProviderIds.flatMap((providerId) => {
    const providerView = state.providerViews.find((candidate) => candidate.id === providerId);

    return providerView === undefined ? [] : [providerView];
  });

const getSelectedProviderView = (
  state: AppStoreState,
): AppStoreState["providerViews"][number] | undefined => {
  const enabledProviderViews = getEnabledProviderViews(state);

  return (
    enabledProviderViews.find((providerView) => providerView.id === state.selectedProviderId) ??
    enabledProviderViews[0]
  );
};

const renderAppMarkup = (state: AppStoreState): string => {
  const selectedProviderView = getSelectedProviderView(state);
  const switcherMarkup = state.enabledProviderIds
    .map(
      (providerId) => `
        <button
          class="${providerId === state.selectedProviderId ? "selected" : ""}"
          data-select-provider="${providerId}"
        >
          ${escapeHtml(providerId)}
        </button>
      `,
    )
    .join("");

  return `
    <div class="popup-shell">
      <header class="popup-header">
        <div>
          <h1>Omarchy Agent Bar</h1>
          <p>Tray overview for Codex, Claude, and Gemini.</p>
        </div>
        <div class="scheduler-controls">
          <input id="scheduler-interval" min="${minimumRefreshSchedulerIntervalMs}" step="${minimumRefreshSchedulerIntervalMs}" type="number" value="${
            state.scheduler.intervalMs ?? defaultRefreshSchedulerIntervalMs
          }" />
          <button data-scheduler-action="${state.scheduler.active ? "stop" : "start"}">
            ${state.scheduler.active ? "Stop refresh loop" : "Start refresh loop"}
          </button>
        </div>
      </header>
      <nav class="provider-switcher">${switcherMarkup}</nav>
      ${
        selectedProviderView === undefined
          ? '<p class="empty">No enabled providers. Enable a provider below to see its details.</p>'
          : renderProviderCard(selectedProviderView)
      }
      <section class="provider-management">
        <h3>Provider Order</h3>
        ${renderProviderManagement(state)}
      </section>
    </div>
  `;
};

const isProviderId = (value: string | undefined): value is ProviderId =>
  value === providerIds[0] || value === providerIds[1] || value === providerIds[2];

const isProviderAction = (value: string | undefined): value is ProviderAction =>
  value === "login" || value === "refresh" || value === "repair";

const isSchedulerAction = (value: string | undefined): value is SchedulerAction =>
  value === "start" || value === "stop";

const isClaudeTokenAction = (value: string | undefined): value is ClaudeTokenAction =>
  value === "open" || value === "reload" || value === "remove";

const getClosestElement = (target: EventTarget | null, selector: string): HTMLElement | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  const closestElement = target.closest(selector);

  return closestElement instanceof HTMLElement ? closestElement : null;
};

const isOneOf = <ValueType extends string>(
  allowedValues: readonly ValueType[],
  value: string,
): value is ValueType => allowedValues.some((candidate) => candidate === value);

const readStringValue = (target: FormFieldElement): string | null => {
  if (target instanceof HTMLTextAreaElement) {
    return target.value === "" ? null : target.value;
  }

  return target.value;
};

const createProviderConfigUpdate = (
  providerId: ProviderId,
  configKey: string,
  patchValue: boolean | string | null,
): ProviderConfigUpdate | null => {
  if (providerId === "claude") {
    if (configKey === "cookieSource" && typeof patchValue === "string") {
      return isOneOf(claudeCookieSources, patchValue)
        ? { patch: { cookieSource: patchValue }, providerId }
        : null;
    }

    if (configKey === "oauthPromptFreeCredentialsEnabled" && typeof patchValue === "boolean") {
      return { patch: { oauthPromptFreeCredentialsEnabled: patchValue }, providerId };
    }

    if (configKey === "oauthPromptPolicy" && typeof patchValue === "string") {
      return isOneOf(claudePromptPolicies, patchValue)
        ? { patch: { oauthPromptPolicy: patchValue }, providerId }
        : null;
    }

    if (configKey === "source" && typeof patchValue === "string") {
      return isOneOf(claudeUsageSources, patchValue)
        ? { patch: { source: patchValue }, providerId }
        : null;
    }

    return null;
  }

  if (providerId === "codex") {
    if (configKey === "cookieHeader" && (typeof patchValue === "string" || patchValue === null)) {
      return { patch: { cookieHeader: patchValue }, providerId };
    }

    if (configKey === "cookieSource" && typeof patchValue === "string") {
      return isOneOf(codexCookieSources, patchValue)
        ? { patch: { cookieSource: patchValue }, providerId }
        : null;
    }

    if (configKey === "extrasEnabled" && typeof patchValue === "boolean") {
      return { patch: { extrasEnabled: patchValue }, providerId };
    }

    if (configKey === "historicalTrackingEnabled" && typeof patchValue === "boolean") {
      return { patch: { historicalTrackingEnabled: patchValue }, providerId };
    }

    if (configKey === "source" && typeof patchValue === "string") {
      return isOneOf(codexUsageSources, patchValue)
        ? { patch: { source: patchValue }, providerId }
        : null;
    }

    return null;
  }

  if (configKey === "enabled" && typeof patchValue === "boolean") {
    return { patch: { enabled: patchValue }, providerId };
  }

  return null;
};

const createConfigUpdater =
  (bridge: OmarchyBarBridge) =>
  async (update: ProviderConfigUpdate): Promise<void> => {
    if (update.providerId === "claude") {
      await bridge.updateClaudeConfig(update.patch);

      return;
    }

    if (update.providerId === "codex") {
      await bridge.updateCodexConfig(update.patch);

      return;
    }

    await bridge.updateGeminiConfig(update.patch);
  };

const createReorderedProviderIds = (
  providerOrder: ProviderId[],
  providerId: ProviderId,
  direction: "down" | "up",
): ProviderId[] => {
  const currentIndex = providerOrder.indexOf(providerId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex === -1 || targetIndex < 0 || targetIndex >= providerOrder.length) {
    return providerOrder;
  }

  const reorderedProviderIds = [...providerOrder];
  const [movedProviderId] = reorderedProviderIds.splice(currentIndex, 1);

  if (movedProviderId === undefined) {
    return providerOrder;
  }

  reorderedProviderIds.splice(targetIndex, 0, movedProviderId);

  return reorderedProviderIds;
};

const mountPopupApp = async (rootElement: HTMLElement, bridge: OmarchyBarBridge): Promise<void> => {
  let currentState = await bridge.getState();
  const updateProviderConfig = createConfigUpdater(bridge);

  const render = (): void => {
    rootElement.innerHTML = renderAppMarkup(currentState);
  };

  const handleClick = async (event: MouseEvent): Promise<void> => {
    const selectedProviderButton = getClosestElement(event.target, "[data-select-provider]");
    const selectedProviderId = selectedProviderButton?.dataset["selectProvider"];

    if (isProviderId(selectedProviderId)) {
      await bridge.selectProvider(selectedProviderId);

      return;
    }

    const providerActionButton = getClosestElement(event.target, "[data-provider-action]");
    const providerAction = providerActionButton?.dataset["providerAction"];
    const providerId = providerActionButton?.dataset["providerId"];

    if (isProviderAction(providerAction) && isProviderId(providerId)) {
      if (providerAction === "refresh") {
        await bridge.refreshProvider(providerId);
      }

      if (providerAction === "login") {
        await bridge.loginProvider(providerId);
      }

      if (providerAction === "repair") {
        await bridge.repairProvider(providerId);
      }

      return;
    }

    const moveProviderButton = getClosestElement(event.target, "[data-move-provider]");
    const moveProviderId = moveProviderButton?.dataset["moveProvider"];
    const direction = moveProviderButton?.dataset["direction"];

    if (isProviderId(moveProviderId) && (direction === "down" || direction === "up")) {
      await bridge.setProviderOrder(
        createReorderedProviderIds(currentState.config.providerOrder, moveProviderId, direction),
      );

      return;
    }

    const schedulerButton = getClosestElement(event.target, "[data-scheduler-action]");
    const schedulerAction = schedulerButton?.dataset["schedulerAction"];

    if (isSchedulerAction(schedulerAction)) {
      if (schedulerAction === "start") {
        const intervalInput = document.querySelector("#scheduler-interval");
        const intervalMs = normalizeRefreshSchedulerIntervalMs(
          intervalInput instanceof HTMLInputElement
            ? Number.parseInt(intervalInput.value, 10)
            : defaultRefreshSchedulerIntervalMs,
        );

        await bridge.startRefreshScheduler(intervalMs);

        return;
      }

      await bridge.stopRefreshScheduler();

      return;
    }

    const claudeTokenButton = getClosestElement(event.target, "[data-claude-token-action]");
    const claudeTokenAction = claudeTokenButton?.dataset["claudeTokenAction"];

    if (isClaudeTokenAction(claudeTokenAction)) {
      if (claudeTokenAction === "open") {
        await bridge.openClaudeTokenFile();

        return;
      }

      if (claudeTokenAction === "reload") {
        await bridge.reloadClaudeTokenFile();

        return;
      }

      if (claudeTokenAction === "remove") {
        const selectElement = document.querySelector("#claude-token-account-select");

        if (!(selectElement instanceof HTMLSelectElement)) {
          return;
        }

        const accountIndex = Number.parseInt(selectElement.value, 10);
        const nextTokenAccounts = currentState.config.providers.claude.tokenAccounts.filter(
          (_account, index) => index !== accountIndex,
        );

        await updateProviderConfig({
          patch: {
            activeTokenAccountIndex: 0,
            tokenAccounts: nextTokenAccounts,
          },
          providerId: "claude",
        });
      }
    }
  };

  const handleChange = async (event: Event): Promise<void> => {
    const target =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement
        ? event.target
        : null;

    if (target === null) {
      return;
    }

    const providerId = target.dataset["providerEnabled"];

    if (isProviderId(providerId) && target instanceof HTMLInputElement) {
      await bridge.setProviderEnabled(providerId, target.checked);

      return;
    }

    const configProviderId = target.dataset["providerConfig"];
    const { configKey } = target.dataset;

    if (isProviderId(configProviderId) && configKey !== undefined) {
      const patchValue =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : readStringValue(target);

      const configUpdate = createProviderConfigUpdate(configProviderId, configKey, patchValue);

      if (configUpdate === null) {
        return;
      }

      await updateProviderConfig(configUpdate);

      return;
    }

    if (target.id === "claude-token-account-select") {
      await updateProviderConfig({
        patch: {
          activeTokenAccountIndex: Number.parseInt(target.value, 10),
        },
        providerId: "claude",
      });
    }
  };

  const handleSubmit = async (event: SubmitEvent): Promise<void> => {
    if (!(event.target instanceof HTMLFormElement) || event.target.id !== "claude-token-form") {
      return;
    }

    event.preventDefault();

    const labelInput = document.querySelector("#claude-token-label");
    const tokenInput = document.querySelector("#claude-token-value");

    if (!(labelInput instanceof HTMLInputElement) || !(tokenInput instanceof HTMLInputElement)) {
      return;
    }

    await updateProviderConfig({
      patch: {
        tokenAccounts: [
          ...currentState.config.providers.claude.tokenAccounts,
          {
            label: labelInput.value,
            token: tokenInput.value,
          },
        ],
      },
      providerId: "claude",
    });

    event.target.reset();
  };

  rootElement.addEventListener("click", (event) => {
    void handleClick(event);
  });

  rootElement.addEventListener("change", (event) => {
    void handleChange(event);
  });

  rootElement.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  const unsubscribe = bridge.subscribe((state) => {
    currentState = state;
    render();
  });

  render();
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
};

export { mountPopupApp, renderAppMarkup };
