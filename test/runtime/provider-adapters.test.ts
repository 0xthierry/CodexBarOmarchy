import { afterEach, expect, test } from "bun:test";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDefaultConfig } from "../../src/core/config/schema.ts";
import { explicitNull } from "../../src/core/providers/shared.ts";
import type {
  RuntimeCommandLineSession,
  RuntimeCommandRunOptions,
  RuntimeHost,
  RuntimeHttpRequestOptions,
  RuntimeHttpResponse,
} from "../../src/runtime/host.ts";
import { createRuntimeProviderAdapters } from "../../src/runtime/provider-adapters.ts";
import {
  isRecord,
  parseJsonText,
  readFiniteNumber,
  readNestedRecord,
  readString,
} from "../../src/runtime/providers/shared.ts";

interface CommandFixture {
  exitCode: number;
  stderr: string;
  stdout: string;
}

interface CommandRunRecord {
  args: string[];
  command: string;
  options: RuntimeCommandRunOptions | undefined;
}

interface HttpRequestRecord {
  options: RuntimeHttpRequestOptions | undefined;
  url: string;
}

interface LineSessionFixture {
  lines: string[];
  writes: string[];
}

interface HostFixture {
  commandRuns: CommandRunRecord[];
  homeDirectory: string;
  host: RuntimeHost;
  httpRequests: HttpRequestRecord[];
  lineSessions: Record<string, LineSessionFixture>;
  openedPaths: string[];
  spawnedTerminals: {
    args: string[];
    command: string;
  }[];
}

const cleanupPaths: string[] = [];
const updatedAt = "2026-03-08T12:00:00.000Z";

const createConfig = (): ReturnType<typeof createDefaultConfig> => createDefaultConfig();

const createCommandKey = (command: string, args: string[]): string =>
  `${command} ${args.join(" ")}`.trim();

const createJsonResponse = (body: unknown, statusCode = 200): RuntimeHttpResponse => ({
  bodyText: JSON.stringify(body),
  headers: {
    "content-type": "application/json",
  },
  statusCode,
});

const createTextResponse = (bodyText: string, statusCode = 200): RuntimeHttpResponse => ({
  bodyText,
  headers: {
    "content-type": "text/plain",
  },
  statusCode,
});

const parseJsonRecord = (value: string): Record<string, unknown> => {
  const parsedValue = parseJsonText(value);

  if (!isRecord(parsedValue)) {
    throw new TypeError("Expected JSON object.");
  }

  return parsedValue;
};

const writeText = async (filePath: string, contents: string): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const createHostFixture = async (
  input: {
    commands?: Record<string, CommandFixture>;
    env?: Record<string, string | undefined>;
    httpResponses?: Record<string, RuntimeHttpResponse[]>;
    lineSessions?: Record<string, string[]>;
    now?: string;
    which?: Record<string, string | null>;
  } = {},
): Promise<HostFixture> => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "omarchy-agent-bar-runtime-"));
  cleanupPaths.push(homeDirectory);
  const commandRuns: CommandRunRecord[] = [];
  const httpRequests: HttpRequestRecord[] = [];
  const openedPaths: string[] = [];
  const spawnedTerminals: HostFixture["spawnedTerminals"] = [];
  const lineSessions = Object.fromEntries(
    Object.entries(input.lineSessions ?? {}).map(([key, lines]) => [
      key,
      {
        lines: [...lines],
        writes: [],
      },
    ]),
  ) as Record<string, LineSessionFixture>;

  const host: RuntimeHost = {
    commands: {
      createLineSession: async (
        command: string,
        args: string[],
      ): Promise<RuntimeCommandLineSession> => {
        const commandKey = createCommandKey(command, args);
        const fixture = lineSessions[commandKey];

        if (fixture === undefined) {
          throw new Error(`No fake line session registered for ${commandKey}.`);
        }

        return {
          close: async (): Promise<void> => {
            await Promise.resolve();
          },
          readLine: async (): Promise<string | null> => fixture.lines.shift() ?? explicitNull,
          writeLine: async (line: string): Promise<void> => {
            fixture.writes.push(line);
            await Promise.resolve();
          },
        };
      },
      run: (
        command: string,
        args: string[],
        options?: RuntimeCommandRunOptions,
      ): Promise<CommandFixture> => {
        const commandKey = createCommandKey(command, args);

        commandRuns.push({ args, command, options });

        return Promise.resolve(
          input.commands?.[commandKey] ?? {
            exitCode: 1,
            stderr: `No fake command registered for ${commandKey}.`,
            stdout: "",
          },
        );
      },
      which: async (command: string): Promise<string | null> =>
        input.which?.[command] ?? explicitNull,
    },
    env: input.env ?? {},
    fileSystem: {
      fileExists: async (filePath: string): Promise<boolean> => {
        try {
          await access(filePath);

          return true;
        } catch {
          return false;
        }
      },
      readTextFile: async (filePath: string): Promise<string> => readFile(filePath, "utf8"),
      realPath: async (filePath: string): Promise<string> => realpath(filePath),
      writeTextFile: async (filePath: string, contents: string): Promise<void> => {
        await writeText(filePath, contents);
      },
    },
    homeDirectory,
    http: {
      request: async (
        url: string,
        options: RuntimeHttpRequestOptions = {},
      ): Promise<RuntimeHttpResponse> => {
        const method = options.method ?? "GET";
        const responseQueue = input.httpResponses?.[`${method} ${url}`];

        httpRequests.push({ options, url });

        if (responseQueue === undefined || responseQueue.length === 0) {
          throw new Error(`No fake HTTP response registered for ${method} ${url}.`);
        }

        const response = responseQueue.shift();

        if (response === undefined) {
          throw new Error(`No fake HTTP response registered for ${method} ${url}.`);
        }

        return response;
      },
    },
    now: (): Date => new Date(input.now ?? updatedAt),
    openPath: async (path: string): Promise<void> => {
      openedPaths.push(path);
      await Promise.resolve();
    },
    spawnTerminal: async (command: string, args: string[]): Promise<void> => {
      spawnedTerminals.push({ args, command });
      await Promise.resolve();
    },
  };

  return {
    commandRuns,
    homeDirectory,
    host,
    httpRequests,
    lineSessions,
    openedPaths,
    spawnedTerminals,
  };
};

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const path = cleanupPaths.pop();

    if (typeof path === "string") {
      await rm(path, { force: true, recursive: true });
    }
  }
});

