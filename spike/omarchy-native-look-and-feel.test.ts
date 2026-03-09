import {
  createMockState,
  parseTheme,
  renderPlainTextSnapshot,
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
});
