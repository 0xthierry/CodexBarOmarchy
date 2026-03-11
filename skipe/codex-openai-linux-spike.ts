import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createDecipheriv, createHash, pbkdf2Sync } from "node:crypto";
import { Database } from "bun:sqlite";

const openAISessionEndpoints = [
  "https://chatgpt.com/backend-api/me",
  "https://chatgpt.com/api/auth/session",
] as const;

const codexUsageUrl = "https://chatgpt.com/codex/settings/usage";
const whamEndpoints = [
  "https://chatgpt.com/backend-api/wham/usage",
  "https://chatgpt.com/backend-api/wham/usage/credit-usage-events",
  "https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown",
  "https://chatgpt.com/backend-api/wham/usage/daily-enterprise-token-usage-breakdown",
  "https://chatgpt.com/backend-api/wham/usage/approximate-credit-usage?credit_amount=125",
] as const;

type CommandName =
  | "help"
  | "inspect-firefox-openai-cookies"
  | "inspect-chromium-openai-cookies"
  | "list-cookie-stores"
  | "probe-firefox-openai-session"
  | "probe-firefox-wham-endpoints"
  | "probe-chromium-openai-dashboard"
  | "probe-chromium-openai-session"
  | "probe-chromium-wham-endpoints"
  | "probe-openai-session"
  | "probe-openai-dashboard";

interface ParsedArgs {
  positionals: string[];
  flags: Map<string, string | true>;
}

interface CookieSourceInput {
  header: string;
  sourceLabel: string;
}

interface ChromiumCookieRow {
  encryptedValue: Uint8Array;
  hostKey: string;
  name: string;
  path: string;
  topFrameSiteKey: string;
}

interface DecryptedCookie {
  hostKey: string;
  name: string;
  path: string;
  topFrameSiteKey: string;
  value: string;
}

interface FirefoxCookieRow {
  hostKey: string;
  name: string;
  path: string;
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

  return {
    exitCode,
    stderr,
    stdout,
  };
};

const readOptionalFlag = (args: ParsedArgs, key: string): string | null => {
  const value = args.flags.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
};

const sanitizeCookieHeader = (value: string): string =>
  value
    .trim()
    .replace(/^cookie:\s*/iu, "")
    .split(/;\s*/u)
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "")
    .join("; ");

const maskCookieHeader = (value: string): string =>
  sanitizeCookieHeader(value)
    .split(/;\s*/u)
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

const findFirstEmail = (value: unknown): string | null => {
  const queue: unknown[] = [value];
  let seen = 0;

  while (queue.length > 0 && seen < 2_000) {
    const current = queue.shift();
    seen += 1;

    if (typeof current === "string") {
      if (current.includes("@")) {
        return current.trim();
      }
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current === "object" && current !== null) {
      for (const [key, nestedValue] of Object.entries(current)) {
        if (key.toLowerCase() === "email" && typeof nestedValue === "string") {
          return nestedValue.trim();
        }
        queue.push(nestedValue);
      }
    }
  }

  return null;
};

const extractHtmlPayload = (
  html: string,
  elementId: "client-bootstrap" | "__NEXT_DATA__",
): string | null => {
  const expression = new RegExp(
    `<script[^>]*id=["']${elementId}["'][^>]*>([\\s\\S]*?)<\\/script>`,
    "iu",
  );
  const match = html.match(expression);
  const payload = match?.[1]?.trim() ?? "";

  return payload === "" ? null : payload;
};