test("codex refreshes against the real usage API contract", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://chatgpt.com/backend-api/wham/usage": [
        createJsonResponse({
          credits: {
            balance: 10.5,
          },
          email: "codex@example.com",
          plan_type: "pro",
          rate_limit: {
            primary_window: {
              reset_at: "soon",
              used_percent: 42,
            },
            secondary_window: {
              reset_at: "later",
              used_percent: 75,
            },
          },
        }),
      ],
    },
  });
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const configPath = join(fixture.homeDirectory, ".codex", "config.toml");
  const versionPath = join(fixture.homeDirectory, ".codex", "version.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    last_refresh: "2026-03-07T10:00:00.000Z",
    tokens: {
      access_token: "codex-access-token",
      account_id: "acct_123",
      id_token: "header.eyJlbWFpbCI6ImNvZGV4QGV4YW1wbGUuY29tIn0.signature",
      refresh_token: "codex-refresh-token",
    },
  });
  await writeText(configPath, 'chatgpt_base_url = "https://chatgpt.com"\n');
  await writeJson(versionPath, {
    latest_version: "0.111.0",
  });

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("codex@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("pro");
  expect(refreshResult.snapshot?.version).toBe("0.111.0");
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "soon",
      label: "Session",
      value: "42%",
    },
    {
      detail: "later",
      label: "Weekly",
      value: "75%",
    },
    {
      detail: explicitNull,
      label: "Credits",
      value: "10.50",
    },
  ]);
  expect(fixture.httpRequests).toEqual([
    {
      options: {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer codex-access-token",
          "ChatGPT-Account-Id": "acct_123",
        },
        method: "GET",
        timeoutMs: 15_000,
      },
      url: "https://chatgpt.com/backend-api/wham/usage",
    },
  ]);
});

test("codex rejects untrusted usage origins before sending oauth headers", async () => {
  const fixture = await createHostFixture();
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const configPath = join(fixture.homeDirectory, ".codex", "config.toml");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    tokens: {
      access_token: "codex-access-token",
      account_id: "acct_123",
      refresh_token: "codex-refresh-token",
    },
  });
  await writeText(configPath, 'chatgpt_base_url = "https://attacker.example"\n');

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe(
    "Codex chatgpt_base_url must point to chatgpt.com or chat.openai.com.",
  );
  expect(fixture.httpRequests).toEqual([]);
});

test("codex uses the cached access token before attempting stale-token refresh metadata discovery", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://chatgpt.com/backend-api/wham/usage": [
        createJsonResponse({
          email: "codex@example.com",
          rate_limit: {
            primary_window: {
              reset_at: "soon",
              used_percent: 42,
            },
          },
        }),
      ],
    },
  });
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    last_refresh: "2026-02-01T10:00:00.000Z",
    tokens: {
      access_token: "codex-still-valid-token",
      account_id: "acct_123",
      refresh_token: "codex-refresh-token",
    },
  });

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.version).toBeNull();
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "soon",
      label: "Session",
      value: "42%",
    },
  ]);
  expect(fixture.commandRuns).toHaveLength(0);
});

