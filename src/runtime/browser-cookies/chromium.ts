import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { Database } from "bun:sqlite";
import type { RuntimeHost } from "@/runtime/host.ts";
import { listChromiumCookieStores } from "@/runtime/browser-cookies/discovery.ts";
import type {
  BrowserCookieQuery,
  BrowserCookieRecord,
  LinuxBrowserId,
} from "@/runtime/browser-cookies/models.ts";

interface ChromiumCookieRow {
  encryptedValue: Uint8Array;
  hostKey: string;
  name: string;
  path: string;
  value: string;
}

const chromiumSafeStorageApplications: Record<
  Exclude<LinuxBrowserId, "firefox">,
  "brave" | "chrome" | "chromium"
> = {
  brave: "brave",
  chrome: "chrome",
  chromium: "chromium",
};

const copyCookieDbToTempPath = async (sourcePath: string): Promise<string> => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "agent-stats-cookie-db-"));
  const destinationPath = join(tempDirectory, "Cookies.sqlite");

  await copyFile(sourcePath, destinationPath);
  return destinationPath;
};

const deriveChromiumLinuxKey = (secret: string): Buffer =>
  pbkdf2Sync(Buffer.from(secret, "utf8"), Buffer.from("saltysalt", "utf8"), 1, 16, "sha1");

const stripChromiumV24DomainDigest = (plaintext: Buffer, hostKey: string): Buffer => {
  if (plaintext.length < 33) {
    return plaintext;
  }

  const domainDigest = createHash("sha256").update(hostKey, "utf8").digest();

  return plaintext.subarray(0, 32).equals(domainDigest) ? plaintext.subarray(32) : plaintext;
};

const decryptChromiumCookieValue = (encryptedValue: Uint8Array, key: Buffer): Buffer | null => {
  if (encryptedValue.length === 0) {
    return Buffer.alloc(0);
  }

  const rawValue = Buffer.from(encryptedValue);
  const prefix = rawValue.subarray(0, 3).toString("utf8");

  if (prefix !== "v10" && prefix !== "v11") {
    return rawValue;
  }

  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.from(" ".repeat(16), "utf8"));
    return Buffer.concat([decipher.update(rawValue.subarray(3)), decipher.final()]);
  } catch {
    return null;
  }
};

const readEncryptedValue = (
  encryptedValue: string | bigint | number | boolean | Uint8Array,
): Uint8Array => {
  if (encryptedValue instanceof Uint8Array) {
    return encryptedValue;
  }

  throw new TypeError("Expected cookies.encrypted_value to be a BLOB.");
};

const readChromiumCookieRows = async (cookieDbPath: string): Promise<ChromiumCookieRow[]> => {
  const tempDbPath = await copyCookieDbToTempPath(cookieDbPath);

  try {
    const database = new Database(tempDbPath, { readonly: true });

    try {
      const statement = database.query(`
        select
          host_key,
          name,
          path,
          value,
          encrypted_value
        from cookies
        order by host_key, name, path
      `);

      return statement.values().map((row) => ({
        encryptedValue: readEncryptedValue(row[4]),
        hostKey: String(row[0]),
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

const matchesRequestedDomain = (host: string, domains: readonly string[]): boolean => {
  const normalizedHost = host.startsWith(".") ? host.slice(1) : host;

  return domains.some(
    (domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`),
  );
};

const matchesRequestedName = (name: string, names: readonly string[] | undefined): boolean =>
  names === undefined || names.length === 0 || names.includes(name);

const readLibsecretPassword = async (
  host: RuntimeHost,
  browserId: Exclude<LinuxBrowserId, "firefox">,
): Promise<string | null> => {
  const secretToolPath = await host.commands.which("secret-tool");

  if (secretToolPath === null) {
    return null;
  }

  const result = await host.commands.run(
    secretToolPath,
    ["lookup", "application", chromiumSafeStorageApplications[browserId]],
    {
      timeoutMs: 5000,
    },
  );

  if (result.exitCode !== 0) {
    return null;
  }

  const secret = result.stdout.trim();
  return secret === "" ? null : secret;
};

const readChromiumCookies = async (
  host: RuntimeHost,
  query: BrowserCookieQuery,
): Promise<BrowserCookieRecord[]> => {
  const requestedBrowsers = (query.browsers ?? ["chrome", "chromium", "brave"]).filter(
    (browserId): browserId is Exclude<LinuxBrowserId, "firefox"> => browserId !== "firefox",
  );
  const cookies: BrowserCookieRecord[] = [];

  for (const browserId of requestedBrowsers) {
    const secret = await readLibsecretPassword(host, browserId);

    if (secret === null) {
      continue;
    }

    const key = deriveChromiumLinuxKey(secret);
    const storeLocations = await listChromiumCookieStores(host.homeDirectory, browserId);

    for (const storeLocation of storeLocations) {
      const cookieRows = await readChromiumCookieRows(storeLocation.cookieDbPath);

      for (const row of cookieRows) {
        if (!matchesRequestedDomain(row.hostKey, query.domains)) {
          continue;
        }

        if (!matchesRequestedName(row.name, query.names)) {
          continue;
        }

        const decryptedValue =
          row.value !== ""
            ? row.value
            : (() => {
                const plaintext = decryptChromiumCookieValue(row.encryptedValue, key);

                if (plaintext === null) {
                  return "";
                }

                return stripChromiumV24DomainDigest(plaintext, row.hostKey).toString("utf8");
              })();

        if (decryptedValue === "") {
          continue;
        }

        cookies.push({
          browserId,
          host: row.hostKey,
          name: row.name,
          path: row.path,
          profileName: storeLocation.profileName,
          sourcePath: storeLocation.cookieDbPath,
          value: decryptedValue,
        });
      }
    }
  }

  return cookies;
};

export {
  copyCookieDbToTempPath,
  decryptChromiumCookieValue,
  deriveChromiumLinuxKey,
  readChromiumCookies,
  readChromiumCookieRows,
  readLibsecretPassword,
  stripChromiumV24DomainDigest,
  type ChromiumCookieRow,
};