const parseHtmlJson = (
  html: string,
  elementId: "client-bootstrap" | "__NEXT_DATA__",
): unknown | null => {
  const payload = extractHtmlPayload(html, elementId);

  if (payload === null) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const readRequiredFlag = (args: ParsedArgs, key: string): string => {
  const value = readOptionalFlag(args, key);

  if (value === null) {
    throw new Error(`Missing required flag --${key}.`);
  }

  return value;
};

const resolveChromiumBrowser = (
  args: ParsedArgs,
): {
  applicationName: "brave" | "chrome" | "chromium";
  browserId: "brave" | "chrome" | "chromium";
  defaultRoot: string;
  displayName: string;
  secretLabel: string;
} => {
  const browser = (readOptionalFlag(args, "browser") ?? "chrome").toLowerCase();

  if (browser === "chrome") {
    return {
      applicationName: "chrome",
      browserId: "chrome",
      defaultRoot: join(homedir(), ".config", "google-chrome"),
      displayName: "Google Chrome",
      secretLabel: "Chrome Safe Storage",
    };
  }

  if (browser === "chromium") {
    return {
      applicationName: "chromium",
      browserId: "chromium",
      defaultRoot: join(homedir(), ".config", "chromium"),
      displayName: "Chromium",
      secretLabel: "Chromium Safe Storage",
    };
  }

  if (browser === "brave") {
    return {
      applicationName: "brave",
      browserId: "brave",
      defaultRoot: join(homedir(), ".config", "BraveSoftware", "Brave-Browser"),
      displayName: "Brave",
      secretLabel: "Brave Safe Storage",
    };
  }

  throw new Error(
    `Unsupported browser: ${browser}. Use --browser chrome, --browser chromium, or --browser brave.`,
  );
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

    for (const fallbackName of await Bun.$`find ${rootPath} -maxdepth 1 -mindepth 1 -type d -printf '%f\n' 2>/dev/null`
      .text()
      .then((text) =>
        text
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line !== ""),
      )) {
      candidates.add(join(rootPath, fallbackName));
    }

    for (const candidate of candidates) {
      const profileName = candidate.split("/").at(-1) ?? candidate;

      if (explicitProfile !== null && profileName !== explicitProfile) {
        continue;
      }

      const cookieDbPath = join(candidate, "cookies.sqlite");

      if (existsSync(cookieDbPath)) {
        return {
          cookieDbPath,
          profileName,
          rootPath,
        };
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
  localStatePath: string;
  profileName: string;
} => {
  const browser = resolveChromiumBrowser(args);
  const rootPath = readOptionalFlag(args, "root") ?? browser.defaultRoot;
  const profileName = readOptionalFlag(args, "profile") ?? "Default";
  const cookieDbPath = join(rootPath, profileName, "Cookies");
  const localStatePath = join(rootPath, "Local State");

  return {
    browser,
    cookieDbPath,
    localStatePath,
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
    `codex-openai-cookie-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.sqlite`,
  );

  await Bun.write(destinationPath, await Bun.file(sourcePath).arrayBuffer());
  return destinationPath;
};

const readChromiumOpenAICookieRows = async (cookieDbPath: string): Promise<ChromiumCookieRow[]> => {
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
        where host_key like '%chatgpt.com%' or host_key like '%openai.com%'
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

const readFirefoxOpenAICookieRows = async (cookieDbPath: string): Promise<FirefoxCookieRow[]> => {
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
        where host like '%chatgpt.com%' or host like '%openai.com%'
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

const filterCookiesForHeader = (
  cookies: DecryptedCookie[],
  targetHost: string,
): DecryptedCookie[] =>
  cookies.filter((cookie) => {
    const host = cookie.hostKey.startsWith(".") ? cookie.hostKey.slice(1) : cookie.hostKey;
    return (
      host === targetHost || targetHost.endsWith(`.${host}`) || host.endsWith(`.${targetHost}`)
    );
  });

const dedupeCookiesByName = (cookies: DecryptedCookie[]): DecryptedCookie[] => {
  const byName = new Map<string, DecryptedCookie>();

  for (const cookie of cookies) {
    if (!byName.has(cookie.name)) {
      byName.set(cookie.name, cookie);
    }
  }

  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const buildCookieHeader = (cookies: DecryptedCookie[]): string =>
  dedupeCookiesByName(cookies)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

const decryptChromiumOpenAICookies = async (
  args: ParsedArgs,
): Promise<{
  browser: ReturnType<typeof resolveChromiumBrowser>;
  cookieDbPath: string;
  decryptedCookies: DecryptedCookie[];
  localStatePath: string;
  profileName: string;
}> => {
  const { browser, cookieDbPath, localStatePath, profileName } = resolveChromiumProfilePaths(args);
  const libsecretPassword = await getLibsecretPassword(browser.applicationName);
  const key = deriveChromiumLinuxKey(libsecretPassword);
  const cookieRows = await readChromiumOpenAICookieRows(cookieDbPath);
  const decryptedCookies: DecryptedCookie[] = [];

  for (const row of cookieRows) {
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
    localStatePath,
    profileName,
  };
};

const readFirefoxOpenAICookies = async (
  args: ParsedArgs,
): Promise<{
  cookieDbPath: string;
  profileName: string;
  rootPath: string;
  decryptedCookies: DecryptedCookie[];
}> => {
  const { cookieDbPath, profileName, rootPath } = await resolveFirefoxProfilePaths(args);
  const rows = await readFirefoxOpenAICookieRows(cookieDbPath);

  return {
    cookieDbPath,
    profileName,
    rootPath,
    decryptedCookies: rows
      .filter((row) => row.value.trim() !== "")
      .map((row) => ({
        hostKey: row.hostKey,
        name: row.name,
        path: row.path,
        topFrameSiteKey: "",
        value: row.value,
      })),
  };
};

const detectAuthStatusFromHtml = (html: string): string | null => {
  const clientBootstrap = parseHtmlJson(html, "client-bootstrap");

  if (typeof clientBootstrap === "object" && clientBootstrap !== null) {
    const queue: unknown[] = [clientBootstrap];

    while (queue.length > 0) {
      const current = queue.shift();

      if (typeof current === "object" && current !== null) {
        for (const [key, nestedValue] of Object.entries(current)) {
          if (key.toLowerCase() === "authstatus" && typeof nestedValue === "string") {
            return nestedValue;
          }

          queue.push(nestedValue);
        }
      } else if (Array.isArray(current)) {
        queue.push(...current);
      }
    }
  }

  return null;
};

const detectSignedInEmailFromHtml = (html: string): string | null => {
  const clientBootstrap = parseHtmlJson(html, "client-bootstrap");
  const nextData = parseHtmlJson(html, "__NEXT_DATA__");

  return findFirstEmail(clientBootstrap) ?? findFirstEmail(nextData);
};

const resolveCookieSource = async (args: ParsedArgs): Promise<CookieSourceInput> => {
  const inlineHeader = readOptionalFlag(args, "cookie-header");

  if (inlineHeader !== null) {
    return {
      header: sanitizeCookieHeader(inlineHeader),
      sourceLabel: "--cookie-header",
    };
  }

  const headerFilePath = readOptionalFlag(args, "cookie-header-file");

  if (headerFilePath !== null) {
    return {
      header: sanitizeCookieHeader(await readFile(headerFilePath, "utf8")),
      sourceLabel: `--cookie-header-file ${headerFilePath}`,
    };
  }

  const envName = readOptionalFlag(args, "cookie-header-env");

  if (envName !== null) {
    const envValue = process.env[envName];

    if (typeof envValue === "string" && envValue.trim() !== "") {
      return {
        header: sanitizeCookieHeader(envValue),
        sourceLabel: `env:${envName}`,
      };
    }
  }

  throw new Error(
    "Missing cookie header. Use --cookie-header, --cookie-header-file, or --cookie-header-env.",
  );
};

const fetchJsonEndpoint = async (
  url: string,
  cookieHeader: string,
): Promise<{
  bodyText: string;
  contentType: string | null;
  email: string | null;
  ok: boolean;
  status: number;
}> => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
    },
  });

  const bodyText = await response.text();
  let email: string | null = null;

  try {
    email = findFirstEmail(JSON.parse(bodyText));
  } catch {
    email = null;
  }

  return {
    bodyText,
    contentType: response.headers.get("content-type"),
    email,
    ok: response.ok,
    status: response.status,
  };
};

const fetchEndpoint = async (
  url: string,
  options: {
    authorizationToken?: string | null;
    cookieHeader: string;
  },
): Promise<{
  bodyText: string;
  contentType: string | null;
  ok: boolean;
  status: number;
}> => {
  const headers = new Headers({
    Accept: "application/json,text/plain,*/*",
    Cookie: options.cookieHeader,
  });

  if (options.authorizationToken) {
    headers.set("Authorization", `Bearer ${options.authorizationToken}`);
  }

  const response = await fetch(url, { headers });

  return {
    bodyText: await response.text(),
    contentType: response.headers.get("content-type"),
    ok: response.ok,
    status: response.status,
  };
};

const printUsage = (): void => {
  console.log(`Usage:
  bun run skipe/codex-openai-linux-spike.ts list-cookie-stores [--home PATH]
  bun run skipe/codex-openai-linux-spike.ts inspect-firefox-openai-cookies [--profile NAME] [--root PATH]
  bun run skipe/codex-openai-linux-spike.ts inspect-chromium-openai-cookies [--browser chrome|chromium|brave] [--profile NAME] [--root PATH]
  bun run skipe/codex-openai-linux-spike.ts probe-firefox-openai-session [--profile NAME] [--root PATH] [--email ADDRESS]
  bun run skipe/codex-openai-linux-spike.ts probe-firefox-wham-endpoints [--profile NAME] [--root PATH]
  bun run skipe/codex-openai-linux-spike.ts probe-chromium-openai-session [--browser chrome|chromium|brave] [--profile NAME] [--root PATH] [--email ADDRESS]
  bun run skipe/codex-openai-linux-spike.ts probe-chromium-openai-dashboard [--browser chrome|chromium|brave] [--profile NAME] [--root PATH] [--email ADDRESS] [--save-body PATH]
  bun run skipe/codex-openai-linux-spike.ts probe-chromium-wham-endpoints [--browser chrome|chromium|brave] [--profile NAME] [--root PATH]
  bun run skipe/codex-openai-linux-spike.ts probe-openai-session (--cookie-header ... | --cookie-header-file PATH | --cookie-header-env VAR) [--email ADDRESS]
  bun run skipe/codex-openai-linux-spike.ts probe-openai-dashboard (--cookie-header ... | --cookie-header-file PATH | --cookie-header-env VAR) [--email ADDRESS] [--save-body PATH]
`);
};

const createFirefoxCandidates = (homePath: string): string[] => {
  const roots = [
    join(homePath, ".config", "mozilla", "firefox"),
    join(homePath, ".mozilla", "firefox"),
    join(homePath, "snap", "firefox", "common", ".mozilla", "firefox"),
  ];

  const candidates = new Set<string>();

  for (const root of roots) {
    candidates.add(join(root, "profiles.ini"));
    candidates.add(join(root, "cookies.sqlite"));
  }

  return [...candidates];
};

const createChromiumCandidates = (homePath: string): string[] => {
  const roots = [
    join(homePath, ".config", "google-chrome"),
    join(homePath, ".config", "google-chrome-beta"),
    join(homePath, ".config", "chromium"),
    join(homePath, ".config", "BraveSoftware", "Brave-Browser"),
    join(homePath, ".config", "microsoft-edge"),
    join(homePath, ".config", "vivaldi"),
    join(homePath, ".config", "opera"),
    join(homePath, "snap", "chromium", "common", "chromium"),
  ];

  const profileNames = ["Default", "Profile 1", "Profile 2", "Profile 3", "Guest Profile"];
  const candidates = new Set<string>();

  for (const root of roots) {
    candidates.add(join(root, "Local State"));

    for (const profileName of profileNames) {
      candidates.add(join(root, profileName, "Cookies"));
      candidates.add(join(root, profileName, "Network", "Cookies"));
    }
  }

  return [...candidates];
};

const listCookieStores = async (args: ParsedArgs): Promise<void> => {
  const homePath = readOptionalFlag(args, "home") ?? homedir();
  const firefoxCandidates = createFirefoxCandidates(homePath);
  const chromiumCandidates = createChromiumCandidates(homePath);

  console.log(`Linux cookie-store discovery
home: ${homePath}
`);

  console.log("Firefox candidates:");
  for (const candidate of firefoxCandidates) {
    console.log(`- ${existsSync(candidate) ? "[found]" : "[miss]"} ${candidate}`);
  }

  console.log("\nChromium-family candidates:");
  for (const candidate of chromiumCandidates) {
    console.log(`- ${existsSync(candidate) ? "[found]" : "[miss]"} ${candidate}`);
  }

  console.log(`
Notes:
- Firefox cookie extraction should come from cookies.sqlite.
- Chromium-family cookie extraction is likely to require Linux-specific decryption work.
- This script currently discovers likely stores only; it does not decrypt cookies yet.
`);
};

const probeOpenAISession = async (args: ParsedArgs): Promise<void> => {
  const cookieSource = await resolveCookieSource(args);
  const expectedEmail = normalizeEmail(readOptionalFlag(args, "email"));

  console.log(`Cookie source: ${cookieSource.sourceLabel}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieSource.header)}`);

  let matchedEmail: string | null = null;

  for (const endpoint of openAISessionEndpoints) {
    console.log(`\nEndpoint: ${endpoint}`);

    try {
      const result = await fetchJsonEndpoint(endpoint, cookieSource.header);
      console.log(`- status: ${result.status}`);
      console.log(`- content-type: ${result.contentType ?? "unknown"}`);
      console.log(`- parsed email: ${result.email ?? "none"}`);

      if (result.ok && result.email !== null && matchedEmail === null) {
        matchedEmail = result.email;
      }

      if (!result.ok) {
        console.log(`- body sample: ${result.bodyText.slice(0, 240)}`);
      }
    } catch (error) {
      console.log(`- request failed: ${String(error)}`);
    }
  }

  if (expectedEmail !== null) {
    const matches = normalizeEmail(matchedEmail) === expectedEmail;
    console.log(`\nExpected email: ${expectedEmail}`);
    console.log(`Match result: ${matches ? "match" : "mismatch"}`);
  }
};

const inspectChromiumOpenAICookies = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumOpenAICookies(args);

  console.log(`Browser: ${result.browser.displayName}`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie DB: ${result.cookieDbPath}`);
  console.log(
    `Local State: ${result.localStatePath} (${existsSync(result.localStatePath) ? "found" : "missing"})`,
  );
  console.log(`Decrypted OpenAI cookie count: ${result.decryptedCookies.length}`);

  for (const cookie of result.decryptedCookies) {
    console.log(`- ${cookie.hostKey} | ${cookie.name}`);
  }

  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const openaiCookies = filterCookiesForHeader(result.decryptedCookies, "openai.com");

  console.log(`\nHeader candidates:`);
  console.log(`- chatgpt.com cookies: ${dedupeCookiesByName(chatgptCookies).length}`);
  console.log(`- openai.com cookies: ${dedupeCookiesByName(openaiCookies).length}`);
};

const inspectFirefoxOpenAICookies = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxOpenAICookies(args);

  console.log(`Browser: Firefox`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie DB: ${result.cookieDbPath}`);
  console.log(`Root: ${result.rootPath}`);
  console.log(`OpenAI cookie count: ${result.decryptedCookies.length}`);

  for (const cookie of result.decryptedCookies) {
    console.log(`- ${cookie.hostKey} | ${cookie.name}`);
  }

  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const openaiCookies = filterCookiesForHeader(result.decryptedCookies, "openai.com");

  console.log(`\nHeader candidates:`);
  console.log(`- chatgpt.com cookies: ${dedupeCookiesByName(chatgptCookies).length}`);
  console.log(`- openai.com cookies: ${dedupeCookiesByName(openaiCookies).length}`);
};

