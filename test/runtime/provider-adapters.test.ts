/* eslint-disable import/no-relative-parent-imports, max-lines-per-function, max-statements, no-magic-numbers, sort-imports, promise/prefer-await-to-then, typescript-eslint/promise-function-async */

import { expect, test } from "bun:test";
import { createDefaultConfig } from "../../src/core/config/schema.ts";
import { explicitNull } from "../../src/core/providers/shared.ts";
import type { RuntimeCommandRunOptions, RuntimeHost } from "../../src/runtime/host.ts";
import { createRuntimeProviderAdapters } from "../../src/runtime/provider-adapters.ts";

const homeDirectory = "/tmp/test-home";
const updatedAt = "2026-03-08T12:00:00.000Z";

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

interface HostFixture {
  commandRuns: CommandRunRecord[];
  fileReads: string[];
  host: RuntimeHost;
  openedPaths: string[];
  spawnedTerminals: {
    args: string[];
    command: string;
  }[];
}

const createConfig = (): ReturnType<typeof createDefaultConfig> => createDefaultConfig();
const noCommandRuns = 0;

const createHostFixture = (input?: {
  commands?: Record<string, CommandFixture>;
  files?: Record<string, string>;
  now?: string;
  which?: Record<string, string | null>;
}): HostFixture => {
  const commandRuns: CommandRunRecord[] = [];
  const fileReads: string[] = [];
  const openedPaths: string[] = [];
  const spawnedTerminals: HostFixture["spawnedTerminals"] = [];
  const files = input?.files ?? {};

  return {
    commandRuns,
    fileReads,
    host: {
      commands: {
        run: (
          command: string,
          args: string[],
          options?: RuntimeCommandRunOptions,
        ): Promise<CommandFixture> => {
          commandRuns.push({ args, command, options });

          const commandKey = `${command} ${args.join(" ")}`.trim();

          return Promise.resolve(
            input?.commands?.[commandKey] ?? {
              exitCode: 1,
              stderr: `No fake command registered for ${commandKey}.`,
              stdout: "",
            },
          );
        },
        which: (command: string): Promise<string | null> =>
          Promise.resolve(input?.which?.[command] ?? explicitNull),
      },
      env: {},
      fileSystem: {
        fileExists: (path: string): Promise<boolean> => Promise.resolve(path in files),
        readTextFile: (path: string): Promise<string> => {
          fileReads.push(path);

          const fileContents = files[path];

          if (typeof fileContents !== "string") {
            throw new TypeError(`Missing fake file ${path}.`);
          }

          return Promise.resolve(fileContents);
        },
      },
      homeDirectory,
      now: (): Date => new Date(input?.now ?? updatedAt),
      openPath: (path: string): Promise<void> => {
        openedPaths.push(path);

        return Promise.resolve();
      },
      spawnTerminal: (command: string, args: string[]): Promise<void> => {
        spawnedTerminals.push({ args, command });

        return Promise.resolve();
      },
    },
    openedPaths,
    spawnedTerminals,
  };
};

