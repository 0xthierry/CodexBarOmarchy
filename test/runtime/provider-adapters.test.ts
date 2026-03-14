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
import { getProviderSnapshotMetrics } from "../../src/core/store/runtime-state.ts";
import type {
  RuntimeCommandLineSession,
  RuntimeCommandRunOptions,
  RuntimeHost,
  RuntimeHttpRequestOptions,
  RuntimeHttpResponse,
} from "../../src/runtime/host.ts";
import { createRuntimeProviderAdapters } from "../../src/runtime/provider-adapters.ts";
import { resolveClaudeSource } from "../../src/runtime/providers/claude.ts";
import { resolveCodexSource } from "../../src/runtime/providers/codex.ts";
import { resolveGeminiSource } from "../../src/runtime/providers/gemini.ts";
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
const fakeBinaryPath = (binaryName: string): string => `test-bin/${binaryName}`;
const claudeCliStatusProbeCommand = `sh -lc setsid sh -lc '{ printf '"'"'/status\\r'"'"'; sleep 1; printf '"'"'\\r'"'"'; sleep 1; printf '"'"'\\r'"'"'; sleep 1; printf '"'"'\\r'"'"'; } | script -qefc '"'"'test-bin/claude --allowed-tools ""'"'"' /dev/null' & pid=$!; { sleep 10; kill -TERM -- -"$pid" 2>/dev/null || true; } & sleeper=$!; wait "$pid" || true; kill "$sleeper" 2>/dev/null || true`;
const claudeCliUsageProbeCommand = `sh -lc setsid sh -lc '{ printf '"'"'/usage\\r'"'"'; sleep 1; printf '"'"'\\r'"'"'; sleep 1; printf '"'"'\\r'"'"'; } | script -qefc '"'"'test-bin/claude --allowed-tools ""'"'"' /dev/null' & pid=$!; { sleep 18; kill -TERM -- -"$pid" 2>/dev/null || true; } & sleeper=$!; wait "$pid" || true; kill "$sleeper" 2>/dev/null || true`;
const claudeCliStatusOutput = [
  "Version: 2.1.75",
  "Login method: Claude Max Account",
  "Organization: Claude Team",
  "Email: claude@example.com",
].join("\n");
const claudeCliUsageOutput = [
  "Current session",
  "21% used",
  "Resets 12:59am (America/Sao_Paulo)",
  "",
  "Current week (all models)",
  "42% used",
  "Resets 10am (America/Sao_Paulo)",
  "",
  "Current week (Sonnet only)",
  "58% used",
  "Resets Mar 16, 8am (America/Sao_Paulo)",
].join("\n");
const claudeCliCompactStatusOutput = [
  "Versin: 2.1.75",
  "Loginmethod:ClaudeMaxAccount",
  "Organization:ClaudeTeam",
  "Email:claude@example.com",
].join("\n");
const claudeCliCompactUsageOutput = [
  "Curretsession",
  "0%used",
  "Reses1m (America/Sao_Paulo)",
  "",
  "Currentweek(allmodels)",
  "24%used",
  "Resets10am(America/Sao_Paulo)",
  "",
  "Currentweek(Sonnetonly)",
  "4%used",
  "ResetsMar16,8am(America/Sao_Paulo)",
].join("\n");
const claudeCliUsageWithoutSessionResetOutput = [
  "Current session",
  "0%used",
  "",
  "Currentweek(allmodels)",
  "24%used",
  "Resets10am(America/Sao_Paulo)",
  "",
  "Currentweek(Sonnetonly)",
  "4%used",
  "ResetsMar16,8am(America/Sao_Paulo)",
].join("\n");

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