const probeChromiumOpenAISession = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumOpenAICookies(args);
  const expectedEmail = normalizeEmail(readOptionalFlag(args, "email"));
  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const cookieHeader = buildCookieHeader(chatgptCookies);

  if (cookieHeader === "") {
    throw new Error("No decrypted chatgpt.com cookies were available to build a header.");
  }

  console.log(`Browser: ${result.browser.displayName}`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  let matchedEmail: string | null = null;

  for (const endpoint of openAISessionEndpoints) {
    console.log(`\nEndpoint: ${endpoint}`);

    try {
      const sessionResult = await fetchJsonEndpoint(endpoint, cookieHeader);
      console.log(`- status: ${sessionResult.status}`);
      console.log(`- content-type: ${sessionResult.contentType ?? "unknown"}`);
      console.log(`- parsed email: ${sessionResult.email ?? "none"}`);

      if (sessionResult.ok && sessionResult.email !== null && matchedEmail === null) {
        matchedEmail = sessionResult.email;
      }

      if (!sessionResult.ok) {
        console.log(`- body sample: ${sessionResult.bodyText.slice(0, 240)}`);
      }
    } catch (error) {
      console.log(`- request failed: ${String(error)}`);
    }
  }

  if (expectedEmail !== null) {
    console.log(`\nExpected email: ${expectedEmail}`);
    console.log(
      `Match result: ${normalizeEmail(matchedEmail) === expectedEmail ? "match" : "mismatch"}`,
    );
  }
};

