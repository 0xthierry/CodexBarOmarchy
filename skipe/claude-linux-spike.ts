import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { Database } from "bun:sqlite";

const claudeAccountEndpoint = "https://claude.ai/api/account";
const claudeOrganizationsEndpoint = "https://claude.ai/api/organizations";

type CommandName =
  | "help"
  | "inspect-firefox-claude-cookies"
  | "inspect-chromium-claude-cookies"
  | "probe-firefox-claude-session"
  | "probe-chromium-claude-session"
  | "probe-firefox-claude-api"
  | "probe-chromium-claude-api";

interface ParsedArgs {
  flags: Map<string, string | true>;
  positionals: string[];
}

interface ChromiumCookieRow {
  encryptedValue: Uint8Array;
  hostKey: string;
  name: string;
  path: string;
  topFrameSiteKey: string;
}

interface FirefoxCookieRow {
  hostKey: string;
  name: string;
  path: string;
  value: string;
}

interface DecryptedCookie {
  hostKey: string;
  name: string;
  path: string;
  topFrameSiteKey: string;
  value: string;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();

    if (key === "") {
      continue;
    }

    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }

    const nextToken = argv[index + 1];

    if (nextToken !== undefined && !nextToken.startsWith("--")) {
      flags.set(key, nextToken);
      index += 1;
      continue;
    }

    flags.set(key, true);
  }

  return { flags, positionals };
};

const readOptionalFlag = (args: ParsedArgs, key: string): string | null => {
  const value = args.flags.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const maskCookieHeader = (value: string): string =>
  value
    .split(/;\s*/u)
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "")
    .map((pair) => {
      const [name] = pair.split("=", 1);
      return name ? `${name}=<redacted>` : "<invalid>";
    })
    .join("; ");

const normalizeEmail = (value: string | null): string | null => {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
};

const findFirstString = (value: unknown, targetKey: string): string | null => {
  const queue: unknown[] = [value];
  let seen = 0;

  while (queue.length > 0 && seen < 2000) {
    const current = queue.shift();
    seen += 1;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === "object" && current !== null) {
      for (const [key, nestedValue] of Object.entries(current)) {
        if (key.toLowerCase() === targetKey.toLowerCase() && typeof nestedValue === "string") {
          return nestedValue.trim();
        }
        queue.push(nestedValue);
      }
    }
  }

  return null;
};

const findFirstStringAny = (value: unknown, targetKeys: string[]): string | null => {
  for (const key of targetKeys) {
    const match = findFirstString(value, key);

    if (match !== null) {
      return match;
    }
  }

  return null;
};

const summarizeJsonShape = (value: unknown): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "array(len=0)";
    }
    return `array(len=${value.length}, first=${summarizeJsonShape(value[0])})`;
  }

  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).toSorted();
    const preview = keys.slice(0, 10).join(", ");
    return `object(keys=${preview}${keys.length > 10 ? ", ..." : ""})`;
  }

  return typeof value;
};