const writeJsonl = async (filePath: string, entries: unknown[]): Promise<void> => {
  await writeText(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
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

test("claude auto source resolution returns an oauth handle with a cli fallback handle", async () => {
  const fixture = await createHostFixture({
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
    },
  });
  const oauthPath = join(fixture.homeDirectory, ".claude", ".credentials.json");

  await writeJson(oauthPath, {
    claudeAiOauth: {
      accessToken: "access-token",
    },
  });

  const resolvedSource = await resolveClaudeSource(
    fixture.host,
    "auto",
    createConfig().providers.claude,
  );

  expect(resolvedSource).toEqual({
    fallbackCli: {
      claudeBinaryPath: fakeBinaryPath("claude"),
      scriptBinaryPath: fakeBinaryPath("script"),
    },
    kind: "oauth",
    oauthPath,
  });
});

test("claude manual web source resolution returns a manual session token handle", async () => {
  const config = createConfig();
  const fixture = await createHostFixture();

  const resolvedSource = await resolveClaudeSource(fixture.host, "web", {
    ...config.providers.claude,
    cookieSource: "manual",
    tokenAccounts: [
      {
        label: "primary",
        token: "sk-ant-session-token",
      },
    ],
  });

  expect(resolvedSource).toEqual({
    kind: "web",
    web: {
      kind: "manual-session-token",
      sessionToken: "sk-ant-session-token",
    },
  });
});

test("codex auto source resolution returns an oauth handle with a cli fallback handle", async () => {
  const fixture = await createHostFixture({
    which: {
      codex: fakeBinaryPath("codex"),
    },
  });
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");

  await writeJson(authPath, {
    account_id: "account-123",
    tokens: {
      access_token: "access-token",
    },
  });

  const resolvedSource = await resolveCodexSource(fixture.host, "auto");

  expect(resolvedSource).toEqual({
    authPath,
    fallbackCli: {
      kind: "cli",
    },
    kind: "oauth",
  });
});

test("gemini source resolution returns an api handle with the resolved oauth path", async () => {
  const fixture = await createHostFixture();
  const oauthPath = join(fixture.homeDirectory, ".gemini", "oauth_creds.json");
  const settingsPath = join(fixture.homeDirectory, ".gemini", "settings.json");

  await writeJson(oauthPath, {
    access_token: "access-token",
  });
  await writeJson(settingsPath, {
    security: {
      auth: {
        selectedType: "oauth-personal",
      },
    },
  });

  const resolvedSource = await resolveGeminiSource(fixture.host);

  expect(resolvedSource).toEqual({
    kind: "api",
    oauthPath,
  });
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
              reset_at: 1_773_459_806,
              used_percent: 42,
            },
            secondary_window: {
              reset_at: 1_773_854_813,
              used_percent: 75,
            },
          },
        }),
      ],
      "GET https://status.openai.com/api/v2/summary.json": [
        createJsonResponse({
          components: [
            {
              name: "Codex",
              status: "degraded_performance",
              updated_at: "2026-03-08T11:59:00.000Z",
            },
          ],
          page: {
            updated_at: "2026-03-08T11:59:00.000Z",
          },
          status: {
            description: "Degraded performance",
            indicator: "minor",
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
  await writeJsonl(
    join(fixture.homeDirectory, ".codex", "sessions", "2026", "03", "08", "usage.jsonl"),
    [
      {
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 10,
              input_tokens: 50,
              output_tokens: 25,
            },
            model: "gpt-5",
          },
          type: "token_count",
        },
        timestamp: "2026-03-08T10:01:00.000Z",
        type: "event_msg",
      },
    ],
  );

  const refreshResult = await providerAdapters.codex.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("codex@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("pro");
  expect(refreshResult.snapshot?.serviceStatus).toEqual({
    description: null,
    indicator: "minor",
    updatedAt: "2026-03-08T11:59:00.000Z",
  });
  expect(refreshResult.snapshot?.version).toBe("0.111.0");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    kind: "codex",
    tokenCost: {
      daily: [
        {
          costUsd: 0.000_301,
          date: "2026-03-08",
          totalTokens: 85,
        },
      ],
      last30Days: {
        costUsd: 0.000_301,
        tokens: 85,
      },
      today: {
        costUsd: 0.000_301,
        tokens: 85,
      },
    },
  });
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: "2026-03-14T03:43:26.000Z",
      kind: "session",
      label: "Session",
      value: "42%",
    },
    {
      detail: "2026-03-18T17:26:53.000Z",
      kind: "weekly",
      label: "Weekly",
      value: "75%",
    },
    {
      detail: explicitNull,
      kind: "credits",
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
    {
      options: {
        method: "GET",
        timeoutMs: 10_000,
      },
      url: "https://status.openai.com/api/v2/summary.json",
    },
  ]);
});