const probeFirefoxOpenAISession = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxOpenAICookies(args);
  const expectedEmail = normalizeEmail(readOptionalFlag(args, "email"));
  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const cookieHeader = buildCookieHeader(chatgptCookies);

  if (cookieHeader === "") {
    throw new Error("No Firefox chatgpt.com cookies were available to build a header.");
  }

  console.log(`Browser: Firefox`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  let matchedEmail: string | null = null;

  for (const endpoint of openAISessionEndpoints) {
    console.log(`\nEndpoint: ${endpoint}`);

    try {
      const sessionResult = await fetchJsonEndpoint(endpoint, cookieHeader);
      console.log(`- status: ${sessionResult.status}`);
      console.log(`- content-type: ${sessionResult.contentType ?? "unknown"}`);
      console.log(`- parsed email: ${sessionResult.email ?? "none"}`);

      if (sessionResult.ok && sessionResult.email !== null && matchedEmail === null) {
        matchedEmail = sessionResult.email;
      }

      if (!sessionResult.ok) {
        console.log(`- body sample: ${sessionResult.bodyText.slice(0, 240)}`);
      }
    } catch (error) {
      console.log(`- request failed: ${String(error)}`);
    }
  }

  if (expectedEmail !== null) {
    console.log(`\nExpected email: ${expectedEmail}`);
    console.log(
      `Match result: ${normalizeEmail(matchedEmail) === expectedEmail ? "match" : "mismatch"}`,
    );
  }
};

