import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserCookieStoreLocation,
  LinuxBrowserId,
} from "@/runtime/browser-cookies/models.ts";

interface ChromiumBrowserDefinition {
  applicationName: "brave" | "chrome" | "chromium";
  browserId: Exclude<LinuxBrowserId, "firefox">;
  rootPath: string;
}

const chromiumBrowserDefinitions = (
  homeDirectory: string,
): readonly ChromiumBrowserDefinition[] => [
  {
    applicationName: "chrome",
    browserId: "chrome",
    rootPath: join(homeDirectory, ".config", "google-chrome"),
  },
  {
    applicationName: "chromium",
    browserId: "chromium",
    rootPath: join(homeDirectory, ".config", "chromium"),
  },
  {
    applicationName: "brave",
    browserId: "brave",
    rootPath: join(homeDirectory, ".config", "BraveSoftware", "Brave-Browser"),
  },
];

const firefoxRootCandidates = (homeDirectory: string): readonly string[] => [
  join(homeDirectory, ".config", "mozilla", "firefox"),
  join(homeDirectory, ".mozilla", "firefox"),
  join(homeDirectory, "snap", "firefox", "common", ".mozilla", "firefox"),
];

const parseFirefoxProfilesIni = (contents: string): string[] => {
  const profilePaths: string[] = [];
  let currentPath: string | null = null;

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      if (currentPath !== null) {
        profilePaths.push(currentPath);
      }

      currentPath = null;
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "Path" && value !== "") {
      currentPath = value;
    }
  }

  if (currentPath !== null) {
    profilePaths.push(currentPath);
  }

  return profilePaths;
};

const listFirefoxCookieStores = async (
  homeDirectory: string,
): Promise<BrowserCookieStoreLocation[]> => {
  const locations: BrowserCookieStoreLocation[] = [];

  for (const rootPath of firefoxRootCandidates(homeDirectory)) {
    if (!existsSync(rootPath)) {
      continue;
    }

    const profilesIniPath = join(rootPath, "profiles.ini");
    const profilePaths = existsSync(profilesIniPath)
      ? parseFirefoxProfilesIni(await readFile(profilesIniPath, "utf8"))
      : [];
    const fallbackEntries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);

    const candidates = new Set<string>();

    for (const profilePath of profilePaths) {
      candidates.add(join(rootPath, profilePath));
    }

    for (const entry of fallbackEntries) {
      if (entry.isDirectory()) {
        candidates.add(join(rootPath, entry.name));
      }
    }

    for (const candidate of candidates) {
      const cookieDbPath = join(candidate, "cookies.sqlite");

      if (!existsSync(cookieDbPath)) {
        continue;
      }

      locations.push({
        browserId: "firefox",
        cookieDbPath,
        profileName: candidate.split("/").at(-1) ?? candidate,
      });
    }
  }

  return locations;
};

const listChromiumCookieStores = async (
  homeDirectory: string,
  browserId?: Exclude<LinuxBrowserId, "firefox">,
): Promise<BrowserCookieStoreLocation[]> => {
  const locations: BrowserCookieStoreLocation[] = [];

  for (const definition of chromiumBrowserDefinitions(homeDirectory)) {
    if (browserId !== undefined && definition.browserId !== browserId) {
      continue;
    }

    if (!existsSync(definition.rootPath)) {
      continue;
    }

    const entries = await readdir(definition.rootPath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const cookieDbPath = join(definition.rootPath, entry.name, "Cookies");
      const networkCookieDbPath = join(definition.rootPath, entry.name, "Network", "Cookies");
      const resolvedCookieDbPath = existsSync(cookieDbPath)
        ? cookieDbPath
        : (existsSync(networkCookieDbPath)
          ? networkCookieDbPath
          : null);

      if (resolvedCookieDbPath === null) {
        continue;
      }

      locations.push({
        browserId: definition.browserId,
        cookieDbPath: resolvedCookieDbPath,
        profileName: entry.name,
      });
    }
  }

  return locations;
};

const listBrowserCookieStores = async (
  homeDirectory: string,
  browserId?: LinuxBrowserId,
): Promise<BrowserCookieStoreLocation[]> => {
  if (browserId === "firefox") {
    return listFirefoxCookieStores(homeDirectory);
  }

  if (browserId === "chrome" || browserId === "chromium" || browserId === "brave") {
    return listChromiumCookieStores(homeDirectory, browserId);
  }

  const firefoxLocations = await listFirefoxCookieStores(homeDirectory);
  const chromiumLocations = await listChromiumCookieStores(homeDirectory);

  return [...firefoxLocations, ...chromiumLocations];
};

export {
  chromiumBrowserDefinitions,
  firefoxRootCandidates,
  listBrowserCookieStores,
  listChromiumCookieStores,
  listFirefoxCookieStores,
  parseFirefoxProfilesIni,
};