test("codex attaches web extras when manual cookies are enabled", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://chatgpt.com/api/auth/session": [
        createJsonResponse({
          accessToken: "chatgpt-web-access-token",
          account: {
            email: "codex@example.com",
            id: "acct_web",
          },
        }),
      ],
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
        createJsonResponse({
          additional_rate_limits: [
            {
              limit_name: "GPT-5.3-Codex-Spark",
              rate_limit: {
                primary_window: {
                  reset_at: 1_773_181_200,
                  used_percent: 19,
                },
              },
            },
          ],
          code_review_rate_limit: {
            primary_window: {
              reset_at: 1_773_116_400,
              used_percent: 36,
            },
          },
          purchase_url: "https://chatgpt.com/buy-credits",
        }),
      ],
      "GET https://chatgpt.com/backend-api/wham/usage/approximate-credit-usage?credit_amount=125": [
        createJsonResponse({
          approx_cloud_messages: 12,
          approx_local_messages: 3,
        }),
      ],
      "GET https://chatgpt.com/backend-api/wham/usage/credit-usage-events": [
        createJsonResponse({
          data: [
            {
              amount: -2.5,
              occurred_at: "2026-03-07T15:00:00.000Z",
              type: "usage",
            },
          ],
        }),
      ],
      "GET https://chatgpt.com/backend-api/wham/usage/daily-token-usage-breakdown": [
        createJsonResponse({
          data: [
            {
              date: "2026-03-07",
              input_tokens: 120,
              output_tokens: 45,
              total_tokens: 165,
            },
          ],
        }),
      ],
      "GET https://status.openai.com/api/v2/summary.json": [
        createJsonResponse({
          components: [
            {
              name: "Codex",
              status: "operational",
              updated_at: "2026-03-08T11:59:00.000Z",
            },
          ],
          page: {
            updated_at: "2026-03-08T11:59:00.000Z",
          },
          status: {
            description: "Operational",
            indicator: "none",
          },
        }),
      ],
    },
  });
  const authPath = join(fixture.homeDirectory, ".codex", "auth.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(authPath, {
    tokens: {
      access_token: "codex-access-token",
      account_id: "acct_123",
      id_token: "header.eyJlbWFpbCI6ImNvZGV4QGV4YW1wbGUuY29tIn0.signature",
      refresh_token: "codex-refresh-token",
    },
  });
  await writeJsonl(
    join(fixture.homeDirectory, ".codex", "sessions", "2026", "03", "08", "usage.jsonl"),
    [
      {
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 10,
              input_tokens: 50,
              output_tokens: 25,
            },
            model: "gpt-5",
          },
          type: "token_count",
        },
        timestamp: "2026-03-08T10:01:00.000Z",
        type: "event_msg",
      },
    ],
  );

  const refreshResult = await providerAdapters.codex.refresh({
    config,
    providerConfig: {
      ...config.providers.codex,
      cookieHeader: "foo=bar; baz=qux",
      cookieSource: "manual",
      extrasEnabled: true,
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.serviceStatus).toEqual({
    description: explicitNull,
    indicator: "none",
    updatedAt: "2026-03-08T11:59:00.000Z",
  });
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    dashboard: {
      additionalRateLimits: [
        {
          label: "GPT-5.3-Codex-Spark",
          remainingPercent: 81,
          resetAt: "2026-03-10T22:20:00.000Z",
        },
      ],
      approximateCreditUsage: {
        cloudMessages: 12,
        localMessages: 3,
      },
      codeReviewWindow: {
        label: "Code review",
        remainingPercent: 64,
        resetAt: "2026-03-10T04:20:00.000Z",
      },
      creditHistory: [
        {
          amount: -2.5,
          occurredAt: "2026-03-07T15:00:00.000Z",
          type: "usage",
        },
      ],
      purchaseUrl: "https://chatgpt.com/buy-credits",
      usageBreakdown: [
        {
          date: "2026-03-07",
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
        },
      ],
    },
    kind: "codex",
    tokenCost: {
      daily: [
        {
          costUsd: 0.000_301,
          date: "2026-03-08",
          totalTokens: 85,
        },
      ],
      last30Days: {
        costUsd: 0.000_301,
        tokens: 85,
      },
      today: {
        costUsd: 0.000_301,
        tokens: 85,
      },
    },
  });
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
              reset_at: 1_773_459_806,
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
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: "2026-03-14T03:43:26.000Z",
      kind: "session",
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
      codex: fakeBinaryPath("codex"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("codex@example.com");
  expect(refreshResult.snapshot?.version).toBe("0.111.0");
  expect(
    refreshResult.snapshot &&
      getProviderSnapshotMetrics(refreshResult.snapshot).map((metric) => metric.label),
  ).toEqual(["Session", "Weekly", "Credits"]);
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
      codex: fakeBinaryPath("codex"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("codex@example.com");
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
          extra_usage: {
            currency: "USD",
            is_enabled: true,
            monthly_limit: 5000,
            used_credits: 1234,
          },
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
      "GET https://status.claude.com/api/v2/status.json": [
        createJsonResponse({
          page: {
            updated_at: "2026-03-08T11:57:00.000Z",
          },
          status: {
            description: "Partial outage",
            indicator: "major",
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max 5x");
  expect(refreshResult.snapshot?.serviceStatus).toEqual({
    description: "Partial outage",
    indicator: "major",
    updatedAt: "2026-03-08T11:57:00.000Z",
  });
  expect(refreshResult.snapshot?.usage.providerCost).toEqual({
    currencyCode: "USD",
    limit: 50,
    periodLabel: "Monthly",
    resetsAt: null,
    updatedAt,
    used: 12.34,
  });
  expect(refreshResult.snapshot?.version).toBe("2.1.71");
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: "soon",
      kind: "session",
      label: "Session",
      value: "33%",
    },
    {
      detail: "later",
      kind: "weekly",
      label: "Weekly",
      value: "61%",
    },
    {
      detail: "later",
      kind: "sonnet",
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
    "https://status.claude.com/api/v2/status.json",
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
      claude: fakeBinaryPath("claude"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max");
  expect(refreshResult.snapshot?.version).toBe("2.1.71");
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://api.anthropic.com/api/oauth/usage",
    "https://status.claude.com/api/v2/status.json",
  ]);
});

test("claude auto does not let browser-cookie probe failures block oauth refresh", async () => {
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
        }),
      },
    },
    httpResponses: {
      "GET https://api.anthropic.com/api/oauth/usage": [
        createJsonResponse({
          five_hour: {
            resets_at: "2026-03-08T18:00:00.000Z",
            utilization: 12,
          },
          seven_day: {
            resets_at: "2026-03-11T00:00:00.000Z",
            utilization: 18,
          },
          seven_day_sonnet: {
            resets_at: "2026-03-11T00:00:00.000Z",
            utilization: 22,
          },
        }),
      ],
      "GET https://status.claude.com/api/v2/status.json": [
        createJsonResponse({
          page: {
            updated_at: "2026-03-08T11:59:00.000Z",
          },
          status: {
            description: "Operational",
            indicator: "none",
          },
        }),
      ],
    },
  });
  const credentialsPath = join(fixture.homeDirectory, ".claude", ".credentials.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const firefoxProfilesPath = join(
    fixture.homeDirectory,
    ".config",
    "mozilla",
    "firefox",
    "profiles.ini",
  );
  const originalFileExists = fixture.host.fileSystem.fileExists;
  const originalReadTextFile = fixture.host.fileSystem.readTextFile;

  await writeJson(credentialsPath, {
    claudeAiOauth: {
      accessToken: "claude-valid-access-token",
      expiresAt: Date.parse("2026-03-09T00:00:00.000Z"),
      refreshToken: "claude-refresh-token",
      subscriptionType: "max",
    },
  });

  fixture.host.fileSystem.fileExists = async (filePath: string): Promise<boolean> => {
    if (filePath === firefoxProfilesPath) {
      return true;
    }

    return originalFileExists(filePath);
  };
  fixture.host.fileSystem.readTextFile = async (filePath: string): Promise<string> => {
    if (filePath === firefoxProfilesPath) {
      throw new Error("browser cookie store unreadable");
    }

    return originalReadTextFile(filePath);
  };

  const refreshResult = await providerAdapters.claude.refresh({
    config: createConfig(),
    providerConfig: createConfig().providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("codex@example.com");
  expect(readString(persistedTokens, "access_token")).toBe("codex-new-access-token");
  expect(readString(persistedTokens, "refresh_token")).toBe("codex-new-refresh-token");
  expect(fixture.httpRequests.map((request) => request.url)).toEqual([
    "https://chatgpt.com/backend-api/wham/usage",
    "https://auth.openai.com/oauth/token",
    "https://chatgpt.com/backend-api/wham/usage",
    "https://status.openai.com/api/v2/summary.json",
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
      [claudeCliStatusProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: claudeCliStatusOutput.replaceAll("claude@example.com", "cli@example.com"),
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: claudeCliUsageOutput,
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.75 (Claude Code)\n",
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
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("cli@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max");
});

test("claude auto prefers the cli fallback before the web session fallback", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      [claudeCliStatusProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: claudeCliStatusOutput,
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: claudeCliUsageOutput,
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.75 (Claude Code)\n",
      },
    },
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: "Claude Team",
    kind: "claude",
  });
});