const probeChromiumOpenAIDashboard = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumOpenAICookies(args);
  const expectedEmail = normalizeEmail(readOptionalFlag(args, "email"));
  const saveBodyPath = readOptionalFlag(args, "save-body");
  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const cookieHeader = buildCookieHeader(chatgptCookies);

  if (cookieHeader === "") {
    throw new Error("No decrypted chatgpt.com cookies were available to build a header.");
  }

  console.log(`Browser: ${result.browser.displayName}`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  const response = await fetch(codexUsageUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookieHeader,
    },
  });

  const bodyText = await response.text();
  const signedInEmail = detectSignedInEmailFromHtml(bodyText);
  const authStatus = detectAuthStatusFromHtml(bodyText);
  const hasClientBootstrap = extractHtmlPayload(bodyText, "client-bootstrap") !== null;
  const hasNextData = extractHtmlPayload(bodyText, "__NEXT_DATA__") !== null;
  const loginLikeSignals =
    /log in|sign in|continue with google|continue with apple|auth0|login/iu.test(bodyText);
  const hasCodeReviewText = /code review/iu.test(bodyText);
  const hasCreditsHistoryText = /credits usage history/iu.test(bodyText);
  const hasUsageBreakdownText = /usage breakdown/iu.test(bodyText);

  console.log(`- status: ${response.status}`);
  console.log(`- content-type: ${response.headers.get("content-type") ?? "unknown"}`);
  console.log(`- signed-in email from HTML: ${signedInEmail ?? "none"}`);
  console.log(`- auth status from HTML: ${authStatus ?? "none"}`);
  console.log(`- has client-bootstrap: ${hasClientBootstrap}`);
  console.log(`- has __NEXT_DATA__: ${hasNextData}`);
  console.log(`- login-like signals in body: ${loginLikeSignals}`);
  console.log(`- has 'Code review' text: ${hasCodeReviewText}`);
  console.log(`- has 'Credits usage history' text: ${hasCreditsHistoryText}`);
  console.log(`- has 'Usage breakdown' text: ${hasUsageBreakdownText}`);

  if (expectedEmail !== null) {
    console.log(`- expected email match: ${normalizeEmail(signedInEmail) === expectedEmail}`);
  }

  if (saveBodyPath !== null) {
    await mkdir(join(saveBodyPath, ".."), { recursive: true }).catch(() => undefined);
    await writeFile(saveBodyPath, bodyText, "utf8");
    console.log(`- saved body: ${saveBodyPath}`);
    return;
  }

  const fallbackPath = join(tmpdir(), `codex-openai-dashboard-${Date.now().toString(36)}.html`);
  await writeFile(fallbackPath, bodyText, "utf8");
  console.log(`- saved body: ${fallbackPath}`);
};

