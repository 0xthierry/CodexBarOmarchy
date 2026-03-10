import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OmarchyTheme, ThemeCandidate } from "@/ui/tui/types.ts";

const resolveThemeCandidates = (
  configuredThemePath: string | undefined = process.env["OMARCHY_THEME_PATH"],
  homeDirectory = homedir(),
): ThemeCandidate[] => {
  if (typeof configuredThemePath === "string" && configuredThemePath !== "") {
    return [
      {
        label: "OMARCHY_THEME_PATH",
        path: configuredThemePath,
      },
    ];
  }

  return [
    {
      label: "~/.config/omarchy/current/theme/colors.toml",
      path: join(homeDirectory, ".config", "omarchy", "current", "theme", "colors.toml"),
    },
    {
      label: "~/.local/share/omarchy/current/theme/colors.toml",
      path: join(homeDirectory, ".local", "share", "omarchy", "current", "theme", "colors.toml"),
    },
  ];
};

const resolveThemePath = async (
  candidates: ThemeCandidate[] = resolveThemeCandidates(),
): Promise<string> => {
  for (const candidate of candidates) {
    try {
      await access(candidate.path);

      return candidate.path;
    } catch {
      await Promise.resolve();
    }
  }

  const attemptedPaths = candidates.map((candidate) => `- ${candidate.label}`).join("\n");

  throw new Error(
    `Could not resolve the active Omarchy theme.\nTried:\n${attemptedPaths}\n\nSet OMARCHY_THEME_PATH to a valid Omarchy colors.toml path if needed.`,
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

    if (match !== null) {
      const [, key, value] = match;

      if (key !== undefined && value !== undefined) {
        values.set(key, value);
      }
    }
  }

  const readThemeValue = (key: keyof OmarchyTheme): string => {
    const value = values.get(key);

    if (typeof value !== "string" || value === "") {
      throw new Error(`Theme file is missing required token "${key}".`);
    }

    return value;
  };

  return {
    accent: readThemeValue("accent"),
    background: readThemeValue("background"),
    color1: readThemeValue("color1"),
    color2: readThemeValue("color2"),
    color3: readThemeValue("color3"),
    color4: readThemeValue("color4"),
    color5: readThemeValue("color5"),
    color8: readThemeValue("color8"),
    cursor: readThemeValue("cursor"),
    foreground: readThemeValue("foreground"),
  };
};

const loadActiveOmarchyTheme = async (): Promise<OmarchyTheme> => {
  const themePath = await resolveThemePath();
  const contents = await readFile(themePath, "utf8");

  return parseTheme(contents);
};

export { loadActiveOmarchyTheme, parseTheme, resolveThemeCandidates, resolveThemePath };