test("claude cli snapshot ignores email-like org values for plan and org details", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      [claudeCliStatusProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: [
          "Version: 2.1.75",
          "Login method: Claude Max Account",
          "Organization: claude@example.com",
          "Email: claude@example.com",
        ].join("\n"),
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: `${claudeCliUsageOutput}\nOrganization: claude@example.com\nEmail: claude@example.com`,
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.75 (Claude Code)\n",
      },
    },
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: null,
    kind: "claude",
  });
});

test("claude cli snapshot parses compact PTY output from the real terminal", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      [claudeCliStatusProbeCommand]: {
        exitCode: 0,
        stderr: "",
        stdout: claudeCliCompactStatusOutput,
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 0,
        stderr: "",
        stdout: claudeCliCompactUsageOutput,
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.75 (Claude Code)\n",
      },
    },
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: "ClaudeTeam",
    kind: "claude",
  });
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: null,
      kind: "session",
      label: "Session",
      value: "0%",
    },
    {
      detail: "2026-03-08T13:00:00.000Z",
      kind: "weekly",
      label: "Weekly",
      value: "24%",
    },
    {
      detail: "2026-03-16T11:00:00.000Z",
      kind: "sonnet",
      label: "Sonnet",
      value: "4%",
    },
  ]);
});

test("claude cli snapshot keeps the session metric when no session reset line is present", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      [claudeCliStatusProbeCommand]: {
        exitCode: 0,
        stderr: "",
        stdout: claudeCliCompactStatusOutput,
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 0,
        stderr: "",
        stdout: claudeCliUsageWithoutSessionResetOutput,
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.75 (Claude Code)\n",
      },
    },
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: null,
      kind: "session",
      label: "Session",
      value: "0%",
    },
    {
      detail: "2026-03-08T13:00:00.000Z",
      kind: "weekly",
      label: "Weekly",
      value: "24%",
    },
    {
      detail: "2026-03-16T11:00:00.000Z",
      kind: "sonnet",
      label: "Sonnet",
      value: "4%",
    },
  ]);
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
      claude: fakeBinaryPath("claude"),
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("web@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Claude Team");
});

