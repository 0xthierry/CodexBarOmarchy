import type { TuiSettingsChoice, TuiSettingsItemDescriptor } from "@/ui/tui/types.ts";
import type { ProviderView } from "@/ui/tui/types.ts";

const codexAutoCookieChoices: TuiSettingsChoice[] = [
  { label: "Automatic", value: "auto" },
  { label: "Off", value: "off" },
];

const codexUsageChoices: TuiSettingsChoice[] = [
  { label: "Auto", value: "auto" },
  { label: "OAuth", value: "oauth" },
  { label: "CLI", value: "cli" },
];

const claudeCookieChoices: TuiSettingsChoice[] = [
  { label: "Automatic", value: "auto" },
  { label: "Manual", value: "manual" },
];

const claudeUsageChoices: TuiSettingsChoice[] = [
  { label: "Auto", value: "auto" },
  { label: "OAuth", value: "oauth" },
  { label: "Web", value: "web" },
  { label: "CLI", value: "cli" },
];

const toToggleValue = (value: boolean): string => (value ? "on" : "off");

const createBaseItems = (providerView: ProviderView): TuiSettingsItemDescriptor[] => [
  {
    choices: [
      { label: "On", value: "on" },
      { label: "Off", value: "off" },
    ],
    currentValue: toToggleValue(providerView.enabled),
    enabled: true,
    id: "shared:enabled",
    indentLevel: 0,
    kind: "toggle",
    label: "Enabled",
    note: "Persist provider enablement through the app store.",
  },
];

const createCodexItems = (
  providerView: Extract<ProviderView, { id: "codex" }>,
): TuiSettingsItemDescriptor[] => {
  const items = createBaseItems(providerView);

  items.push(
    {
      choices: codexUsageChoices,
      currentValue: providerView.config.source,
      enabled: true,
      id: "codex:source",
      indentLevel: 0,
      kind: "select",
      label: "Usage source",
      note: "Choose how Codex usage is collected.",
    },
    {
      choices: [
        { label: "On", value: "on" },
        { label: "Off", value: "off" },
      ],
      currentValue: toToggleValue(providerView.config.historicalTrackingEnabled),
      enabled: true,
      id: "codex:historical-tracking",
      indentLevel: 0,
      kind: "toggle",
      label: "Historical tracking",
      note: "Keep the Codex history collector enabled.",
    },
    {
      choices: [
        { label: "On", value: "on" },
        { label: "Off", value: "off" },
      ],
      currentValue: toToggleValue(providerView.config.extrasEnabled),
      enabled: true,
      id: "codex:web-extras",
      indentLevel: 0,
      kind: "toggle",
      label: "OpenAI web extras",
      note: "Show the extra web-backed Codex settings surface.",
    },
  );

  if (!providerView.config.extrasEnabled) {
    return items;
  }

  if (providerView.config.cookieSource === "manual") {
    items.push({
      choices: [],
      currentValue: providerView.config.cookieSource,
      enabled: false,
      id: "codex:cookie-source",
      indentLevel: 1,
      kind: "readonly",
      label: "OpenAI cookies",
      note: "Manual cookie mode remains read-only in this slice.",
    });

    return items;
  }

  items.push({
    choices: codexAutoCookieChoices,
    currentValue: providerView.config.cookieSource,
    enabled: true,
    id: "codex:cookie-source",
    indentLevel: 1,
    kind: "select",
    label: "OpenAI cookies",
    note: "Manual cookie-header editing is deferred.",
  });

  return items;
};

const createClaudeTokenAccountChoices = (
  providerView: Extract<ProviderView, { id: "claude" }>,
): TuiSettingsChoice[] =>
  providerView.settings.tokenAccounts.map((tokenAccount, index) => ({
    label: tokenAccount.label,
    value: String(index),
  }));

const createClaudeItems = (
  providerView: Extract<ProviderView, { id: "claude" }>,
): TuiSettingsItemDescriptor[] => {
  const tokenAccountChoices = createClaudeTokenAccountChoices(providerView);
  const tokenAccountLabels =
    tokenAccountChoices.length === 0
      ? "No token accounts saved."
      : tokenAccountChoices.map((choice) => choice.label).join(", ");

  return [
    ...createBaseItems(providerView),
    {
      choices: claudeUsageChoices,
      currentValue: providerView.config.source,
      enabled: true,
      id: "claude:source",
      indentLevel: 0,
      kind: "select",
      label: "Usage source",
      note: "Choose how Claude usage is collected.",
    },
    {
      choices: claudeCookieChoices,
      currentValue: providerView.config.cookieSource,
      enabled: true,
      id: "claude:cookie-source",
      indentLevel: 0,
      kind: "select",
      label: "Claude cookies",
      note: "Manual cookie mode uses the persisted token accounts list.",
    },
    {
      choices: [],
      currentValue: `${providerView.settings.tokenAccounts.length} saved`,
      enabled: false,
      id: "claude:token-account-list",
      indentLevel: 0,
      kind: "readonly",
      label: "Token accounts",
      note: tokenAccountLabels,
    },
    {
      choices: tokenAccountChoices,
      currentValue: String(providerView.settings.activeTokenAccountIndex),
      enabled: tokenAccountChoices.length > 0,
      id: "claude:active-token-account",
      indentLevel: 0,
      kind: "select",
      label: "Active token account",
      note:
        tokenAccountChoices.length > 0
          ? "Choose the active saved Claude session token."
          : "Add a Claude token account to activate one.",
    },
    {
      choices: [],
      currentValue: "run",
      enabled: true,
      id: "claude:add-token-account",
      indentLevel: 0,
      kind: "action",
      label: "Add token account",
      note: "Create a new saved Claude token account.",
    },
    {
      choices: [],
      currentValue: "run",
      enabled: tokenAccountChoices.length > 0,
      id: "claude:remove-token-account",
      indentLevel: 0,
      kind: "action",
      label: "Remove active token",
      note:
        tokenAccountChoices.length > 0
          ? "Remove the currently active Claude token account."
          : "There is no Claude token account to remove.",
    },
  ];
};

const getSettingsItems = (providerView: ProviderView): TuiSettingsItemDescriptor[] => {
  if (providerView.id === "codex") {
    return createCodexItems(providerView);
  }

  if (providerView.id === "claude") {
    return createClaudeItems(providerView);
  }

  return createBaseItems(providerView);
};

const findCurrentChoiceLabel = (item: TuiSettingsItemDescriptor): string => {
  const selectedChoice = item.choices.find((choice) => choice.value === item.currentValue);

  return selectedChoice?.label ?? item.currentValue;
};

export { findCurrentChoiceLabel, getSettingsItems };
