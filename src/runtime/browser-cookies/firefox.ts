import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { RuntimeHost } from "@/runtime/host.ts";
import { listFirefoxCookieStores } from "@/runtime/browser-cookies/discovery.ts";
import type { BrowserCookieQuery, BrowserCookieRecord } from "@/runtime/browser-cookies/models.ts";

interface FirefoxCookieRow {
  host: string;
  name: string;
  path: string;
  value: string;
}

const copyFirefoxCookieDbToTempPath = async (sourcePath: string): Promise<string> => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "agent-stats-firefox-cookie-db-"));
  const destinationPath = join(tempDirectory, "cookies.sqlite");

  await copyFile(sourcePath, destinationPath);
  return destinationPath;
};

const matchesRequestedDomain = (host: string, domains: readonly string[]): boolean => {
  const normalizedHost = host.startsWith(".") ? host.slice(1) : host;

  return domains.some(
    (domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`),
  );
};

const matchesRequestedName = (name: string, names: readonly string[] | undefined): boolean =>
  names === undefined || names.length === 0 || names.includes(name);

const readFirefoxCookieRows = async (cookieDbPath: string): Promise<FirefoxCookieRow[]> => {
  const tempDbPath = await copyFirefoxCookieDbToTempPath(cookieDbPath);

  try {
    const database = new Database(tempDbPath, { readonly: true });

    try {
      const statement = database.query(`
        select
          host,
          name,
          path,
          value
        from moz_cookies
        order by host, name, path
      `);

      return statement.values().map((row) => ({
        host: String(row[0]),
        name: String(row[1]),
        path: String(row[2]),
        value: String(row[3] ?? ""),
      }));
    } finally {
      database.close();
    }
  } finally {
    await rm(tempDbPath, { force: true });
    await rm(tempDbPath.slice(0, tempDbPath.lastIndexOf("/")), {
      force: true,
      recursive: true,
    });
  }
};

const readFirefoxCookies = async (
  host: RuntimeHost,
  query: BrowserCookieQuery,
): Promise<BrowserCookieRecord[]> => {
  const storeLocations = await listFirefoxCookieStores(host.homeDirectory);
  const cookies: BrowserCookieRecord[] = [];

  for (const storeLocation of storeLocations) {
    const cookieRows = await readFirefoxCookieRows(storeLocation.cookieDbPath);

    for (const row of cookieRows) {
      if (!matchesRequestedDomain(row.host, query.domains)) {
        continue;
      }

      if (!matchesRequestedName(row.name, query.names)) {
        continue;
      }

      if (row.value === "") {
        continue;
      }

      cookies.push({
        browserId: "firefox",
        host: row.host,
        name: row.name,
        path: row.path,
        profileName: storeLocation.profileName,
        sourcePath: storeLocation.cookieDbPath,
        value: row.value,
      });
    }
  }

  return cookies;
};

export { readFirefoxCookies, readFirefoxCookieRows, type FirefoxCookieRow };