const runCommand = async (
  argv: string[],
): Promise<{
  exitCode: number;
  stderr: string;
  stdout: string;
}> => {
  const command = Bun.spawn(argv, {
    stderr: "pipe",
    stdout: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);

  return { exitCode, stderr, stdout };
};

const resolveChromiumBrowser = (
  args: ParsedArgs,
): {
  applicationName: "brave" | "chrome" | "chromium";
  defaultRoot: string;
  displayName: string;
} => {
  const browser = (readOptionalFlag(args, "browser") ?? "chrome").toLowerCase();

  if (browser === "chrome") {
    return {
      applicationName: "chrome",
      defaultRoot: join(homedir(), ".config", "google-chrome"),
      displayName: "Google Chrome",
    };
  }

  if (browser === "chromium") {
    return {
      applicationName: "chromium",
      defaultRoot: join(homedir(), ".config", "chromium"),
      displayName: "Chromium",
    };
  }

  if (browser === "brave") {
    return {
      applicationName: "brave",
      defaultRoot: join(homedir(), ".config", "BraveSoftware", "Brave-Browser"),
      displayName: "Brave",
    };
  }

  throw new Error("Unsupported browser. Use --browser chrome, chromium, or brave.");
};

const firefoxRootCandidates = (homePath: string): string[] => [
  join(homePath, ".config", "mozilla", "firefox"),
  join(homePath, ".mozilla", "firefox"),
  join(homePath, "snap", "firefox", "common", ".mozilla", "firefox"),
];

const parseIniProfiles = async (profilesIniPath: string): Promise<string[]> => {
  if (!existsSync(profilesIniPath)) {
    return [];
  }

  const contents = await readFile(profilesIniPath, "utf8");
  const lines = contents.split(/\r?\n/u);
  const profilePaths: string[] = [];
  let current: Record<string, string> = {};

  const flushCurrent = (): void => {
    if (current["Path"]) {
      profilePaths.push(current["Path"]);
    }
    current = {};
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      flushCurrent();
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    current[key] = value;
  }

  flushCurrent();
  return profilePaths;
};

const resolveFirefoxProfilePaths = async (
  args: ParsedArgs,
): Promise<{
  cookieDbPath: string;
  profileName: string;
  rootPath: string;
}> => {
  const explicitRoot = readOptionalFlag(args, "root");
  const explicitProfile = readOptionalFlag(args, "profile");
  const roots = explicitRoot ? [explicitRoot] : firefoxRootCandidates(homedir());

  for (const rootPath of roots) {
    const profilesIniPath = join(rootPath, "profiles.ini");
    const iniProfiles = await parseIniProfiles(profilesIniPath);
    const candidates = new Set<string>();

    for (const profilePath of iniProfiles) {
      candidates.add(join(rootPath, profilePath));
    }

    const fallbackProfiles =
      await Bun.$`find ${rootPath} -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null`
        .text()
        .then((text) =>
          text
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line !== ""),
        );

    for (const profileName of fallbackProfiles) {
      candidates.add(join(rootPath, profileName));
    }

    for (const candidate of candidates) {
      const profileName = candidate.split("/").at(-1) ?? candidate;

      if (explicitProfile !== null && profileName !== explicitProfile) {
        continue;
      }

      const cookieDbPath = join(candidate, "cookies.sqlite");

      if (existsSync(cookieDbPath)) {
        return { cookieDbPath, profileName, rootPath };
      }
    }
  }

  throw new Error("No Firefox profile with cookies.sqlite was found.");
};

const resolveChromiumProfilePaths = (
  args: ParsedArgs,
): {
  browser: ReturnType<typeof resolveChromiumBrowser>;
  cookieDbPath: string;
  profileName: string;
} => {
  const browser = resolveChromiumBrowser(args);
  const rootPath = readOptionalFlag(args, "root") ?? browser.defaultRoot;
  const profileName = readOptionalFlag(args, "profile") ?? "Default";
  return {
    browser,
    cookieDbPath: join(rootPath, profileName, "Cookies"),
    profileName,
  };
};

const getLibsecretPassword = async (
  applicationName: "brave" | "chrome" | "chromium",
): Promise<string> => {
  const result = await runCommand(["secret-tool", "lookup", "application", applicationName]);

  if (result.exitCode !== 0) {
    throw new Error(
      `secret-tool lookup failed for application=${applicationName}: ${result.stderr.trim() || "unknown error"}`,
    );
  }

  const password = result.stdout.trim();

  if (password === "") {
    throw new Error(`secret-tool returned an empty secret for application=${applicationName}.`);
  }

  return password;
};

const deriveChromiumLinuxKey = (password: string): Buffer =>
  pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from("saltysalt", "utf8"), 1, 16, "sha1");

const decryptChromiumCookieValue = (encryptedValue: Uint8Array, key: Buffer): Buffer | null => {
  if (encryptedValue.length === 0) {
    return Buffer.alloc(0);
  }

  const raw = Buffer.from(encryptedValue);
  const prefix = raw.subarray(0, 3).toString("utf8");

  if (prefix !== "v10" && prefix !== "v11") {
    return raw;
  }

  try {
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.from(" ".repeat(16), "utf8"));
    return Buffer.concat([decipher.update(raw.subarray(3)), decipher.final()]);
  } catch {
    return null;
  }
};

const stripChromiumV24DomainDigest = (plaintext: Buffer, hostKey: string): Buffer => {
  if (plaintext.length < 33) {
    return plaintext;
  }

  const domainDigest = createHash("sha256").update(hostKey, "utf8").digest();

  if (plaintext.subarray(0, 32).equals(domainDigest)) {
    return plaintext.subarray(32);
  }

  return plaintext;
};