test("claude web snapshot ignores email-like plan labels in local token payloads", async () => {
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
      claude: fakeBinaryPath("claude"),
    },
  });
  const sessionPath = join(fixture.homeDirectory, ".claude", "session.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(sessionPath, {
    accountEmail: "web@example.com",
    metrics: [
      {
        label: "Session",
        value: "19%",
      },
    ],
    planLabel: "web@example.com",
  });

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("web");
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("web@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBeNull();
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: null,
    kind: "claude",
  });
});

test("claude web snapshot ignores email-shaped plan labels and preserves explicit organization names", async () => {
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
      claude: fakeBinaryPath("claude"),
    },
  });
  const sessionPath = join(fixture.homeDirectory, ".claude", "session.json");
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  await writeJson(sessionPath, {
    account: {
      email_address: "web@example.com",
      organization: {
        name: "Claude Team",
      },
    },
    plan: "web@example.com",
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("web@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBeNull();
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: "Claude Team",
    kind: "claude",
  });
});

test("claude uses the manual session token for the web fallback path", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://claude.ai/api/account": [
        createJsonResponse({
          email_address: "web@example.com",
        }),
      ],
      "GET https://claude.ai/api/organizations": [
        createJsonResponse([
          {
            id: "org_123",
            name: "Claude Team",
            rate_limit_tier: "default_claude_max_20x",
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
  await writeJsonl(
    join(fixture.homeDirectory, ".config", "claude", "projects", "workspace", "usage.jsonl"),
    [
      {
        message: {
          id: "msg_1",
          model: "claude-sonnet-4-5",
          usage: {
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 100,
            input_tokens: 1000,
            output_tokens: 200,
          },
        },
        requestId: "req_1",
        timestamp: "2026-03-08T09:00:00.000Z",
        type: "assistant",
      },
      {
        message: {
          id: "msg_2",
          model: "claude-haiku-4-5",
          usage: {
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            input_tokens: 200,
            output_tokens: 40,
          },
        },
        requestId: "req_2",
        timestamp: "2026-03-08T09:05:00.000Z",
        type: "assistant",
      },
    ],
  );

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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("web@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max 20x");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: "Claude Team",
    kind: "claude",
    tokenCost: {
      daily: [
        {
          costUsd: 0.006_618,
          date: "2026-03-08",
          totalTokens: 1590,
        },
      ],
      last30Days: {
        costUsd: 0.006_618,
        tokens: 1590,
      },
      today: {
        costUsd: 0.006_618,
        tokens: 1590,
      },
    },
  });
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
      url: "https://claude.ai/api/account",
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
    {
      options: {
        method: "GET",
        timeoutMs: 10_000,
      },
      url: "https://status.claude.com/api/v2/status.json",
    },
  ]);
});