test("codex falls back to the app-server CLI path when oauth is unavailable", async () => {
  const fixture = await createHostFixture({
    lineSessions: {
      "codex -s read-only -a never app-server": [
        JSON.stringify({
          id: 1,
          result: {
            userAgent: "codex-cli/0.111.0",
          },
        }),
        JSON.stringify({
          id: 2,
          result: {
            account: {
              email: "codex@example.com",
              planType: "pro",
            },
          },
        }),
        JSON.stringify({
          id: 3,
          result: {
            rateLimits: {
              credits: {
                balance: 9.5,
              },
              primary: {
                resetsAt: 1_762_934_400,
                usedPercent: 63,
              },
              secondary: {
                resetsAt: 1_762_977_600,
                usedPercent: 91,
              },
            },
          },
        }),
      ],
    },
    which: {
      codex: "/usr/bin/codex",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: {
      ...createConfig().providers.codex,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("codex@example.com");
  expect(refreshResult.snapshot?.version).toBe("0.111.0");
  expect(refreshResult.snapshot?.metrics.map((metric) => metric.label)).toEqual([
    "Session",
    "Weekly",
    "Credits",
  ]);
  expect(
    fixture.lineSessions["codex -s read-only -a never app-server"]?.writes.map((line) => {
      const payload = parseJsonRecord(line);

      return readString(payload, "method") ?? explicitNull;
    }),
  ).toEqual(["initialize", "initialized", "account/read", "account/rateLimits/read"]);
});

test("codex auto falls back to the CLI path when oauth credentials are invalid", async () => {
  const fixture = await createHostFixture({
    lineSessions: {
      "codex -s read-only -a never app-server": [
        JSON.stringify({
          id: 1,
          result: {
            userAgent: "codex-cli/0.111.0",
          },
        }),
        JSON.stringify({
          id: 2,
          result: {
            account: {
              email: "codex@example.com",
              planType: "pro",
            },
          },
        }),
        JSON.stringify({
          id: 3,
          result: {
            rateLimits: {
              primary: {
                resetsAt: 1_762_934_400,
                usedPercent: 63,
              },
            },
          },
        }),
      ],
    },
    which: {
      codex: "/usr/bin/codex",
    },
  });
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    tokens: {
      refresh_token: "codex-refresh-token",
    },
  });

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("codex@example.com");
});

test("codex returns a refresh error when the usage request throws", async () => {
  const fixture = await createHostFixture();
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    tokens: {
      access_token: "codex-access-token",
      account_id: "acct_123",
      refresh_token: "codex-refresh-token",
    },
  });
  fixture.host.http.request = async (): Promise<RuntimeHttpResponse> => {
    throw new Error("network down");
  };

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("network down");
});