const copyToTempFile = async (sourcePath: string): Promise<string> => {
  const destinationPath = join(
    tmpdir(),
    `claude-cookie-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
  await Bun.write(destinationPath, await Bun.file(sourcePath).arrayBuffer());
  return destinationPath;
};

const readChromiumClaudeCookieRows = async (cookieDbPath: string): Promise<ChromiumCookieRow[]> => {
  if (!existsSync(cookieDbPath)) {
    throw new Error(`Cookie DB not found: ${cookieDbPath}`);
  }

  const tempDbPath = await copyToTempFile(cookieDbPath);

  try {
    const db = new Database(tempDbPath, { readonly: true });
    try {
      const statement = db.query(`
        select
          host_key,
          top_frame_site_key,
          name,
          encrypted_value,
          path
        from cookies
        where host_key like '%claude.ai%'
        order by host_key, name, path
      `);

      return statement.all().map((row) => {
        const typedRow = row as {
          encrypted_value: Uint8Array;
          host_key: string;
          name: string;
          path: string;
          top_frame_site_key: string;
        };

        return {
          encryptedValue: typedRow.encrypted_value,
          hostKey: typedRow.host_key,
          name: typedRow.name,
          path: typedRow.path,
          topFrameSiteKey: typedRow.top_frame_site_key,
        };
      });
    } finally {
      db.close();
    }
  } finally {
    await Bun.file(tempDbPath).delete();
  }
};

const readFirefoxClaudeCookieRows = async (cookieDbPath: string): Promise<FirefoxCookieRow[]> => {
  if (!existsSync(cookieDbPath)) {
    throw new Error(`Cookie DB not found: ${cookieDbPath}`);
  }

  const tempDbPath = await copyToTempFile(cookieDbPath);

  try {
    const db = new Database(tempDbPath, { readonly: true });
    try {
      const statement = db.query(`
        select
          host,
          name,
          value,
          path
        from moz_cookies
        where host like '%claude.ai%'
        order by host, name, path
      `);

      return statement.all().map((row) => {
        const typedRow = row as {
          host: string;
          name: string;
          path: string;
          value: string;
        };

        return {
          hostKey: typedRow.host,
          name: typedRow.name,
          path: typedRow.path,
          value: typedRow.value,
        };
      });
    } finally {
      db.close();
    }
  } finally {
    await Bun.file(tempDbPath).delete();
  }
};

const decryptChromiumClaudeCookies = async (
  args: ParsedArgs,
): Promise<{
  browser: ReturnType<typeof resolveChromiumBrowser>;
  cookieDbPath: string;
  decryptedCookies: DecryptedCookie[];
  profileName: string;
}> => {
  const { browser, cookieDbPath, profileName } = resolveChromiumProfilePaths(args);
  const libsecretPassword = await getLibsecretPassword(browser.applicationName);
  const key = deriveChromiumLinuxKey(libsecretPassword);
  const rows = await readChromiumClaudeCookieRows(cookieDbPath);
  const decryptedCookies: DecryptedCookie[] = [];

  for (const row of rows) {
    const decrypted = decryptChromiumCookieValue(row.encryptedValue, key);

    if (decrypted === null || decrypted.length === 0) {
      continue;
    }

    const normalizedValue = stripChromiumV24DomainDigest(decrypted, row.hostKey).toString("utf8");

    if (normalizedValue === "") {
      continue;
    }

    decryptedCookies.push({
      hostKey: row.hostKey,
      name: row.name,
      path: row.path,
      topFrameSiteKey: row.topFrameSiteKey,
      value: normalizedValue,
    });
  }

  return {
    browser,
    cookieDbPath,
    decryptedCookies,
    profileName,
  };
};

const readFirefoxClaudeCookies = async (
  args: ParsedArgs,
): Promise<{
  cookieDbPath: string;
  decryptedCookies: DecryptedCookie[];
  profileName: string;
  rootPath: string;
}> => {
  const { cookieDbPath, profileName, rootPath } = await resolveFirefoxProfilePaths(args);
  const rows = await readFirefoxClaudeCookieRows(cookieDbPath);

  return {
    cookieDbPath,
    decryptedCookies: rows
      .filter((row) => row.value.trim() !== "")
      .map((row) => ({
        hostKey: row.hostKey,
        name: row.name,
        path: row.path,
        topFrameSiteKey: "",
        value: row.value,
      })),
    profileName,
    rootPath,
  };
};

const dedupeCookiesByName = (cookies: DecryptedCookie[]): DecryptedCookie[] => {
  const byName = new Map<string, DecryptedCookie>();

  for (const cookie of cookies) {
    if (!byName.has(cookie.name)) {
      byName.set(cookie.name, cookie);
    }
  }

  return [...byName.values()].toSorted((left, right) => left.name.localeCompare(right.name));
};

const buildSessionCookieHeader = (cookies: DecryptedCookie[]): string => {
  const sessionCookie = dedupeCookiesByName(cookies).find((cookie) => cookie.name === "sessionKey");

  if (!sessionCookie) {
    return "";
  }

  return `sessionKey=${sessionCookie.value}`;
};

const fetchJsonEndpoint = async (
  url: string,
  cookieHeader: string,
): Promise<{
  bodyText: string;
  contentType: string | null;
  parsed: unknown | null;
  status: number;
}> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Cookie: cookieHeader,
    },
  });
  const bodyText = await response.text();

  try {
    return {
      bodyText,
      contentType: response.headers.get("content-type"),
      parsed: JSON.parse(bodyText),
      status: response.status,
    };
  } catch {
    return {
      bodyText,
      contentType: response.headers.get("content-type"),
      parsed: null,
      status: response.status,
    };
  }
};

const printUsage = (): void => {
  console.log(`Usage:
  bun run skipe/claude-linux-spike.ts inspect-firefox-claude-cookies [--profile NAME] [--root PATH]
  bun run skipe/claude-linux-spike.ts inspect-chromium-claude-cookies [--browser chrome|chromium|brave] [--profile NAME] [--root PATH]
  bun run skipe/claude-linux-spike.ts probe-firefox-claude-session [--profile NAME] [--root PATH] [--email ADDRESS]
  bun run skipe/claude-linux-spike.ts probe-chromium-claude-session [--browser chrome|chromium|brave] [--profile NAME] [--root PATH] [--email ADDRESS]
  bun run skipe/claude-linux-spike.ts probe-firefox-claude-api [--profile NAME] [--root PATH]
  bun run skipe/claude-linux-spike.ts probe-chromium-claude-api [--browser chrome|chromium|brave] [--profile NAME] [--root PATH]
`);
};

const printCookieInventory = (
  browserLabel: string,
  profileName: string,
  cookieDbPath: string,
  cookies: DecryptedCookie[],
): void => {
  console.log(`Browser: ${browserLabel}`);
  console.log(`Profile: ${profileName}`);
  console.log(`Cookie DB: ${cookieDbPath}`);
  console.log(`Claude cookie count: ${cookies.length}`);

  for (const cookie of cookies) {
    console.log(`- ${cookie.hostKey} | ${cookie.name}`);
  }

  const sessionHeader = buildSessionCookieHeader(cookies);
  console.log(`\nSession key present: ${sessionHeader !== ""}`);
  console.log(
    `Session cookie header: ${sessionHeader === "" ? "none" : maskCookieHeader(sessionHeader)}`,
  );
};

const probeClaudeSession = async (
  browserLabel: string,
  profileName: string,
  cookieHeader: string,
  expectedEmail: string | null,
): Promise<void> => {
  if (cookieHeader === "") {
    throw new Error("No Claude sessionKey cookie was available.");
  }

  console.log(`Browser: ${browserLabel}`);
  console.log(`Profile: ${profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  for (const endpoint of [claudeAccountEndpoint, claudeOrganizationsEndpoint]) {
    console.log(`\nEndpoint: ${endpoint}`);
    const result = await fetchJsonEndpoint(endpoint, cookieHeader);
    const email = findFirstStringAny(result.parsed, ["email", "email_address"]);

    console.log(`- status: ${result.status}`);
    console.log(`- content-type: ${result.contentType ?? "unknown"}`);
    console.log(`- parsed email: ${email ?? "none"}`);

    if (result.parsed !== null) {
      console.log(`- shape: ${summarizeJsonShape(result.parsed)}`);
    } else {
      console.log(`- body sample: ${result.bodyText.slice(0, 220)}`);
    }

    if (expectedEmail !== null && email !== null) {
      console.log(`- expected email match: ${normalizeEmail(email) === expectedEmail}`);
    }
  }
};

const probeClaudeApi = async (
  browserLabel: string,
  profileName: string,
  cookieHeader: string,
): Promise<void> => {
  if (cookieHeader === "") {
    throw new Error("No Claude sessionKey cookie was available.");
  }

  console.log(`Browser: ${browserLabel}`);
  console.log(`Profile: ${profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  const accountResult = await fetchJsonEndpoint(claudeAccountEndpoint, cookieHeader);
  const organizationsResult = await fetchJsonEndpoint(claudeOrganizationsEndpoint, cookieHeader);

  console.log(`\nEndpoint: ${claudeAccountEndpoint}`);
  console.log(`- status: ${accountResult.status}`);
  console.log(`- content-type: ${accountResult.contentType ?? "unknown"}`);
  console.log(
    `- parsed email: ${findFirstStringAny(accountResult.parsed, ["email", "email_address"]) ?? "none"}`,
  );
  if (accountResult.parsed !== null) {
    console.log(`- shape: ${summarizeJsonShape(accountResult.parsed)}`);
  } else {
    console.log(`- body sample: ${accountResult.bodyText.slice(0, 220)}`);
  }

  console.log(`\nEndpoint: ${claudeOrganizationsEndpoint}`);
  console.log(`- status: ${organizationsResult.status}`);
  console.log(`- content-type: ${organizationsResult.contentType ?? "unknown"}`);
  if (organizationsResult.parsed !== null) {
    console.log(`- shape: ${summarizeJsonShape(organizationsResult.parsed)}`);
  } else {
    console.log(`- body sample: ${organizationsResult.bodyText.slice(0, 220)}`);
  }

  const firstOrganization =
    Array.isArray(organizationsResult.parsed) && organizationsResult.parsed.length > 0
      ? organizationsResult.parsed[0]
      : null;
  const organizationId = findFirstStringAny(firstOrganization, ["id", "uuid", "organization_id"]);
  const organizationName = findFirstString(firstOrganization, "name");

  console.log(`- organization id: ${organizationId ?? "none"}`);
  console.log(`- organization name: ${organizationName ?? "none"}`);

  if (organizationId === null) {
    return;
  }

  for (const endpoint of [
    `https://claude.ai/api/organizations/${organizationId}/usage`,
    `https://claude.ai/api/organizations/${organizationId}/overage_spend_limit`,
  ]) {
    console.log(`\nEndpoint: ${endpoint}`);
    const result = await fetchJsonEndpoint(endpoint, cookieHeader);
    console.log(`- status: ${result.status}`);
    console.log(`- content-type: ${result.contentType ?? "unknown"}`);

    if (result.parsed !== null) {
      console.log(`- shape: ${summarizeJsonShape(result.parsed)}`);
    } else {
      console.log(`- body sample: ${result.bodyText.slice(0, 220)}`);
    }
  }
};

const inspectChromiumClaudeCookies = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumClaudeCookies(args);
  printCookieInventory(
    result.browser.displayName,
    result.profileName,
    result.cookieDbPath,
    result.decryptedCookies,
  );
};

