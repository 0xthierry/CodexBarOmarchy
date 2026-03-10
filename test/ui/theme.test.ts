import { expect, test } from "bun:test";
import { parseTheme, resolveThemeCandidates } from "@/ui/tui/theme.ts";

test("parses Omarchy colors.toml tokens", () => {
  const theme = parseTheme(`
accent = "#ff8800"
background = "#111111"
color1 = "#aa0000"
color2 = "#00aa00"
color3 = "#0000aa"
color4 = "#aaaa00"
color5 = "#aa00aa"
color8 = "#888888"
cursor = "#ffffff"
foreground = "#eeeeee"
`);

  expect(theme.accent).toBe("#ff8800");
  expect(theme.background).toBe("#111111");
  expect(theme.foreground).toBe("#eeeeee");
});

test("prefers OMARCHY_THEME_PATH when provided", () => {
  const candidates = resolveThemeCandidates("/tmp/custom-theme.toml", "/home/tester");

  expect(candidates).toEqual([
    {
      label: "OMARCHY_THEME_PATH",
      path: "/tmp/custom-theme.toml",
    },
  ]);
});

test("returns the standard Omarchy theme candidate paths by default", () => {
  const candidates = resolveThemeCandidates(undefined, "/home/tester");

  expect(candidates).toEqual([
    {
      label: "~/.config/omarchy/current/theme/colors.toml",
      path: "/home/tester/.config/omarchy/current/theme/colors.toml",
    },
    {
      label: "~/.local/share/omarchy/current/theme/colors.toml",
      path: "/home/tester/.local/share/omarchy/current/theme/colors.toml",
    },
  ]);
});