test("claude refreshes expired oauth credentials and persists the rotated tokens", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://api.anthropic.com/api/oauth/usage": [
        createJsonResponse({
          five_hour: {
            resets_at: "soon",
            utilization: 33,
          },
          seven_day: {
            resets_at: "later",
            utilization: 61,
          },
          seven_day_sonnet: {
            resets_at: "later",
            utilization: 47,
          },
        }),
      ],
      "POST https://platform.claude.com/v1/oauth/token": [
        createJsonResponse({
          access_token: "claude-new-access-token",
          account: {
            email_address: "claude@example.com",
          },
          expires_in: 3600,
          organization: {
            name: "Claude Max",
          },
          refresh_token: "claude-new-refresh-token",
          scope: "user:inference user:profile",
          token_type: "Bearer",
        }),
      ],
    },
  });
  const claudeBinaryPath = join(fixture.homeDirectory, "bin", "claude");
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeText(claudeBinaryPath, "claude-binary\n");
  fixture.host.commands.which = async (command: string): Promise<string | null> =>
    command === "claude" ? claudeBinaryPath : explicitNull;
  fixture.host.commands.run = (command, args, options) => {
    const commandKey = createCommandKey(command, args);

    fixture.commandRuns.push({ args, command, options });

    if (commandKey === `strings ${claudeBinaryPath}`) {
      return Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout:
          'TOKEN_URL:"https://platform.claude.com/v1/oauth/token",CLIENT_ID:"9d1c250a-e61b-44d9-88ed-5944d1962f5e"',
      });
    }

    if (commandKey === "claude --version") {
      return Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout: "2.1.71 (Claude Code)\n",
      });
    }

    return Promise.resolve({
      exitCode: 1,
      stderr: `No fake command registered for ${commandKey}.`,
      stdout: "",
    });
  };

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "claude-expired-access-token",
      expiresAt: Date.parse("2026-03-07T00:00:00.000Z"),
      rateLimitTier: "default_claude_max_5x",
      refreshToken: "claude-refresh-token",
      scopes: ["user:profile"],
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.claude,
  });
  const persistedCredentials = parseJsonRecord(await readFile(credentialsPath, "utf8"));
  const claudeAiOauth = readNestedRecord(persistedCredentials, "claudeAiOauth");

  if (claudeAiOauth === null) {
    throw new Error("Expected Claude OAuth credentials to be persisted.");
  }

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("default_claude_max_5x");
  expect(refreshResult.snapshot?.version).toBe("2.1.71");
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "soon",
      label: "Session",
      value: "33%",
    },
    {
      detail: "later",
      label: "Weekly",
      value: "61%",
    },
    {
      detail: "later",
      label: "Sonnet",
      value: "47%",
    },
  ]);
  expect(readString(claudeAiOauth, "accessToken")).toBe("claude-new-access-token");
  expect(readString(claudeAiOauth, "refreshToken")).toBe("claude-new-refresh-token");
  expect(claudeAiOauth["scopes"]).toEqual(["user:inference", "user:profile"]);
  expect(readFiniteNumber(claudeAiOauth, "expiresAt")).toBeGreaterThan(Date.parse(updatedAt));
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://platform.claude.com/v1/oauth/token",
    "https://api.anthropic.com/api/oauth/usage",
  ]);
});

test("claude oauth falls back to auth status for account email and cli version", async () => {
  const fixture = await createHostFixture({
    commands: {
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.71 (Claude Code)\n",
      },
      "claude auth status --json": {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          email: "claude@example.com",
          loggedIn: true,
          subscriptionType: "max",
        }),
      },
    },
    httpResponses: {
      "GET https://api.anthropic.com/api/oauth/usage": [
        createJsonResponse({
          five_hour: {
            resets_at: "soon",
            utilization: 33,
          },
          seven_day: {
            resets_at: "later",
            utilization: 61,
          },
          seven_day_sonnet: {
            resets_at: "later",
            utilization: 47,
          },
        }),
      ],
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "claude-valid-access-token",
      expiresAt: Date.parse("2026-03-09T00:00:00.000Z"),
      refreshToken: "claude-refresh-token",
      subscriptionType: "max",
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config: createConfig(),
    providerConfig: {
      ...createConfig().providers.claude,
      source: "oauth",
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("max");
  expect(refreshResult.snapshot?.version).toBe("2.1.71");
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://api.anthropic.com/api/oauth/usage",
  ]);
});

