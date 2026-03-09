import {
  applySettingsModalChoice,
  createMockState,
  createSettingsModalItems,
  parseTheme,
  renderPlainTextSnapshot,
  toggleSelectedSettingsModalOption,
} from "./omarchy-native-look-and-feel.ts";
import { describe, expect, test } from "bun:test";

const fixtureTheme = parseTheme(`
accent = "#7aa2f7"
cursor = "#c0caf5"
foreground = "#a9b1d6"
background = "#1a1b26"
color1 = "#f7768e"
color2 = "#9ece6a"
color3 = "#e0af68"
color4 = "#7aa2f7"
color5 = "#ad8ee6"
color8 = "#444b6a"
`);

describe("omarchy native look spike", () => {
  test("renders the expected plain-text sections for non-tty fallback", () => {
    const state = createMockState();
    const rendered = renderPlainTextSnapshot(state);

    expect(rendered).toContain("omarchy-agent-bar");
    expect(rendered).toContain("provider");
    expect(rendered).toContain("settings");
    expect(rendered).toContain("options");
    expect(rendered).toContain("menu");
    expect(rendered).toContain("r refresh");
    expect(rendered).toContain("dashboard");
    expect(rendered).toContain("Source   OAuth");
    expect(rendered).toContain("Current session window");
    expect(rendered).toContain("Plan     Pro");
  });

  test("parses Omarchy colors.toml tokens", () => {
    expect(fixtureTheme.background).toBe("#1a1b26");
    expect(fixtureTheme.color2).toBe("#9ece6a");
    expect(fixtureTheme.color5).toBe("#ad8ee6");
  });

  test("starts on the Codex mock provider", () => {
    const state = createMockState();

    expect(state.selectedProviderId).toBe("codex");
    expect(state.providers.codex.source).toBe("oauth");
  });

  test("builds structured settings modal items for the selected provider", () => {
    const state = createMockState();
    const items = createSettingsModalItems(state.providers.codex);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.key)).toEqual(["source", "history", "web"]);
    expect(items[0]?.kind).toBe("setting");
    expect(items[0]?.editKind).toBe("select");
    expect(items[1]?.kind).toBe("option");
    expect(items[1]?.label).toBe("Historical tracking");
  });

  test("places codex cookie controls below openai web extras when extras are enabled", () => {
    const state = createMockState();

    state.providers.codex.options[1].value = "on";
    const items = createSettingsModalItems(state.providers.codex);

    expect(items.map((item) => item.key)).toEqual(["source", "history", "web", "cookies"]);
    expect(items[3]?.indentLevel).toBe(1);
  });

  test("updates select-backed setting values through the settings modal helper", () => {
    const state = createMockState();

    state.settingsModalSelectedIndex = 0;
    state.settingsModalChoiceIndex = 1;
    applySettingsModalChoice(state);

    expect(state.providers.codex.settings[0]?.value).toBe("oauth");
  });

  test("toggles boolean options through the settings modal helper", () => {
    const state = createMockState();

    state.settingsModalSelectedIndex = 1;
    toggleSelectedSettingsModalOption(state);

    expect(state.providers.codex.options[0]?.value).toBe("off");
  });
});
