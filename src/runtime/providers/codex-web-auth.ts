import { explicitNull } from "@/core/providers/shared.ts";
import { readChromiumCookies } from "@/runtime/browser-cookies/chromium.ts";
import { readFirefoxCookies } from "@/runtime/browser-cookies/firefox.ts";
import type { BrowserCookieRecord } from "@/runtime/browser-cookies/models.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import type { CodexWebAuthSession } from "@/runtime/providers/codex-web-auth-models.ts";
import {
  isRecord,
  parseJsonText,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

const cookieCandidateOrder = ["firefox", "chrome", "chromium", "brave"] as const;

const sanitizeCookieHeader = (value: string): string =>
  value
    .trim()
    .replace(/^cookie:\s*/iu, "")
    .split(/;\s*/u)
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "")
    .join("; ");

const buildCookieHeader = (cookies: BrowserCookieRecord[]): string => {
  const cookieMap = new Map<string, string>();

  for (const cookie of cookies) {
    if (!cookieMap.has(cookie.name)) {
      cookieMap.set(cookie.name, cookie.value);
    }
  }

  return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
};

const groupCookieCandidates = (cookies: BrowserCookieRecord[]): string[] => {
  const groupedCookies = new Map<string, BrowserCookieRecord[]>();

  for (const cookie of cookies) {
    const groupKey = `${cookie.browserId}:${cookie.profileName}`;
    const group = groupedCookies.get(groupKey) ?? [];
    group.push(cookie);
    groupedCookies.set(groupKey, group);
  }

  return [...groupedCookies.entries()]
    .toSorted((left, right) => {
      const leftOrder = cookieCandidateOrder.indexOf(left[1][0]?.browserId ?? "brave");
      const rightOrder = cookieCandidateOrder.indexOf(right[1][0]?.browserId ?? "brave");

      if (leftOrder === rightOrder) {
        return left[0].localeCompare(right[0]);
      }

      return leftOrder - rightOrder;
    })
    .map(([, grouped]) => buildCookieHeader(grouped))
    .filter((value) => value !== "");
};

const fetchCodexSessionCandidate = async (
  host: RuntimeHost,
  cookieHeader: string,
): Promise<CodexWebAuthSession | null> => {
  const response = await host.http.request("https://chatgpt.com/api/auth/session", {
    headers: {
      Accept: "application/json",
      Cookie: cookieHeader,
    },
    method: "GET",
    timeoutMs: 8000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return null;
  }

  const payload = parseJsonText(response.bodyText);

  if (!isRecord(payload)) {
    return null;
  }

  const accessToken = readString(payload, "accessToken");

  if (accessToken === null) {
    return null;
  }

  const accountRecord = readNestedRecord(payload, "account");

  return {
    accessToken,
    accountEmail:
      readString(payload, "email") ??
      (accountRecord ? readString(accountRecord, "email") : explicitNull),
    accountId: accountRecord ? readString(accountRecord, "id") : explicitNull,
    cookieHeader,
  };
};

const resolveAutoCodexWebSession = async (
  host: RuntimeHost,
  expectedEmail: string | null,
): Promise<CodexWebAuthSession | null> => {
  const [firefoxCookies, chromiumCookies] = await Promise.all([
    readFirefoxCookies(host, {
      domains: ["chatgpt.com", "openai.com"],
    }),
    readChromiumCookies(host, {
      browsers: ["chrome", "chromium", "brave"],
      domains: ["chatgpt.com", "openai.com"],
    }),
  ]);

  const cookieHeaders = groupCookieCandidates([...firefoxCookies, ...chromiumCookies]);

  for (const cookieHeader of cookieHeaders) {
    const session = await fetchCodexSessionCandidate(host, cookieHeader);

    if (session === null) {
      continue;
    }

    if (
      expectedEmail !== null &&
      session.accountEmail !== null &&
      session.accountEmail.toLowerCase() !== expectedEmail.toLowerCase()
    ) {
      continue;
    }

    return session;
  }

  return null;
};

const resolveCodexWebSession = async (
  host: RuntimeHost,
  input: {
    cookieHeader: string | null;
    cookieSource: "auto" | "manual" | "off";
    expectedEmail: string | null;
  },
): Promise<CodexWebAuthSession | null> => {
  if (input.cookieSource === "off") {
    return null;
  }

  if (input.cookieSource === "manual") {
    if (input.cookieHeader === null) {
      return null;
    }

    const session = await fetchCodexSessionCandidate(
      host,
      sanitizeCookieHeader(input.cookieHeader),
    );

    if (
      session !== null &&
      input.expectedEmail !== null &&
      session.accountEmail !== null &&
      session.accountEmail.toLowerCase() !== input.expectedEmail.toLowerCase()
    ) {
      return null;
    }

    return session;
  }

  return resolveAutoCodexWebSession(host, input.expectedEmail);
};

export { resolveCodexWebSession, sanitizeCookieHeader };