test("codex refreshes oauth tokens after an unauthorized usage response using client metadata discovered from the installed cli", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://chatgpt.com/backend-api/wham/usage": [
        createJsonResponse(
          {
            error: {
              message: "Unauthorized",
            },
          },
          401,
        ),
        createJsonResponse({
          credits: {
            balance: 7.25,
          },
          email: "codex@example.com",
          plan_type: "pro",
          rate_limit: {
            primary_window: {
              reset_at: "soon",
              used_percent: 15,
            },
            secondary_window: {
              reset_at: "later",
              used_percent: 38,
            },
          },
        }),
      ],
      "POST https://auth.openai.com/oauth/token": [
        createJsonResponse({
          access_token: "codex-new-access-token",
          id_token: "header.eyJlbWFpbCI6ImNvZGV4QGV4YW1wbGUuY29tIn0.signature",
          refresh_token: "codex-new-refresh-token",
        }),
      ],
    },
  });
  const codexHomePath = join(fixture.homeDirectory, ".codex");
  const authPath = join(codexHomePath, "auth.json");
  const wrapperBinaryPath = join(
    fixture.homeDirectory,
    "lib",
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  );
  const nativeBinaryPath = join(
    fixture.homeDirectory,
    "lib",
    "node_modules",
    "@openai",
    "codex",
    "node_modules",
    "@openai",
    "codex-linux-x64",
    "vendor",
    "x86_64-unknown-linux-musl",
    "codex",
    "codex",
  );
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    last_refresh: "2026-03-08T11:00:00.000Z",
    tokens: {
      access_token: "codex-old-access-token",
      account_id: "acct_123",
      id_token: "header.eyJlbWFpbCI6Im9sZEBleGFtcGxlLmNvbSJ9.signature",
      refresh_token: "codex-refresh-token",
    },
  });
  await writeText(wrapperBinaryPath, "wrapper\n");
  await writeText(nativeBinaryPath, "native\n");

  fixture.host.commands.which = async (command: string): Promise<string | null> =>
    command === "codex" ? wrapperBinaryPath : explicitNull;
  fixture.host.commands.run = (command, args, options) => {
    const commandKey = createCommandKey(command, args);

    fixture.commandRuns.push({ args, command, options });

    if (commandKey === `strings ${nativeBinaryPath}`) {
      return Promise.resolve({
        exitCode: 0,
        stderr: "",
        stdout:
          "Token data is not available.client_idgrant_typerefresh_tokenaccess_tokenNo more recovery steps available.Your access token could not be refreshed because you have since logged out or signed in to another account. Please sign in again.app_EMoamEEZ73f0CkXaXp7hrannContent-Type",
      });
    }

    return Promise.resolve({
      exitCode: 1,
      stderr: `No fake command registered for ${commandKey}.`,
      stdout: "",
    });
  };

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });
  const persistedAuth = parseJsonRecord(await readFile(authPath, "utf8"));
  const persistedTokens = readNestedRecord(persistedAuth, "tokens");

  if (persistedTokens === null) {
    throw new Error("Expected Codex tokens to be persisted.");
  }

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("codex@example.com");
  expect(readString(persistedTokens, "access_token")).toBe("codex-new-access-token");
  expect(readString(persistedTokens, "refresh_token")).toBe("codex-new-refresh-token");
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://chatgpt.com/backend-api/wham/usage",
    "https://auth.openai.com/oauth/token",
    "https://chatgpt.com/backend-api/wham/usage",
  ]);
  expect(fixture.httpRequests[1]?.options).toEqual({
    body: JSON.stringify({
      client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
      grant_type: "refresh_token",
      refresh_token: "codex-refresh-token",
      scope: "openid profile email",
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    timeoutMs: 15_000,
  });
});

test("claude auto falls back to cli when oauth refresh fails", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout:
          "Account: cli@example.com\nOrg: Max Plan\nCurrent session 21%\nCurrent week (all models) 42%\nCurrent week (Sonnet) 58%\n",
      },
    },
    httpResponses: {
      "POST https://platform.claude.com/v1/oauth/token": [
        createJsonResponse(
          {
            error: "invalid_grant",
          },
          400,
        ),
      ],
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "expired-access-token",
      expiresAt: Date.parse("2026-03-07T00:00:00.000Z"),
      refreshToken: "bad-refresh-token",
      scopes: ["user:profile"],
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("cli@example.com");
});

test("claude auto prefers the cli fallback before the web session fallback", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout:
          "Account: claude@example.com\nOrg: Max Plan\nCurrent session 21%\nCurrent week (all models) 42%\nCurrent week (Sonnet) 58%\n",
      },
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      activeTokenAccountIndex: 0,
      cookieSource: "manual",
      tokenAccounts: [
        {
          label: "manual",
          token: "sk-ant-session-token",
        },
      ],
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Max Plan");
});

test("claude auto falls back to the web snapshot when cli and local fallbacks both fail", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout: "Unknown skill: status\n",
      },
      "claude auth status --json": {
        exitCode: 1,
        stderr: "auth status failed",
        stdout: "",
      },
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const sessionPath = join(fixture.homeDirectory, ".claude", "session.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(sessionPath, {
    account: {
      email_address: "web@example.com",
    },
    plan: "Claude Team",
    usage: {
      five_hour: {
        resets_at: "soon",
        utilization: 19,
      },
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("web");
  expect(refreshResult.snapshot?.accountEmail).toBe("web@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Claude Team");
});

test("claude uses the manual session token for the web fallback path", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://claude.ai/api/organizations": [
        createJsonResponse([
          {
            id: "org_123",
            name: "Claude Team",
          },
        ]),
      ],
      "GET https://claude.ai/api/organizations/org_123/usage": [
        createJsonResponse({
          five_hour: {
            resets_at: "soon",
            utilization: 12,
          },
          seven_day: {
            resets_at: "later",
            utilization: 18,
          },
          seven_day_sonnet: {
            resets_at: "later",
            utilization: 22,
          },
        }),
      ],
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      cookieSource: "manual",
      source: "web",
      tokenAccounts: [
        {
          label: "primary",
          token: "sk-ant-session-token",
        },
      ],
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("web");
  expect(refreshResult.snapshot?.planLabel).toBe("Claude Team");
  expect(fixture.httpRequests).toEqual([
    {
      options: {
        headers: {
          Accept: "application/json",
          Cookie: "sessionKey=sk-ant-session-token",
        },
        method: "GET",
        timeoutMs: 8000,
      },
      url: "https://claude.ai/api/organizations",
    },
    {
      options: {
        headers: {
          Accept: "application/json",
          Cookie: "sessionKey=sk-ant-session-token",
        },
        method: "GET",
        timeoutMs: 8000,
      },
      url: "https://claude.ai/api/organizations/org_123/usage",
    },
  ]);
});

