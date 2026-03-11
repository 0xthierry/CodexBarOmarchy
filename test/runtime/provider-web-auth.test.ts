import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import { explicitNull } from "../../src/core/providers/shared.ts";
import type {
  RuntimeCommandLineSession,
  RuntimeHost,
  RuntimeHttpRequestOptions,
  RuntimeHttpResponse,
} from "../../src/runtime/host.ts";
import { resolveClaudeWebSession } from "../../src/runtime/providers/claude-web-auth.ts";
import { resolveCodexWebSession } from "../../src/runtime/providers/codex-web-auth.ts";

const writeFirefoxCookies = async (
  cookieDbPath: string,
  entries: {
    host: string;
    name: string;
    path: string;
    value: string;
  }[],
): Promise<void> => {
  await mkdir(dirname(cookieDbPath), { recursive: true });
  const database = new Database(cookieDbPath);

  try {
    database.run(`
      create table moz_cookies (
        host text,
        name text,
        path text,
        value text
      )
    `);

    const statement = database.query(`
      insert into moz_cookies (host, name, path, value)
      values (?, ?, ?, ?)
    `);

    for (const entry of entries) {
      statement.run(entry.host, entry.name, entry.path, entry.value);
    }
  } finally {
    database.close();
  }
};

const writeFirefoxProfiles = async (
  homeDirectory: string,
  profiles: {
    cookies: {
      host: string;
      name: string;
      path: string;
      value: string;
    }[];
    profileName: string;
  }[],
): Promise<void> => {
  const firefoxRoot = join(homeDirectory, ".config", "mozilla", "firefox");
  const profilesIniLines = profiles.flatMap((profile, index) => [
    `[Profile${String(index)}]`,
    `Name=${profile.profileName}`,
    `Path=${profile.profileName}`,
    "",
  ]);

  await mkdir(firefoxRoot, { recursive: true });
  await writeFile(join(firefoxRoot, "profiles.ini"), `${profilesIniLines.join("\n")}\n`, "utf8");

  for (const profile of profiles) {
    await writeFirefoxCookies(
      join(firefoxRoot, profile.profileName, "cookies.sqlite"),
      profile.cookies,
    );
  }
};

const createHost = (
  homeDirectory: string,
  request: (url: string, options?: RuntimeHttpRequestOptions) => Promise<RuntimeHttpResponse>,
): RuntimeHost => ({
  commands: {
    createLineSession: async (): Promise<RuntimeCommandLineSession> => {
      throw new Error("Line sessions are not used in this test.");
    },
    run: async (): Promise<{ exitCode: number; stderr: string; stdout: string }> => ({
      exitCode: 1,
      stderr: "No fake command registered.",
      stdout: "",
    }),
    which: async (): Promise<string | null> => explicitNull,
  },
  env: {},
  fileSystem: {
    fileExists: async (filePath: string): Promise<boolean> => {
      try {
        await Bun.file(filePath).bytes();
        return true;
      } catch {
        return false;
      }
    },
    readTextFile: async (filePath: string): Promise<string> => Bun.file(filePath).text(),
    realPath: async (filePath: string): Promise<string> => filePath,
    writeTextFile: async (filePath: string, contents: string): Promise<void> => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, contents, "utf8");
    },
  },
  homeDirectory,
  http: {
    request,
  },
  now: (): Date => new Date("2026-03-11T12:00:00.000Z"),
  openPath: async (): Promise<void> => {
    await Promise.resolve();
  },
  spawnTerminal: async (): Promise<void> => {
    await Promise.resolve();
  },
});

test("resolveCodexWebSession auto reads Firefox cookies and validates the ChatGPT session", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-codex-web-auth-"));

  try {
    await writeFirefoxProfiles(homeDirectory, [
      {
        cookies: [
          {
            host: ".chatgpt.com",
            name: "__Secure-next-auth.session-token",
            path: "/",
            value: "session-token",
          },
          {
            host: ".chatgpt.com",
            name: "oai-did",
            path: "/",
            value: "device-id",
          },
        ],
        profileName: "default-release",
      },
    ]);

    const host = createHost(homeDirectory, async (url, options) => {
      if (url !== "https://chatgpt.com/api/auth/session") {
        throw new Error(`Unexpected URL: ${url}`);
      }

      expect(options?.headers).toEqual({
        Accept: "application/json",
        Cookie: "__Secure-next-auth.session-token=session-token; oai-did=device-id",
      });

      return {
        bodyText: JSON.stringify({
          accessToken: "chatgpt-access-token",
          account: {
            email: "codex@example.com",
            id: "acct_123",
          },
        }),
        headers: {
          "content-type": "application/json",
        },
        statusCode: 200,
      };
    });

    const session = await resolveCodexWebSession(host, {
      cookieHeader: explicitNull,
      cookieSource: "auto",
      expectedEmail: "codex@example.com",
    });

    expect(session).toEqual({
      accessToken: "chatgpt-access-token",
      accountEmail: "codex@example.com",
      accountId: "acct_123",
      cookieHeader: "__Secure-next-auth.session-token=session-token; oai-did=device-id",
    });
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});

test("resolveClaudeWebSession auto reads Firefox sessionKey cookies and fetches account context", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-claude-web-auth-"));

  try {
    await writeFirefoxProfiles(homeDirectory, [
      {
        cookies: [
          {
            host: ".claude.ai",
            name: "sessionKey",
            path: "/",
            value: "sk-ant-firefox-session",
          },
        ],
        profileName: "default-release",
      },
    ]);

    const requestLog: string[] = [];
    const host = createHost(homeDirectory, async (url, options) => {
      requestLog.push(url);

      if (url === "https://claude.ai/api/account") {
        expect(options?.headers).toEqual({
          Accept: "application/json",
          Cookie: "sessionKey=sk-ant-firefox-session",
        });

        return {
          bodyText: JSON.stringify({
            email_address: "claude@example.com",
          }),
          headers: {
            "content-type": "application/json",
          },
          statusCode: 200,
        };
      }

      if (url === "https://claude.ai/api/organizations") {
        expect(options?.headers).toEqual({
          Accept: "application/json",
          Cookie: "sessionKey=sk-ant-firefox-session",
        });

        return {
          bodyText: JSON.stringify([
            {
              id: "org_123",
              name: "Claude Team",
            },
          ]),
          headers: {
            "content-type": "application/json",
          },
          statusCode: 200,
        };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const session = await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    });

    expect(requestLog.toSorted()).toEqual([
      "https://claude.ai/api/account",
      "https://claude.ai/api/organizations",
    ]);
    expect(session).toEqual({
      accountEmail: "claude@example.com",
      organizationId: "org_123",
      organizationName: "Claude Team",
      sessionToken: "sk-ant-firefox-session",
    });
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});