test("codex auto prefers oauth over cli and maps the oauth snapshot", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    files: {
      "/tmp/test-home/.codex/auth.json": JSON.stringify({
        account_email: "codex@example.com",
        credits: {
          balance: 10.5,
        },
        plan: "Plus",
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
        version: "1.2.3",
      }),
    },
    which: {
      codex: "/usr/bin/codex",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.codex.refresh({
    config,
    providerConfig: config.providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("codex@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Plus");
  expect(refreshResult.snapshot?.version).toBe("1.2.3");
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
  expect(fixture.commandRuns).toHaveLength(noCommandRuns);
  expect(fixture.fileReads).toEqual(["/tmp/test-home/.codex/auth.json"]);
});

test("codex auto falls back to cli when oauth is unavailable", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    commands: {
      "codex -s read-only -a untrusted": {
        exitCode: 0,
        stderr: "",
        stdout: "Credits: 9.5\n5h limit 63%\nWeekly limit 91%\n",
      },
    },
    which: {
      codex: "/usr/bin/codex",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.codex.refresh({
    config,
    providerConfig: config.providers.codex,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: explicitNull,
      label: "Session",
      value: "63%",
    },
    {
      detail: explicitNull,
      label: "Weekly",
      value: "91%",
    },
    {
      detail: explicitNull,
      label: "Credits",
      value: "9.5",
    },
  ]);
  expect(fixture.commandRuns).toEqual([
    {
      args: ["-s", "read-only", "-a", "untrusted"],
      command: "codex",
      options: {
        input: "/status\n",
        timeoutMs: 8000,
      },
    },
  ]);
});

test("claude auto prefers oauth over cli and web", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    files: {
      "/tmp/test-home/.claude/.credentials.json": JSON.stringify({
        email: "claude@example.com",
        plan: "Max",
        usage: {
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
        },
        version: "1.5.0",
      }),
      "/tmp/test-home/.claude/session-token.json": JSON.stringify({
        email: "web@example.com",
        usage: {
          five_hour: { utilization: 12 },
          seven_day: { utilization: 18 },
          seven_day_sonnet: { utilization: 22 },
        },
      }),
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("oauth");
  expect(refreshResult.snapshot?.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Max");
  expect(refreshResult.snapshot?.version).toBe("1.5.0");
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
  expect(fixture.commandRuns).toHaveLength(noCommandRuns);
  expect(fixture.fileReads).toEqual(["/tmp/test-home/.claude/.credentials.json"]);
});

test("claude auto falls back to cli before web and maps cli status output", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    commands: {
      claude: {
        exitCode: 0,
        stderr: "",
        stdout:
          "Account: claude@example.com\nOrg: Max Plan\nCurrent session 21%\nCurrent week (all models) 42%\nCurrent week (Sonnet) 58%\n",
      },
    },
    files: {
      "/tmp/test-home/.claude/session-token.json": JSON.stringify({
        email: "web@example.com",
        usage: {
          five_hour: { utilization: 99 },
          seven_day: { utilization: 99 },
          seven_day_sonnet: { utilization: 99 },
        },
      }),
    },
    which: {
      claude: "/usr/bin/claude",
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("cli");
  expect(refreshResult.snapshot?.accountEmail).toBe("claude@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("Max Plan");
  expect(refreshResult.snapshot?.metrics.map((metric) => metric.label)).toEqual([
    "Session",
    "Weekly",
    "Sonnet",
  ]);
  expect(fixture.commandRuns).toEqual([
    {
      args: [],
      command: "claude",
      options: {
        input: "/status\n",
        timeoutMs: 8000,
      },
    },
  ]);
});

test("claude falls back to web and token-file actions use the resolved session file", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    files: {
      "/tmp/test-home/.claude/session.json": JSON.stringify({
        account: {
          email_address: "web@example.com",
        },
        usage: {
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
        },
      }),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.claude.refresh({
    config,
    providerConfig: config.providers.claude,
  });
  const openResult = await providerAdapters.claude.openTokenFile({
    config,
    providerConfig: config.providers.claude,
  });
  const reloadResult = await providerAdapters.claude.reloadTokenFile({
    config,
    providerConfig: config.providers.claude,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("web");
  expect(refreshResult.snapshot?.accountEmail).toBe("web@example.com");
  expect(fixture.openedPaths).toEqual(["/tmp/test-home/.claude/session.json"]);
  expect(openResult.status).toBe("success");
  expect(reloadResult.status).toBe("success");
  expect(fixture.fileReads).toEqual([
    "/tmp/test-home/.claude/session.json",
    "/tmp/test-home/.claude/session.json",
  ]);
});

test("gemini reads settings, oauth creds, and quota data from the api-only path", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    files: {
      "/tmp/test-home/.gemini/oauth_creds.json": JSON.stringify({
        id_token: "header.eyJlbWFpbCI6ImdlbWluaUBleGFtcGxlLmNvbSJ9.signature",
      }),
      "/tmp/test-home/.gemini/quota.json": JSON.stringify({
        buckets: [
          {
            modelId: "gemini-pro",
            remainingFraction: 0.72,
            resetTime: "tomorrow",
          },
          {
            modelId: "gemini-flash",
            remainingFraction: "0.41",
            resetTime: "later",
          },
        ],
        currentTier: {
          id: "paid",
        },
      }),
      "/tmp/test-home/.gemini/settings.json": JSON.stringify({
        security: {
          auth: {
            selectedType: "oauth-personal",
          },
        },
      }),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.gemini.refresh({
    config,
    providerConfig: config.providers.gemini,
  });

  expect(refreshResult.status).toBe("success");
  expect(refreshResult.snapshot?.sourceLabel).toBe("api");
  expect(refreshResult.snapshot?.accountEmail).toBe("gemini@example.com");
  expect(refreshResult.snapshot?.planLabel).toBe("paid");
  expect(refreshResult.snapshot?.metrics).toEqual([
    {
      detail: "tomorrow",
      label: "Pro",
      value: "72%",
    },
    {
      detail: "later",
      label: "Flash",
      value: "41%",
    },
  ]);
});

test("gemini rejects unsupported non-oauth auth types", async () => {
  const config = createConfig();
  const fixture = createHostFixture({
    files: {
      "/tmp/test-home/.gemini/oauth_creds.json": JSON.stringify({
        access_token: "token",
      }),
      "/tmp/test-home/.gemini/quota.json": JSON.stringify({
        buckets: [],
      }),
      "/tmp/test-home/.gemini/settings.json": JSON.stringify({
        security: {
          auth: {
            selectedType: "api-key",
          },
        },
      }),
    },
  });
  const providerAdapters = createRuntimeProviderAdapters(fixture.host);
  const refreshResult = await providerAdapters.gemini.refresh({
    config,
    providerConfig: config.providers.gemini,
  });

  expect(refreshResult.status).toBe("error");
  expect(refreshResult.message).toBe("Gemini OAuth credentials or quota data are unavailable.");
});
