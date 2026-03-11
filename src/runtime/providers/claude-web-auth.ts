import { readChromiumCookies } from "@/runtime/browser-cookies/chromium.ts";
import { readFirefoxCookies } from "@/runtime/browser-cookies/firefox.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import type { ClaudeWebSessionSnapshot } from "@/runtime/providers/claude-web-models.ts";
import { isRecord, parseJsonText, readString } from "@/runtime/providers/shared.ts";

const sanitizeClaudeSessionToken = (value: string): string | null => {
  const normalizedValue = value.trim().replace(/^cookie:\s*/iu, "");

  if (normalizedValue === "") {
    return null;
  }

  if (normalizedValue.startsWith("sessionKey=")) {
    const tokenValue = normalizedValue.slice("sessionKey=".length).split(";", 1)[0]?.trim() ?? "";
    return tokenValue === "" ? null : tokenValue;
  }

  return normalizedValue;
};

const fetchClaudeAccount = async (
  host: RuntimeHost,
  sessionToken: string,
): Promise<Record<string, unknown> | null> => {
  const response = await host.http.request("https://claude.ai/api/account", {
    headers: {
      Accept: "application/json",
      Cookie: `sessionKey=${sessionToken}`,
    },
    method: "GET",
    timeoutMs: 8000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }

  const payload = parseJsonText(response.bodyText);
  return isRecord(payload) ? payload : null;
};

const fetchClaudeOrganization = async (
  host: RuntimeHost,
  sessionToken: string,
): Promise<{ id: string; name: string | null } | null> => {
  const response = await host.http.request("https://claude.ai/api/organizations", {
    headers: {
      Accept: "application/json",
      Cookie: `sessionKey=${sessionToken}`,
    },
    method: "GET",
    timeoutMs: 8000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }

  const payload = parseJsonText(response.bodyText);

  if (!Array.isArray(payload)) {
    return null;
  }

  const firstOrganization = payload.find((entry): entry is Record<string, unknown> =>
    isRecord(entry),
  );

  if (firstOrganization === undefined) {
    return null;
  }

  const organizationId = readString(firstOrganization, "id");

  if (organizationId === null) {
    return null;
  }

  return {
    id: organizationId,
    name: readString(firstOrganization, "name"),
  };
};

const buildClaudeSessionSnapshot = async (
  host: RuntimeHost,
  sessionToken: string,
): Promise<ClaudeWebSessionSnapshot | null> => {
  const [accountRecord, organization] = await Promise.all([
    fetchClaudeAccount(host, sessionToken),
    fetchClaudeOrganization(host, sessionToken),
  ]);

  if (organization === null) {
    return null;
  }

  return {
    accountEmail: accountRecord ? readString(accountRecord, "email_address") : null,
    organizationId: organization.id,
    organizationName: organization.name,
    sessionToken,
  };
};

const resolveAutoClaudeSession = async (
  host: RuntimeHost,
): Promise<ClaudeWebSessionSnapshot | null> => {
  const [firefoxCookies, chromiumCookies] = await Promise.all([
    readFirefoxCookies(host, {
      domains: ["claude.ai"],
      names: ["sessionKey"],
    }),
    readChromiumCookies(host, {
      browsers: ["chrome", "chromium", "brave"],
      domains: ["claude.ai"],
      names: ["sessionKey"],
    }),
  ]);

  const sessionTokens = [...firefoxCookies, ...chromiumCookies]
    .map((cookie) => sanitizeClaudeSessionToken(cookie.value))
    .filter((value): value is string => value !== null);
  const dedupedSessionTokens = [...new Set(sessionTokens)];

  for (const sessionToken of dedupedSessionTokens) {
    const sessionSnapshot = await buildClaudeSessionSnapshot(host, sessionToken);

    if (sessionSnapshot !== null) {
      return sessionSnapshot;
    }
  }

  return null;
};

const resolveClaudeWebSession = async (
  host: RuntimeHost,
  input: {
    cookieSource: "auto" | "manual";
    manualSessionToken: string | null;
  },
): Promise<ClaudeWebSessionSnapshot | null> => {
  if (input.cookieSource === "manual") {
    const sessionToken =
      input.manualSessionToken === null
        ? null
        : sanitizeClaudeSessionToken(input.manualSessionToken);

    return sessionToken === null ? null : buildClaudeSessionSnapshot(host, sessionToken);
  }

  return resolveAutoClaudeSession(host);
};

export { resolveClaudeWebSession, sanitizeClaudeSessionToken };
