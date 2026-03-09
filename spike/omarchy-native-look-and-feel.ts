import {
  BoxRenderable,
  ScrollBoxRenderable,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

type ProviderId = "codex" | "claude" | "gemini";
type ProviderStatus = "disabled" | "idle" | "ready" | "refreshing";

interface OmarchyTheme {
  accent: string;
  background: string;
  color1: string;
  color2: string;
  color3: string;
  color4: string;
  color5: string;
  color8: string;
  cursor: string;
  foreground: string;
}

interface MetricRow {
  hint: string;
  ratio: number;
  detail: string;
  label: string;
  value: string;
}

interface InfoRow {
  label: string;
  value: string;
}

interface SettingsRow {
  key: string;
  label: string;
  note?: string;
  value: string;
}

interface OptionRow {
  key: string;
  label: string;
  note?: string;
  value: "off" | "on";
}

interface ActionRow {
  hint: string;
  key: string;
  label: string;
}

interface UsageBlock {
  lines: string[];
  meterRatio?: number;
  meterValue?: string;
  title: string;
}

interface MockProviderView {
  account: string;
  actions: ActionRow[];
  enabled: boolean;
  id: ProviderId;
  infoRows: InfoRow[];
  metrics: MetricRow[];
  options: OptionRow[];
  plan: string;
  settings: SettingsRow[];
  source: string;
  status: ProviderStatus;
  subtitle: string;
  updatedAt: string;
  usageBlocks: UsageBlock[];
  version: string;
}

interface AppState {
  globalActions: ActionRow[];
  message: string;
  providers: Record<ProviderId, MockProviderView>;
  selectedProviderId: ProviderId;
}

interface ThemeCandidate {
  label: string;
  path: string;
}

const providerOrder: readonly ProviderId[] = ["codex", "claude", "gemini"];
const esc = "\u001B";

const resolveThemeCandidates = (): ThemeCandidate[] => {
  const configuredThemePath = process.env["OMARCHY_THEME_PATH"];

  if (typeof configuredThemePath === "string" && configuredThemePath !== "") {
    return [
      {
        label: "OMARCHY_THEME_PATH",
        path: configuredThemePath,
      },
    ];
  }

  const home = homedir();

  return [
    {
      label: "~/.config/omarchy/current/theme/colors.toml",
      path: join(home, ".config", "omarchy", "current", "theme", "colors.toml"),
    },
    {
      label: "~/.local/share/omarchy/current/theme/colors.toml",
      path: join(home, ".local", "share", "omarchy", "current", "theme", "colors.toml"),
    },
  ];
};

const resolveThemePath = async (): Promise<string> => {
  for (const candidate of resolveThemeCandidates()) {
    try {
      await access(candidate.path);

      return candidate.path;
    } catch {
      await Promise.resolve();
    }
  }

  const tried = resolveThemeCandidates()
    .map((candidate) => `- ${candidate.label}`)
    .join("\n");

  throw new Error(
    `Could not resolve the active Omarchy theme.\nTried:\n${tried}\n\nSet OMARCHY_THEME_PATH to a valid Omarchy colors.toml path if needed.`,
  );
};

const parseTheme = (contents: string): OmarchyTheme => {
  const values = new Map<string, string>();

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) {
      continue;
    }

    const match = /^([a-z0-9_]+)\s*=\s*"([^"]+)"$/i.exec(line);

    if (match === null) {
      continue;
    }

    values.set(match[1], match[2]);
  }

  const getValue = (key: keyof OmarchyTheme): string => {
    const value = values.get(key);

    if (typeof value !== "string" || value === "") {
      throw new Error(`Theme file is missing required token "${key}".`);
    }

    return value;
  };

  return {
    accent: getValue("accent"),
    background: getValue("background"),
    color1: getValue("color1"),
    color2: getValue("color2"),
    color3: getValue("color3"),
    color4: getValue("color4"),
    color5: getValue("color5"),
    color8: getValue("color8"),
    cursor: getValue("cursor"),
    foreground: getValue("foreground"),
  };
};