test("claude web automatic mode ignores manual token accounts and uses the token file", async () => {
  const config = createConfig();
  const fixture = await createHostFixture();
  const sessionPath = join(fixture.homeDirectory, ".claude", "session.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(sessionPath, {
    account: {
      email_address: "auto@example.com",
    },
    plan: "Claude Team",
    usage: {
      five_hour: {
        resets_at: "soon",
        utilization: 19,
      },
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      cookieSource: "auto",
      source: "web",
      tokenAccounts: [
        {
          label: "manual",
          token: "sk-ant-session-token",
        },
      ],
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("web");
  expect(refreshResult.snapshot?.accountEmail).toBe("auto@example.com");
  expect(fixture.httpRequests).toEqual([]);
});

test("claude web manual mode does not fall back to the token file", async () => {
  const config = createConfig();
  const fixture = await createHostFixture();
  const sessionPath = join(fixture.homeDirectory, ".claude", "session.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(sessionPath, {
    account: {
      email_address: "auto@example.com",
    },
    plan: "Claude Team",
    usage: {
      five_hour: {
        resets_at: "soon",
        utilization: 19,
      },
    },
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      cookieSource: "manual",
      source: "web",
    },
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Claude credentials, CLI, or token file are unavailable.");
  expect(fixture.httpRequests).toEqual([]);
});

test("claude auto falls back to local stats when oauth usage is rate limited and slash status is unavailable", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout: "Unknown skill: status\n",
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.71 (Claude Code)\n",
      },
      "claude auth status --json": {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          email: "local@example.com",
          loggedIn: true,
          subscriptionType: "max",
        }),
      },
    },
    httpResponses: {
      "GET https://api.anthropic.com/api/oauth/usage": [
        createJsonResponse(
          {
            error: {
              message: "Rate limited.",
              type: "rate_limit_error",
            },
          },
          429,
        ),
      ],
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const statePath = join(fixture.homeDirectory, ".claude", ".claude.json");
  const statsPath = join(fixture.homeDirectory, ".claude", "stats-cache.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "valid-access-token",
      expiresAt: Date.parse("2026-03-09T00:00:00.000Z"),
      refreshToken: "refresh-token",
      subscriptionType: "max",
    },
  });
  await writeJson(statePath, {
    emailAddress: "local-state@example.com",
  });
  await writeJson(statsPath, {
    dailyActivity: [
      {
        date: "2026-03-07",
        messageCount: 90,
        sessionCount: 3,
        toolCallCount: 17,
      },
      {
        date: "2026-03-08",
        messageCount: 125,
        sessionCount: 4,
        toolCallCount: 23,
      },
    ],
    dailyModelTokens: [
      {
        date: "2026-03-07",
        tokensByModel: {
          "claude-opus-4-6": 4000,
        },
      },
      {
        date: "2026-03-08",
        tokensByModel: {
          "claude-opus-4-6": 12_000,
          "claude-sonnet-4-5-20250929": 3000,
        },
      },
    ],
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("local@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("max");
  expect(refreshResult.snapshot?.version).toBe("2.1.71");
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "2026-03-08",
      label: "Tokens",
      value: "15000",
    },
    {
      detail: "2026-03-08",
      label: "Messages",
      value: "125",
    },
    {
      detail: "2026-03-08",
      label: "Sessions",
      value: "4",
    },
    {
      detail: "2026-03-08",
      label: "Tools",
      value: "23",
    },
  ]);
  expect(
    fixture.commandRuns.map((record) => createCommandKey(record.command, record.args)),
  ).toEqual(["claude", "claude --version", "claude auth status --json"]);
});