test("claude web fallback suppresses organization labels that contain the account email", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    httpResponses: {
      "GET https://claude.ai/api/account": [
        createJsonResponse({
          email_address: "thierrysantoos123@gmail.com",
        }),
      ],
      "GET https://claude.ai/api/organizations": [
        createJsonResponse([
          {
            id: "org_123",
            name: "thierrysantoos123@gmail.com's Organization",
            rate_limit_tier: "default_claude_max_20x",
          },
        ]),
      ],
      "GET https://claude.ai/api/organizations/org_123/usage": [
        createJsonResponse({
          five_hour: {
            resets_at: "soon",
            utilization: 12,
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("thierrysantoos123@gmail.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Max 20x");
  expect(refreshResult.snapshot?.providerDetails).toMatchObject({
    accountOrg: null,
    kind: "claude",
  });
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("auto@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Claude Team");
  expect(fixture.httpRequests).toEqual([
    {
      options: {
        method: "GET",
        timeoutMs: 10_000,
      },
      url: "https://status.claude.com/api/v2/status.json",
    },
  ]);
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

test("claude cli source fails when slash status output does not include usage metrics", async () => {
  const config = createConfig();
  const fixture = await createHostFixture({
    commands: {
      [claudeCliStatusProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: "Unknown skill: status\n",
      },
      [claudeCliUsageProbeCommand]: {
        exitCode: 128,
        stderr: "",
        stdout: "Failed to load usage data\n",
      },
      "claude --version": {
        exitCode: 0,
        stderr: "",
        stdout: "2.1.71 (Claude Code)\n",
      },
    },
    which: {
      claude: fakeBinaryPath("claude"),
      script: fakeBinaryPath("script"),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);

  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: {
      ...config.providers.claude,
      source: "cli",
    },
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Claude CLI output did not contain usage metrics.");
  expect(
    fixture.commandRuns.map((record) => createCommandKey(record.command, record.args)),
  ).toEqual(["claude --version", claudeCliUsageProbeCommand, claudeCliStatusProbeCommand]);
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
      "GET https://www.google.com/appsstatus/dashboard/incidents.json": [
        createJsonResponse([
          {
            affected_products: [
              {
                id: "npdyhgECDJ6tB66MxXyo",
                title: "Gemini",
              },
            ],
            begin: "2026-03-08T12:00:00+00:00",
            end: null,
            most_recent_update: {
              status: "SERVICE_INFORMATION",
              text: "**Summary**\nMinor issue.\n",
              when: "2026-03-08T12:05:00+00:00",
            },
          },
        ]),
      ],
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
  expect(refreshResult.snapshot?.identity.accountEmail).toBe("gemini@example.com");
  expect(refreshResult.snapshot?.identity.planLabel).toBe("Free");
  expect(refreshResult.snapshot?.serviceStatus).toEqual({
    description: "Minor issue.",
    indicator: "minor",
    updatedAt: "2026-03-08T12:05:00.000Z",
  });
  expect(refreshResult.snapshot?.version).toBe("0.29.7");
  expect(readString(persistedCredentials, "access_token")).toBe("gemini-new-access-token");
  expect(readFiniteNumber(persistedCredentials, "expiry_date")).toBeGreaterThan(
    Date.parse(updatedAt),
  );
  expect(readString(persistedCredentials, "id_token")).toBe(
    "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
  );
  expect(refreshResult.snapshot && getProviderSnapshotMetrics(refreshResult.snapshot)).toEqual([
    {
      detail: "tomorrow",
      kind: "pro",
      label: "Pro",
      value: "28%",
    },
    {
      detail: "later",
      kind: "flash",
      label: "Flash",
      value: "59%",
    },
  ]);
  expect(refreshResult.snapshot?.usage.quotaBuckets).toEqual([
    {
      modelId: "gemini-2.5-pro",
      remainingFraction: 0.72,
      resetTime: "tomorrow",
    },
    {
      modelId: "gemini-2.5-flash",
      remainingFraction: 0.41,
      resetTime: "later",
    },
  ]);
  expect(refreshResult.snapshot?.providerDetails).toEqual({
    incidents: [
      {
        severity: explicitNull,
        status: "SERVICE_INFORMATION",
        summary: "Minor issue.",
        updatedAt: "2026-03-08T12:05:00.000Z",
      },
    ],
    kind: "gemini",
    quotaDrilldown: {
      flashBuckets: [
        {
          modelId: "gemini-2.5-flash",
          remainingFraction: 0.41,
          resetTime: "later",
        },
      ],
      otherBuckets: [],
      proBuckets: [
        {
          modelId: "gemini-2.5-pro",
          remainingFraction: 0.72,
          resetTime: "tomorrow",
        },
      ],
    },
  });
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