const loadActiveOmarchyTheme = async (): Promise<OmarchyTheme> => {
  const themePath = await resolveThemePath();
  const contents = await readFile(themePath, "utf8");

  return parseTheme(contents);
};

const formatTimestamp = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatShortTime = (value: Date): string =>
  value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

const formatMonthDayTime = (value: Date): string =>
  `${value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} ${formatShortTime(value)}`;

const isSameLocalDate = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const parseIsoDate = (value: string): Date | null => {
  if (!value.includes("T")) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
};

const humanizeEnum = (value: string): string => {
  const normalized = value.trim().toLowerCase();

  if (normalized === "oauth") {
    return "OAuth";
  }

  if (normalized === "api") {
    return "API";
  }

  if (normalized === "cli") {
    return "CLI";
  }

  if (normalized === "web") {
    return "Web";
  }

  if (normalized === "pro") {
    return "Pro";
  }

  if (normalized === "max") {
    return "Max";
  }

  return value;
};

const formatUpdatedDisplay = (value: string): string => {
  const parsed = parseIsoDate(value);

  if (parsed === null) {
    return value;
  }

  const now = new Date();

  if (isSameLocalDate(parsed, now)) {
    return `Today ${formatTimestamp(parsed)}`;
  }

  return formatMonthDayTime(parsed);
};