test("claude local fallback rejects logged-out auth status even when stats are still present", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout: "Unknown skill: status\n",
      },
      "claude auth status --json": {
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          email: "logged-out@example.com",
          loggedIn: false,
          subscriptionType: "max",
        }),
      },
    },
    httpResponses: {
      "GET https://api.anthropic.com/api/oauth/usage": [
        createJsonResponse(
          {
            error: {
              message: "Rate limited.",
            },
          },
          429,
        ),
      ],
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const statsPath = join(fixture.homeDirectory, ".claude", "stats-cache.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "valid-access-token",
      expiresAt: Date.parse("2026-03-09T00:00:00.000Z"),
      refreshToken: "refresh-token",
      subscriptionType: "max",
    },
  });
  await writeJson(statsPath, {
    dailyActivity: [
      {
        date: "2026-03-08",
        messageCount: 125,
        sessionCount: 4,
        toolCallCount: 23,
      },
    ],
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Claude auth status reports that the CLI is logged out.");
});

test("claude returns a refresh error when the oauth usage request throws", async () => {
  const fixture = await createHostFixture();
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "valid-access-token",
      expiresAt: Date.parse("2026-03-09T00:00:00.000Z"),
      refreshToken: "refresh-token",
      subscriptionType: "max",
    },
  });
  fixture.host.http.request = async (): Promise<RuntimeHttpResponse> => {
    throw new Error("timeout");
  };

  const refreshResult = await providerAdapters.claude.refresh({
    config: createConfig(),
    providerConfig: {
      ...createConfig().providers.claude,
      source: "oauth",
    },
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("timeout");
});

test("gemini refreshes oauth credentials and fetches live quota data through the api path", async () => {
  const fixture = await createHostFixture({
    commands: {
      "gemini --version": {
        exitCode: 0,
        stderr: "",
        stdout: "0.29.7\n",
      },
    },
    httpResponses: {
      "POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist": [
        createJsonResponse({
          cloudaicompanionProject: "gen-lang-client-123",
          currentTier: {
            id: "free-tier",
          },
        }),
      ],
      "POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota": [
        createJsonResponse({
          buckets: [
            {
              modelId: "gemini-2.5-pro",
              remainingFraction: 0.72,
              resetTime: "tomorrow",
            },
            {
              modelId: "gemini-2.5-flash",
              remainingFraction: "0.41",
              resetTime: "later",
            },
          ],
        }),
      ],
      "POST https://oauth2.googleapis.com/token": [
        createJsonResponse({
          access_token: "gemini-new-access-token",
          expires_in: 3600,
          id_token: "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
          token_type: "Bearer",
        }),
      ],
    },
  });
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");
  const geminiPackageRoot = join(
    fixture.homeDirectory,
    "tooling",
    "lib",
    "node_modules",
    "@google",
    "gemini-cli",
  );
  const geminiRealBinaryPath = join(geminiPackageRoot, "dist", "index.js");
  const geminiShimPath = join(fixture.homeDirectory, "bin", "gemini");
  const oauthClientPath = join(
    geminiPackageRoot,
    "node_modules",
    "@google",
    "gemini-cli-core",
    "dist",
    "src",
    "code_assist",
    "oauth2.js",
  );
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(oauthPath, {
    access_token: "gemini-expired-access-token",
    expiry_date: Date.parse("2026-03-07T00:00:00.000Z"),
    id_token: "header.eyJlbWFpbCI6Im9sZC1nZW1pbmlAZXhhbXBsZS5jb20ifQ.signature",
    refresh_token: "gemini-refresh-token",
  });
  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "oauth-personal",
      },
    },
  });
  await writeText(geminiRealBinaryPath, "console.log('gemini');\n");
  await writeText(
    oauthClientPath,
    [
      "const OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';",
      "const OAUTH_CLIENT_SECRET = 'client-secret';",
    ].join("\n"),
  );
  await mkdir(dirname(geminiShimPath), { recursive: true });
  await symlink(geminiRealBinaryPath, geminiShimPath);

  fixture.host.commands.which = async (command: string): Promise<string | null> =>
    command === "gemini" ? geminiShimPath : explicitNull;

  const refreshResult = await providerAdapters.gemini.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.gemini,
  });
  const persistedCredentials = parseJsonRecord(await readFile(oauthPath, "utf8"));

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("api");
  expect(refreshResult.snapshot?.accountEmail).toBe("gemini@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Free");
  expect(refreshResult.snapshot?.version).toBe("0.29.7");
  expect(readString(persistedCredentials, "access_token")).toBe("gemini-new-access-token");
  expect(readFiniteNumber(persistedCredentials, "expiry_date")).toBeGreaterThan(
    Date.parse(updatedAt),
  );
  expect(readString(persistedCredentials, "id_token")).toBe(
    "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
  );
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "tomorrow",
      label: "Pro",
      value: "28%",
    },
    {
      detail: "later",
      label: "Flash",
      value: "59%",
    },
  ]);
  expect(persistedCredentials["access_token"]).toBe("gemini-new-access-token");
  expect(persistedCredentials["id_token"]).toBe(
    "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
  );
  expect(persistedCredentials["expiry_date"]).toBeGreaterThan(Date.parse(updatedAt));
});