const parseSessionAccessToken = (bodyText: string): string | null => {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const accessToken = parsed["accessToken"];

    return typeof accessToken === "string" && accessToken.trim() !== "" ? accessToken : null;
  } catch {
    return null;
  }
};

const parseSessionAccountId = (bodyText: string): string | null => {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const account = parsed["account"];

    if (typeof account === "object" && account !== null) {
      const accountId = (account as Record<string, unknown>)["id"];
      return typeof accountId === "string" && accountId.trim() !== "" ? accountId : null;
    }

    return null;
  } catch {
    return null;
  }
};

const summarizeJsonShape = (value: unknown, depth = 0): string => {
  if (depth >= 2) {
    if (Array.isArray(value)) {
      return `array(len=${value.length})`;
    }

    if (typeof value === "object" && value !== null) {
      return "object";
    }

    return typeof value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "array(len=0)";
    }

    return `array(len=${value.length}, first=${summarizeJsonShape(value[0], depth + 1)})`;
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).slice(0, 12);
    const parts = entries.map(
      ([key, nestedValue]) => `${key}:${summarizeJsonShape(nestedValue, depth + 1)}`,
    );
    return `object{${parts.join(", ")}}`;
  }

  return typeof value;
};

const probeChromiumWhamEndpoints = async (args: ParsedArgs): Promise<void> => {
  const result = await decryptChromiumOpenAICookies(args);
  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const cookieHeader = buildCookieHeader(chatgptCookies);

  if (cookieHeader === "") {
    throw new Error("No decrypted chatgpt.com cookies were available to build a header.");
  }

  console.log(`Browser: ${result.browser.displayName}`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  const authSessionResult = await fetchJsonEndpoint(
    "https://chatgpt.com/api/auth/session",
    cookieHeader,
  ).catch(() => null);
  const accessToken = authSessionResult
    ? parseSessionAccessToken(authSessionResult.bodyText)
    : null;
  const accountId = authSessionResult ? parseSessionAccountId(authSessionResult.bodyText) : null;

  console.log(`Access token from /api/auth/session: ${accessToken ? "present" : "missing"}`);
  console.log(`Account id from /api/auth/session: ${accountId ? "present" : "missing"}`);

  for (const endpoint of whamEndpoints) {
    console.log(`\nEndpoint: ${endpoint}`);

    const cookieOnly = await fetchEndpoint(endpoint, {
      cookieHeader,
    }).catch((error) => ({
      bodyText: String(error),
      contentType: null,
      ok: false,
      status: -1,
    }));

    console.log(`- cookie-only status: ${cookieOnly.status}`);
    console.log(`- cookie-only content-type: ${cookieOnly.contentType ?? "unknown"}`);

    if (!cookieOnly.ok) {
      console.log(`- cookie-only body sample: ${cookieOnly.bodyText.slice(0, 220)}`);
    }

    if (accessToken !== null) {
      const headers = new Headers({
        Accept: "application/json,text/plain,*/*",
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookieHeader,
      });

      if (accountId !== null) {
        headers.set("ChatGPT-Account-Id", accountId);
      }

      const cookieAndBearer = await fetch(endpoint, {
        headers,
      })
        .then(async (response) => ({
          bodyText: await response.text(),
          contentType: response.headers.get("content-type"),
          ok: response.ok,
          status: response.status,
        }))
        .catch((error) => ({
          bodyText: String(error),
          contentType: null,
          ok: false,
          status: -1,
        }));

      console.log(`- cookie+bearer status: ${cookieAndBearer.status}`);
      console.log(`- cookie+bearer content-type: ${cookieAndBearer.contentType ?? "unknown"}`);

      if (!cookieAndBearer.ok) {
        console.log(`- cookie+bearer body sample: ${cookieAndBearer.bodyText.slice(0, 220)}`);
      } else {
        try {
          const parsed = JSON.parse(cookieAndBearer.bodyText);
          console.log(`- cookie+bearer shape: ${summarizeJsonShape(parsed)}`);
        } catch {
          console.log(`- cookie+bearer body sample: ${cookieAndBearer.bodyText.slice(0, 220)}`);
        }
      }
    }
  }
};

const probeFirefoxWhamEndpoints = async (args: ParsedArgs): Promise<void> => {
  const result = await readFirefoxOpenAICookies(args);
  const chatgptCookies = filterCookiesForHeader(result.decryptedCookies, "chatgpt.com");
  const cookieHeader = buildCookieHeader(chatgptCookies);

  if (cookieHeader === "") {
    throw new Error("No Firefox chatgpt.com cookies were available to build a header.");
  }

  console.log(`Browser: Firefox`);
  console.log(`Profile: ${result.profileName}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieHeader)}`);

  const authSessionResult = await fetchJsonEndpoint(
    "https://chatgpt.com/api/auth/session",
    cookieHeader,
  ).catch(() => null);
  const accessToken = authSessionResult
    ? parseSessionAccessToken(authSessionResult.bodyText)
    : null;
  const accountId = authSessionResult ? parseSessionAccountId(authSessionResult.bodyText) : null;

  console.log(`Access token from /api/auth/session: ${accessToken ? "present" : "missing"}`);
  console.log(`Account id from /api/auth/session: ${accountId ? "present" : "missing"}`);

  for (const endpoint of whamEndpoints) {
    console.log(`\nEndpoint: ${endpoint}`);

    const cookieOnly = await fetchEndpoint(endpoint, {
      cookieHeader,
    }).catch((error) => ({
      bodyText: String(error),
      contentType: null,
      ok: false,
      status: -1,
    }));

    console.log(`- cookie-only status: ${cookieOnly.status}`);
    console.log(`- cookie-only content-type: ${cookieOnly.contentType ?? "unknown"}`);

    if (!cookieOnly.ok) {
      console.log(`- cookie-only body sample: ${cookieOnly.bodyText.slice(0, 220)}`);
    }

    if (accessToken !== null) {
      const headers = new Headers({
        Accept: "application/json,text/plain,*/*",
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookieHeader,
      });

      if (accountId !== null) {
        headers.set("ChatGPT-Account-Id", accountId);
      }

      const cookieAndBearer = await fetch(endpoint, {
        headers,
      })
        .then(async (response) => ({
          bodyText: await response.text(),
          contentType: response.headers.get("content-type"),
          ok: response.ok,
          status: response.status,
        }))
        .catch((error) => ({
          bodyText: String(error),
          contentType: null,
          ok: false,
          status: -1,
        }));

      console.log(`- cookie+bearer status: ${cookieAndBearer.status}`);
      console.log(`- cookie+bearer content-type: ${cookieAndBearer.contentType ?? "unknown"}`);

      if (!cookieAndBearer.ok) {
        console.log(`- cookie+bearer body sample: ${cookieAndBearer.bodyText.slice(0, 220)}`);
      } else {
        try {
          const parsed = JSON.parse(cookieAndBearer.bodyText);
          console.log(`- cookie+bearer shape: ${summarizeJsonShape(parsed)}`);
        } catch {
          console.log(`- cookie+bearer body sample: ${cookieAndBearer.bodyText.slice(0, 220)}`);
        }
      }
    }
  }
};

const probeOpenAIDashboard = async (args: ParsedArgs): Promise<void> => {
  const cookieSource = await resolveCookieSource(args);
  const expectedEmail = normalizeEmail(readOptionalFlag(args, "email"));
  const saveBodyPath = readOptionalFlag(args, "save-body");

  console.log(`Cookie source: ${cookieSource.sourceLabel}`);
  console.log(`Cookie names: ${maskCookieHeader(cookieSource.header)}`);
  console.log(`URL: ${codexUsageUrl}`);

  const response = await fetch(codexUsageUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      Cookie: cookieSource.header,
    },
  });

  const bodyText = await response.text();
  const signedInEmail = detectSignedInEmailFromHtml(bodyText);
  const authStatus = detectAuthStatusFromHtml(bodyText);
  const hasClientBootstrap = extractHtmlPayload(bodyText, "client-bootstrap") !== null;
  const hasNextData = extractHtmlPayload(bodyText, "__NEXT_DATA__") !== null;
  const loginLikeSignals =
    /log in|sign in|continue with google|continue with apple|auth0|login/iu.test(bodyText);

  console.log(`- status: ${response.status}`);
  console.log(`- content-type: ${response.headers.get("content-type") ?? "unknown"}`);
  console.log(`- signed-in email from HTML: ${signedInEmail ?? "none"}`);
  console.log(`- auth status from HTML: ${authStatus ?? "none"}`);
  console.log(`- has client-bootstrap: ${hasClientBootstrap}`);
  console.log(`- has __NEXT_DATA__: ${hasNextData}`);
  console.log(`- login-like signals in body: ${loginLikeSignals}`);

  if (expectedEmail !== null) {
    const matches = normalizeEmail(signedInEmail) === expectedEmail;
    console.log(`- expected email match: ${matches}`);
  }

  if (saveBodyPath !== null) {
    await mkdir(join(saveBodyPath, ".."), { recursive: true }).catch(() => undefined);
    await writeFile(saveBodyPath, bodyText, "utf8");
    console.log(`- saved body: ${saveBodyPath}`);
    return;
  }

  const fallbackPath = join(tmpdir(), `codex-openai-dashboard-${Date.now().toString(36)}.html`);
  await writeFile(fallbackPath, bodyText, "utf8");
  console.log(`- saved body: ${fallbackPath}`);
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const command = (args.positionals[0] ?? "help") as CommandName;

  switch (command) {
    case "help":
      printUsage();
      return;
    case "inspect-firefox-openai-cookies":
      await inspectFirefoxOpenAICookies(args);
      return;
    case "inspect-chromium-openai-cookies":
      await inspectChromiumOpenAICookies(args);
      return;
    case "list-cookie-stores":
      await listCookieStores(args);
      return;
    case "probe-firefox-openai-session":
      await probeFirefoxOpenAISession(args);
      return;
    case "probe-firefox-wham-endpoints":
      await probeFirefoxWhamEndpoints(args);
      return;
    case "probe-chromium-openai-session":
      await probeChromiumOpenAISession(args);
      return;
    case "probe-chromium-openai-dashboard":
      await probeChromiumOpenAIDashboard(args);
      return;
    case "probe-chromium-wham-endpoints":
      await probeChromiumWhamEndpoints(args);
      return;
    case "probe-openai-session":
      await probeOpenAISession(args);
      return;
    case "probe-openai-dashboard":
      await probeOpenAIDashboard(args);
      return;
    default:
      printUsage();
      throw new Error(`Unknown command: ${command}`);
  }
};

await main();