const inspectFirefoxClaudeCookies = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxClaudeCookies(args);
  console.log(`Root: ${result.rootPath}`);
  printCookieInventory("Firefox", result.profileName, result.cookieDbPath, result.decryptedCookies);
};

const probeChromiumClaudeSession = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumClaudeCookies(args);
  await probeClaudeSession(
    result.browser.displayName,
    result.profileName,
    buildSessionCookieHeader(result.decryptedCookies),
    normalizeEmail(readOptionalFlag(args, "email")),
  );
};

const probeFirefoxClaudeSession = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxClaudeCookies(args);
  await probeClaudeSession(
    "Firefox",
    result.profileName,
    buildSessionCookieHeader(result.decryptedCookies),
    normalizeEmail(readOptionalFlag(args, "email")),
  );
};

const probeChromiumClaudeApi = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumClaudeCookies(args);
  await probeClaudeApi(
    result.browser.displayName,
    result.profileName,
    buildSessionCookieHeader(result.decryptedCookies),
  );
};

const probeFirefoxClaudeApi = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxClaudeCookies(args);
  await probeClaudeApi(
    "Firefox",
    result.profileName,
    buildSessionCookieHeader(result.decryptedCookies),
  );
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const command = (args.positionals[0] ?? "help") as CommandName;

  switch (command) {
    case "help": {
      printUsage();
      return;
    }
    case "inspect-firefox-claude-cookies": {
      await inspectFirefoxClaudeCookies(args);
      return;
    }
    case "inspect-chromium-claude-cookies": {
      await inspectChromiumClaudeCookies(args);
      return;
    }
    case "probe-firefox-claude-session": {
      await probeFirefoxClaudeSession(args);
      return;
    }
    case "probe-chromium-claude-session": {
      await probeChromiumClaudeSession(args);
      return;
    }
    case "probe-firefox-claude-api": {
      await probeFirefoxClaudeApi(args);
      return;
    }
    case "probe-chromium-claude-api": {
      await probeChromiumClaudeApi(args);
      return;
    }
    default: {
      printUsage();
      throw new Error(`Unknown command: ${command}`);
    }
  }
};

await main();