const formatResetDisplay = (value: string): string | null => {
  const parsed = parseIsoDate(value);

  if (parsed === null) {
    return value.trim() === "" ? null : value;
  }

  const now = new Date();

  if (isSameLocalDate(parsed, now)) {
    return `Resets today ${formatShortTime(parsed)}`;
  }

  const dayDistance = Math.round((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDistance >= 0 && dayDistance < 7) {
    return `Resets ${parsed.toLocaleDateString("en-GB", { weekday: "short" })} ${formatShortTime(parsed)}`;
  }

  return `Resets ${formatMonthDayTime(parsed)}`;
};

const describeMetric = (label: string, detail: string): string | null => {
  const formattedReset = formatResetDisplay(detail);

  if (formattedReset !== null) {
    return formattedReset;
  }

  if (label === "Session") {
    return "Current session window";
  }

  if (label === "Weekly") {
    return "Current weekly window";
  }

  if (label === "Credits") {
    return "OpenAI credit balance";
  }

  if (label === "Sonnet") {
    return "Current Sonnet window";
  }

  if (label === "Flash" || label === "Pro") {
    return "Current Gemini quota window";
  }

  return null;
};

const metricPrimaryText = (label: string, hint: string, value: string): string => {
  if (hint.trim() !== "") {
    return hint;
  }

  if (label === "Credits") {
    return `Balance ${value}`;
  }

  return value;
};

const shortSettingLabel = (label: string): string => {
  if (label === "Usage source") {
    return "Usage src";
  }

  if (label === "Cookie source" || label === "OpenAI cookies" || label === "Claude cookies") {
    return "Cookies";
  }

  if (label === "Cookie header") {
    return "Header";
  }

  if (label === "Token accounts") {
    return "Accounts";
  }

  if (label === "Historical tracking") {
    return "History";
  }

  if (label === "OpenAI web extras") {
    return "Web extras";
  }

  return label;
};

const formatInfoValue = (label: string, value: string): string => {
  if (label === "Source" || label === "Plan") {
    return humanizeEnum(value);
  }

  if (label === "Updated") {
    return formatUpdatedDisplay(value);
  }

  if (label === "Account") {
    return truncate(value, 23);
  }

  return truncate(value, 24);
};

const createMockState = (): AppState => ({
  globalActions: [
    { hint: "mock: add or switch account", key: "a", label: "add-account" },
    { hint: "mock: open usage dashboard", key: "u", label: "dashboard" },
    { hint: "mock: open provider status page", key: "s", label: "status" },
    { hint: "mock: open settings", key: ",", label: "settings" },
    { hint: "mock: show about screen", key: "i", label: "about" },
    { hint: "quit the panel", key: "q", label: "quit" },
  ],
  message: "1-3 select  h/l move  r refresh  e toggle  a/u/s/,/i app menu  q quit",
  providers: {
    claude: {
      account: "thierrysantoos123@gmail.com",
      actions: [
        { hint: "refresh now", key: "r", label: "refresh" },
        { hint: "start login flow", key: "l", label: "login" },
        { hint: "open terminal for oauth recovery", key: "o", label: "open-tty" },
        { hint: "open session token file", key: "f", label: "token-file" },
        { hint: "reload token file", key: "x", label: "reload-token" },
        { hint: "toggle provider enabled", key: "e", label: "disable" },
      ],
      enabled: true,
      id: "claude",
      infoRows: [
        { label: "State", value: "Enabled" },
        { label: "Source", value: "oauth" },
        { label: "Version", value: "2.1.71" },
        { label: "Updated", value: "2026-03-09T14:39:03.177Z" },
        { label: "Account", value: "thierrysantoos123@gmail.com" },
        { label: "Plan", value: "max" },
      ],
      metrics: [
        {
          detail: "2026-03-09T15:00:01.418296+00:00",
          hint: "25% used",
          label: "Session",
          ratio: 0.25,
          value: "25%",
        },
        {
          detail: "2026-03-14T13:00:00.418316+00:00",
          hint: "5% used",
          label: "Weekly",
          ratio: 0.05,
          value: "5%",
        },
        {
          detail: "2026-03-16T11:00:00.418324+00:00",
          hint: "1% used",
          label: "Sonnet",
          ratio: 0.01,
          value: "1%",
        },
      ],
      options: [],
      plan: "max",
      settings: [
        {
          key: "source",
          label: "Usage source",
          note: "From host-integration config.",
          value: "Auto",
        },
        {
          key: "cookies",
          label: "Cookie source",
          note: "From host-integration config.",
          value: "Auto",
        },
        {
          key: "accounts",
          label: "Token accounts",
          note: "Configured token accounts.",
          value: "0",
        },
      ],
      source: "oauth",
      status: "ready",
      subtitle: "claude account usage",
      updatedAt: "2026-03-09T14:39:03.177Z",
      usageBlocks: [],
      version: "2.1.71",
    },
    codex: {
      account: "thierrysantoos123+chatgptpro@gmail.com",
      actions: [
        { hint: "refresh now", key: "r", label: "refresh" },
        { hint: "start login flow", key: "l", label: "login" },
        { hint: "toggle provider enabled", key: "e", label: "disable" },
        { hint: "re-detect provider CLIs", key: "d", label: "re-detect" },
      ],
      enabled: true,
      id: "codex",
      infoRows: [
        { label: "State", value: "Enabled" },
        { label: "Source", value: "oauth" },
        { label: "Version", value: "0.112.0" },
        { label: "Updated", value: "2026-03-09T14:39:02.180Z" },
        { label: "Account", value: "thierrysantoos123+chatgptpro@gmail.com" },
        { label: "Plan", value: "pro" },
      ],
      metrics: [
        {
          detail: "",
          hint: "30% used",
          label: "Session",
          ratio: 0.3,
          value: "30%",
        },
        {
          detail: "",
          hint: "31% used",
          label: "Weekly",
          ratio: 0.31,
          value: "31%",
        },
        {
          detail: "",
          hint: "0.00",
          label: "Credits",
          ratio: 0,
          value: "0.00",
        },
      ],
      options: [
        {
          key: "history",
          label: "Historical tracking",
          note: "From host-integration config.",
          value: "on",
        },
        {
          key: "web",
          label: "OpenAI web extras",
          note: "From host-integration config.",
          value: "off",
        },
      ],
      plan: "pro",
      settings: [
        {
          key: "source",
          label: "Usage source",
          note: "From host-integration config.",
          value: "Auto",
        },
        {
          key: "cookies",
          label: "Cookie source",
          note: "From host-integration config.",
          value: "Off",
        },
        {
          key: "header",
          label: "Cookie header",
          note: "No manual cookie header configured.",
          value: "Hidden",
        },
      ],
      source: "oauth",
      status: "ready",
      subtitle: "openai account usage",
      updatedAt: "2026-03-09T14:39:02.180Z",
      usageBlocks: [],
      version: "0.112.0",
    },
    gemini: {
      account: "thierry@meistrari.com",
      actions: [
        { hint: "refresh now", key: "r", label: "refresh" },
        { hint: "start login flow", key: "l", label: "login" },
        { hint: "toggle provider enabled", key: "e", label: "disable" },
      ],
      enabled: true,
      id: "gemini",
      infoRows: [
        { label: "State", value: "Enabled" },
        { label: "Source", value: "api" },
        { label: "Version", value: "0.29.7" },
        { label: "Updated", value: "2026-03-09T14:39:04.430Z" },
        { label: "Account", value: "thierry@meistrari.com" },
        { label: "Plan", value: "Workspace" },
      ],
      metrics: [
        {
          detail: "2026-03-10T14:39:04Z",
          hint: "100% used",
          label: "Flash",
          ratio: 1,
          value: "100%",
        },
        {
          detail: "2026-03-10T14:39:04Z",
          hint: "100% used",
          label: "Pro",
          ratio: 1,
          value: "100%",
        },
      ],
      options: [],
      plan: "Workspace",
      settings: [],
      source: "api",
      status: "ready",
      subtitle: "gemini quota usage",
      updatedAt: "2026-03-09T14:39:04.430Z",
      usageBlocks: [],
      version: "0.29.7",
    },
  },
  selectedProviderId: "codex",
});

const buildTabsText = (state: AppState): string =>
  providerOrder
    .map((providerId) => {
      const provider = state.providers[providerId];
      const label = provider.enabled ? provider.id : `${provider.id} off`;

      return providerId === state.selectedProviderId ? `[${label}]` : label;
    })
    .join("  ");

const buildHeaderText = (state: AppState): string[] => {
  const selectedProvider = state.providers[state.selectedProviderId];

  return [
    buildTabsText(state),
    `${selectedProvider.id.toUpperCase()}  ${selectedProvider.subtitle}`,
    `${formatUpdatedDisplay(selectedProvider.updatedAt).replace("Today ", "")}  •  ${humanizeEnum(selectedProvider.plan)}  •  ${selectedProvider.status}`,
  ];
};

const buildProviderSummaryText = (provider: MockProviderView): string[] => {
  const metricLines = provider.metrics.flatMap(
    ({ detail, hint, label, ratio, value }, metricIndex) => {
      const filledCount = Math.max(0, Math.min(16, Math.round(ratio * 16)));
      const bar = `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;
      const description = describeMetric(label, detail);

      return [
        `${label.padEnd(12, " ")}${metricPrimaryText(label, hint, value)}`,
        bar,
        ...(description === null ? [] : [description]),
        ...(metricIndex === provider.metrics.length - 1 ? [] : [""]),
      ];
    },
  );

  const blockLines = provider.usageBlocks.flatMap((block, blockIndex) => {
    const lines = [block.title];

    if (typeof block.meterRatio === "number" && typeof block.meterValue === "string") {
      const filledCount = Math.max(0, Math.min(16, Math.round(block.meterRatio * 16)));
      const bar = `${"█".repeat(filledCount)}${"░".repeat(16 - filledCount)}`;

      lines[0] = `${block.title.padEnd(12, " ")}${block.meterValue}`;
      lines.push(bar);
    }

    lines.push(...block.lines);

    return blockIndex === provider.usageBlocks.length - 1 ? ["", ...lines] : ["", ...lines, ""];
  });

  return [...metricLines, ...blockLines];
};

const buildSettingsText = (provider: MockProviderView): string =>
  provider.settings.length === 0
    ? "none"
    : provider.settings
        .map(
          ({ label, value }) =>
            `${truncate(shortSettingLabel(label), 10).padEnd(10, " ")} ${truncate(humanizeEnum(value), 22)}`,
        )
        .join("\n");

const buildOptionsText = (provider: MockProviderView): string =>
  provider.options.length === 0
    ? "none"
    : provider.options
        .map(
          ({ label, value }) =>
            `[${value === "on" ? "x" : " "}] ${truncate(shortSettingLabel(label), 18)}`,
        )
        .join("\n");

const buildInfoText = (provider: MockProviderView): string =>
  provider.infoRows
    .map(({ label, value }) => `${label.padEnd(8, " ")} ${formatInfoValue(label, value)}`)
    .join("\n");

const packActionLines = (prefix: string, actions: ActionRow[]): string[] =>
  actions.reduce<string[]>((lines, action, actionIndex) => {
    const entry = `${action.key} ${action.label}`;
    const prefixWidth = 10;

    if (actionIndex % 2 === 0) {
      lines.push(
        `${actionIndex === 0 ? prefix.padEnd(prefixWidth, " ") : " ".repeat(prefixWidth)}${entry}`,
      );
      return lines;
    }

    const currentLine = lines.pop() ?? prefix.padEnd(prefixWidth, " ");
    lines.push(`${currentLine}   ${entry}`);
    return lines;
  }, []);

const buildMenuText = (state: AppState): string =>
  [
    ...packActionLines("provider", state.providers[state.selectedProviderId].actions),
    ...packActionLines("app", state.globalActions),
    "nav       1-3 select   h/l move",
  ].join("\n");

const renderPlainTextSnapshot = (state: AppState): string => {
  const provider = state.providers[state.selectedProviderId];

  return [
    "omarchy-agent-bar",
    ...buildHeaderText(state),
    "",
    "provider",
    ...buildProviderSummaryText(provider),
    "",
    "details",
    buildInfoText(provider),
    "",
    "settings",
    buildSettingsText(provider),
    "",
    "options",
    buildOptionsText(provider),
    "",
    "menu",
    buildMenuText(state),
    "",
    state.message,
  ].join("\n");
};

const selectRelativeProvider = (state: AppState, direction: -1 | 1): void => {
  const currentIndex = providerOrder.indexOf(state.selectedProviderId);
  const nextIndex = (currentIndex + direction + providerOrder.length) % providerOrder.length;

  state.selectedProviderId = providerOrder[nextIndex];
  state.message = `Selected ${state.selectedProviderId}.`;
};

const setSelectedProvider = (state: AppState, providerId: ProviderId): void => {
  state.selectedProviderId = providerId;
  state.message = `Selected ${state.selectedProviderId}.`;
};

const toggleSelectedProvider = (state: AppState): void => {
  const provider = state.providers[state.selectedProviderId];

  provider.enabled = !provider.enabled;
  provider.status = provider.enabled ? "ready" : "disabled";
  provider.infoRows[0] = {
    label: "State",
    value: provider.enabled ? "Enabled" : "Disabled",
  };
  state.message = `${provider.id} ${provider.enabled ? "enabled" : "disabled"}.`;
};

const refreshSelectedProvider = (
  state: AppState,
  theme: OmarchyTheme,
  render: () => void,
): void => {
  const provider = state.providers[state.selectedProviderId];

  if (!provider.enabled) {
    state.message = `Cannot refresh ${provider.id} while it is disabled.`;
    render();
    return;
  }

  provider.status = "refreshing";
  state.message = `Refreshing ${provider.id} using mock data...`;
  render();

  globalThis.setTimeout(() => {
    provider.status = "ready";
    provider.updatedAt = new Date().toISOString();
    provider.infoRows[3] = {
      label: "Updated",
      value: provider.updatedAt,
    };
    state.message = `${provider.id} refreshed. Theme accent ${theme.accent}.`;
    render();
  }, 420);
};

const triggerProviderAction = (state: AppState, keyName: string, render: () => void): boolean => {
  const provider = state.providers[state.selectedProviderId];
  const matchedAction = provider.actions.find((action) => action.key === keyName);

  if (matchedAction === undefined) {
    return false;
  }

  state.message = `${provider.id}: ${matchedAction.hint}.`;
  render();
  return true;
};

const triggerGlobalAction = (state: AppState, keyName: string, render: () => void): boolean => {
  const matchedAction = state.globalActions.find((action) => action.key === keyName);

  if (matchedAction === undefined) {
    return false;
  }

  state.message = matchedAction.hint;
  render();
  return true;
};

const handleKeyInput = (
  key: { ctrl?: boolean; name: string },
  state: AppState,
  theme: OmarchyTheme,
  render: () => void,
): boolean => {
  if (key.name === "q" || (key.ctrl === true && key.name === "c")) {
    return true;
  }

  if (key.name === "1" || key.name === "2" || key.name === "3") {
    setSelectedProvider(state, providerOrder[Number.parseInt(key.name, 10) - 1] ?? "codex");
    render();
    return false;
  }

  if (key.name === "h") {
    selectRelativeProvider(state, -1);
    render();
    return false;
  }

  if (key.name === "l") {
    selectRelativeProvider(state, 1);
    render();
    return false;
  }

  if (key.name === "e") {
    toggleSelectedProvider(state);
    render();
    return false;
  }

  if (key.name === "r") {
    refreshSelectedProvider(state, theme, render);
    return false;
  }

  if (triggerProviderAction(state, key.name, render)) {
    return false;
  }

  if (triggerGlobalAction(state, key.name, render)) {
    return false;
  }

  state.message = `Unknown key "${key.name}".`;
  render();
  return false;
};

const runInteractiveSpike = async (): Promise<void> => {
  const theme = await loadActiveOmarchyTheme();
  const state = createMockState();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stdout.write(`${renderPlainTextSnapshot(state)}\n`);
    return;
  }

  const renderer = await createCliRenderer({
    autoFocus: true,
    backgroundColor: theme.background,
    exitOnCtrlC: false,
    useAlternateScreen: true,
    useConsole: false,
  });

  const { root } = renderer;
  const shell = new BoxRenderable(renderer, {
    backgroundColor: theme.background,
    flexDirection: "column",
    gap: 0,
    height: "100%",
    padding: 0,
    width: "100%",
  });
  const headerBox = new BoxRenderable(renderer, {
    border: true,
    borderColor: theme.color5,
    flexDirection: "column",
    height: 6,
    title: "omarchy-agent-bar",
    width: "100%",
  });
  const body = new BoxRenderable(renderer, {
    flexDirection: "row",
    flexGrow: 1,
    gap: 0,
    width: "100%",
  });
  const leftColumn = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 0,
    height: "100%",
    width: "54%",
  });
  const rightColumn = new BoxRenderable(renderer, {
    flexDirection: "column",
    gap: 0,
    height: "100%",
    width: "46%",
  });
  const usageBox = new BoxRenderable(renderer, {
    border: true,
    borderColor: theme.color4,
    flexGrow: 1,
    title: "usage",
    width: "100%",
  });
  const detailsBox = new BoxRenderable(renderer, {
    border: true,
    borderColor: theme.accent,
    height: 8,
    title: "details",
    width: "100%",
  });
  const configBox = new BoxRenderable(renderer, {
    border: true,
    borderColor: theme.color2,
    flexGrow: 1,
    title: "config",
    width: "100%",
  });
  const menuBox = new BoxRenderable(renderer, {
    border: true,
    borderColor: theme.color1,
    height: 7,
    title: "menu",
    width: "100%",
  });
  const footerBox = new BoxRenderable(renderer, {
    height: 1,
    width: "100%",
  });

  const headerText = new TextRenderable(renderer, {
    content: "",
    fg: theme.foreground,
    height: 2,
    width: "100%",
    wrapMode: "word",
  });
  const providerTabs = new TabSelectRenderable(renderer, {
    backgroundColor: theme.background,
    focusedBackgroundColor: theme.background,
    focusedTextColor: theme.foreground,
    height: 2,
    selectedBackgroundColor: theme.color5,
    selectedTextColor: theme.background,
    showDescription: false,
    showUnderline: true,
    tabWidth: 10,
    textColor: theme.color8,
    width: "100%",
    wrapSelection: true,
  });
  const usageScroll = new ScrollBoxRenderable(renderer, {
    backgroundColor: theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const usageText = new TextRenderable(renderer, {
    content: "",
    fg: theme.foreground,
    height: "100%",
    width: "100%",
    wrapMode: "word",
  });
  const configScroll = new ScrollBoxRenderable(renderer, {
    backgroundColor: theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const configText = new TextRenderable(renderer, {
    content: "",
    fg: theme.foreground,
    height: "100%",
    width: "100%",
    wrapMode: "word",
  });
  const detailsScroll = new ScrollBoxRenderable(renderer, {
    backgroundColor: theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const detailsText = new TextRenderable(renderer, {
    content: "",
    fg: theme.foreground,
    height: "100%",
    width: "100%",
    wrapMode: "word",
  });
  const menuScroll = new ScrollBoxRenderable(renderer, {
    backgroundColor: theme.background,
    height: "100%",
    paddingX: 1,
    scrollY: true,
    width: "100%",
  });
  const actionsText = new TextRenderable(renderer, {
    content: buildMenuText(state),
    fg: theme.foreground,
    height: "100%",
    width: "100%",
    wrapMode: "word",
  });
  const footerText = new TextRenderable(renderer, {
    content: state.message,
    fg: theme.color8,
    height: 1,
    width: "100%",
    wrapMode: "none",
  });

  headerBox.add(headerText);
  headerBox.add(providerTabs);
  usageScroll.add(usageText);
  usageBox.add(usageScroll);
  detailsScroll.add(detailsText);
  detailsBox.add(detailsScroll);
  configScroll.add(configText);
  configBox.add(configScroll);
  menuScroll.add(actionsText);
  menuBox.add(menuScroll);
  footerBox.add(footerText);

  leftColumn.add(usageBox);
  rightColumn.add(detailsBox);
  rightColumn.add(configBox);
  body.add(leftColumn);
  body.add(rightColumn);
  shell.add(headerBox);
  shell.add(body);
  shell.add(menuBox);
  shell.add(footerBox);
  root.add(shell);

  const render = (): void => {
    const provider = state.providers[state.selectedProviderId];

    headerText.content = buildHeaderText(state).slice(1).join("\n");
    providerTabs.setOptions(
      providerOrder.map((providerId) => ({
        name: state.providers[providerId].enabled ? providerId : `${providerId} off`,
        value: providerId,
      })),
    );

    const providerIndex = providerOrder.indexOf(state.selectedProviderId);

    if (providerTabs.getSelectedIndex() !== providerIndex) {
      providerTabs.setSelectedIndex(providerIndex);
    }

    usageText.content = buildProviderSummaryText(provider).join("\n");
    detailsText.content = buildInfoText(provider);
    configText.content = `settings\n${buildSettingsText(provider)}\n\noptions\n${buildOptionsText(provider)}`;
    actionsText.content = buildMenuText(state);
    footerText.content = state.message;
    renderer.requestRender();
  };

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    renderer.destroy();
    process.stdout.write(`${esc}[0m\n`);
  };

  render();
  providerTabs.focus();

  providerTabs.on(
    TabSelectRenderableEvents.SELECTION_CHANGED,
    (_index: number, option?: { value?: unknown }) => {
      if (option?.value === "codex" || option?.value === "claude" || option?.value === "gemini") {
        setSelectedProvider(state, option.value);
        render();
      }
    },
  );

  renderer.keyInput.on("keypress", (key) => {
    const shouldQuit = handleKeyInput(key, state, theme, render);

    if (!shouldQuit) {
      return;
    }

    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });

  await new Promise<void>(() => {
    // Keep the renderer alive until the process exits.
  });
};

if (import.meta.main) {
  await runInteractiveSpike();
}

export {
  createMockState,
  loadActiveOmarchyTheme,
  parseTheme,
  renderPlainTextSnapshot,
  type AppState,
  type MockProviderView,
  type OmarchyTheme,
};