test("gemini retries an unauthorized quota response only once", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist": [
        createJsonResponse({
          cloudaicompanionProject: "gen-lang-client-123",
          currentTier: {
            id: "free-tier",
          },
        }),
        createJsonResponse({
          cloudaicompanionProject: "gen-lang-client-123",
          currentTier: {
            id: "free-tier",
          },
        }),
      ],
      "POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota": [
        createJsonResponse(
          {
            error: {
              message: "Unauthorized",
            },
          },
          401,
        ),
        createJsonResponse(
          {
            error: {
              message: "Still unauthorized",
            },
          },
          401,
        ),
      ],
      "POST https://oauth2.googleapis.com/token": [
        createJsonResponse({
          access_token: "gemini-new-access-token",
          expires_in: 3600,
          id_token: "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
          token_type: "Bearer",
        }),
      ],
    },
  });
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");
  const geminiPackageRoot = join(
    fixture.homeDirectory,
    "tooling",
    "lib",
    "node_modules",
    "@google",
    "gemini-cli",
  );
  const geminiRealBinaryPath = join(geminiPackageRoot, "dist", "index.js");
  const geminiShimPath = join(fixture.homeDirectory, "bin", "gemini");
  const oauthClientPath = join(
    geminiPackageRoot,
    "node_modules",
    "@google",
    "gemini-cli-core",
    "dist",
    "src",
    "code_assist",
    "oauth2.js",
  );
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(oauthPath, {
    access_token: "gemini-old-access-token",
    expiry_date: Date.parse("2026-03-09T00:00:00.000Z"),
    refresh_token: "gemini-refresh-token",
  });
  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "oauth-personal",
      },
    },
  });
  await writeText(geminiRealBinaryPath, "console.log('gemini');\n");
  await writeText(
    oauthClientPath,
    [
      "const OAUTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';",
      "const OAUTH_CLIENT_SECRET = 'client-secret';",
    ].join("\n"),
  );
  await mkdir(dirname(geminiShimPath), { recursive: true });
  await symlink(geminiRealBinaryPath, geminiShimPath);

  fixture.host.commands.which = async (command: string): Promise<string | null> =>
    command === "gemini" ? geminiShimPath : explicitNull;

  const refreshResult = await providerAdapters.gemini.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.gemini,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Gemini quota request unauthorized. Run `gemini auth login`.");
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
    "https://oauth2.googleapis.com/token",
    "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
  ]);
});

test("gemini returns a refresh error when the quota response is invalid json", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist": [
        createJsonResponse({
          cloudaicompanionProject: "gen-lang-client-123",
          currentTier: {
            id: "free-tier",
          },
        }),
      ],
      "POST https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota": [
        createTextResponse("not json"),
      ],
    },
  });
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(oauthPath, {
    access_token: "gemini-access-token",
    expiry_date: Date.parse("2026-03-09T00:00:00.000Z"),
    refresh_token: "gemini-refresh-token",
  });
  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "oauth-personal",
      },
    },
  });

  const refreshResult = await providerAdapters.gemini.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.gemini,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Gemini quota response was invalid.");
});

test("gemini returns a refresh error when the quota request throws", async () => {
  const fixture = await createHostFixture({
    httpResponses: {
      "POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist": [
        createJsonResponse({
          cloudaicompanionProject: "gen-lang-client-123",
          currentTier: {
            id: "free-tier",
          },
        }),
      ],
    },
  });
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const originalRequest = fixture.host.http.request;

  await writeJson(oauthPath, {
    access_token: "gemini-access-token",
    expiry_date: Date.parse("2026-03-09T00:00:00.000Z"),
    refresh_token: "gemini-refresh-token",
  });
  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "oauth-personal",
      },
    },
  });
  fixture.host.http.request = async (
    url: string,
    options?: RuntimeHttpRequestOptions,
  ): Promise<RuntimeHttpResponse> => {
    if (url === "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota") {
      throw new Error("quota down");
    }

    return originalRequest(url, options);
  };

  const refreshResult = await providerAdapters.gemini.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.gemini,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("quota down");
});

test("gemini rejects unsupported non-oauth auth types", async () => {
  const fixture = await createHostFixture();
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "api-key",
      },
    },
  });
  await writeJson(oauthPath, {
    access_token: "unused",
  });

  const refreshResult = await providerAdapters.gemini.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.gemini,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Gemini OAuth credentials are unavailable.");
});
