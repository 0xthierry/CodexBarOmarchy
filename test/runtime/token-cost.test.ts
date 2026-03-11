import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanClaudeTokenCostDaily } from "../../src/runtime/cost/claude-scanner.ts";
import { scanCodexTokenCostDaily } from "../../src/runtime/cost/codex-scanner.ts";
import { fetchTokenCostSnapshot } from "../../src/runtime/cost/fetcher.ts";

const writeJsonl = async (filePath: string, lines: string[]): Promise<void> => {
  await mkdir(filePath.slice(0, filePath.lastIndexOf("/")), { recursive: true });
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
};

test("scans Codex JSONL logs and ignores invalid or unrelated lines", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-codex-cost-"));

  try {
    await writeJsonl(join(homeDirectory, ".codex", "sessions", "2026", "03", "10", "a.jsonl"), [
      JSON.stringify({
        payload: {
          model: "gpt-5-codex",
        },
        timestamp: "2026-03-10T10:00:00.000Z",
        type: "turn_context",
      }),
      "not json at all",
      JSON.stringify({
        payload: {
          info: {
            total_token_usage: {
              cached_input_tokens: 20,
              input_tokens: 100,
              output_tokens: 50,
            },
          },
          type: "token_count",
        },
        timestamp: "2026-03-10T10:01:00.000Z",
        type: "event_msg",
      }),
      JSON.stringify({
        payload: {
          info: {
            total_token_usage: {
              cached_input_tokens: 25,
              input_tokens: 140,
              output_tokens: 80,
            },
          },
          type: "token_count",
        },
        timestamp: "2026-03-10T10:02:00.000Z",
        type: "event_msg",
      }),
      JSON.stringify({
        payload: {
          type: "other",
        },
        timestamp: "2026-03-10T10:03:00.000Z",
        type: "event_msg",
      }),
    ]);

    const daily = await scanCodexTokenCostDaily({ homeDirectory });

    expect(daily).toEqual([
      {
        cacheReadTokens: 25,
        cacheWriteTokens: 0,
        costUsd: 0.000_947,
        date: "2026-03-10",
        inputTokens: 140,
        modelsUsed: ["gpt-5-codex"],
        outputTokens: 80,
        totalTokens: 245,
        unpricedModels: [],
      },
    ]);
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});

test("scans Claude JSONL logs, deduplicates streaming chunks, and respects CLAUDE_CONFIG_DIR", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "agent-stats-claude-cost-"));

  try {
    const projectRoot = join(rootDirectory, "projects");

    await writeJsonl(join(projectRoot, "workspace", "usage.jsonl"), [
      JSON.stringify({
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
        timestamp: "2026-03-11T09:00:00.000Z",
        type: "assistant",
      }),
      JSON.stringify({
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
        timestamp: "2026-03-11T09:00:01.000Z",
        type: "assistant",
      }),
      JSON.stringify({
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
        timestamp: "2026-03-11T09:05:00.000Z",
        type: "assistant",
      }),
      JSON.stringify({
        message: {
          id: "msg_3",
          model: "claude-haiku-4-5",
        },
        requestId: "req_3",
        timestamp: "2026-03-11T09:10:00.000Z",
        type: "assistant",
      }),
    ]);

    const daily = await scanClaudeTokenCostDaily({
      env: {
        CLAUDE_CONFIG_DIR: rootDirectory,
      },
    });

    expect(daily).toEqual([
      {
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
        costUsd: 0.006_618,
        date: "2026-03-11",
        inputTokens: 1200,
        modelsUsed: ["claude-haiku-4-5", "claude-sonnet-4-5"],
        outputTokens: 240,
        totalTokens: 1590,
        unpricedModels: [],
      },
    ]);
  } finally {
    await rm(rootDirectory, { force: true, recursive: true });
  }
});

test("prices Claude Sonnet 4.6 using the official Anthropic Sonnet 4.6 rates", async () => {
  const rootDirectory = await mkdtemp(join(tmpdir(), "agent-stats-claude46-cost-"));

  try {
    const projectRoot = join(rootDirectory, "projects");

    await writeJsonl(join(projectRoot, "workspace", "usage.jsonl"), [
      JSON.stringify({
        message: {
          id: "msg_1",
          model: "claude-sonnet-4-6",
          usage: {
            cache_creation_input_tokens: 50,
            cache_read_input_tokens: 100,
            input_tokens: 1000,
            output_tokens: 200,
          },
        },
        requestId: "req_1",
        timestamp: "2026-03-11T09:00:00.000Z",
        type: "assistant",
      }),
    ]);

    const daily = await scanClaudeTokenCostDaily({
      env: {
        CLAUDE_CONFIG_DIR: rootDirectory,
      },
    });

    expect(daily).toEqual([
      {
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
        costUsd: 0.006_218,
        date: "2026-03-11",
        inputTokens: 1000,
        modelsUsed: ["claude-sonnet-4-6"],
        outputTokens: 200,
        totalTokens: 1350,
        unpricedModels: [],
      },
    ]);
  } finally {
    await rm(rootDirectory, { force: true, recursive: true });
  }
});

test("summarizes today and last 30 days from provider daily token-cost entries", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-fetcher-cost-"));

  try {
    await writeJsonl(join(homeDirectory, ".codex", "sessions", "2026", "03", "11", "today.jsonl"), [
      JSON.stringify({
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
        timestamp: "2026-03-11T12:00:00.000Z",
        type: "event_msg",
      }),
    ]);
    await writeJsonl(join(homeDirectory, ".codex", "sessions", "2026", "02", "15", "old.jsonl"), [
      JSON.stringify({
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 0,
              input_tokens: 30,
              output_tokens: 10,
            },
            model: "gpt-5",
          },
          type: "token_count",
        },
        timestamp: "2026-02-15T12:00:00.000Z",
        type: "event_msg",
      }),
    ]);

    const snapshot = await fetchTokenCostSnapshot("codex", {
      homeDirectory,
      now: new Date("2026-03-11T14:00:00.000Z"),
    });

    expect(snapshot.today).toEqual({
      costUsd: 0.000_301,
      tokens: 85,
      unpricedModels: [],
    });
    expect(snapshot.last30Days).toEqual({
      costUsd: 0.000_439,
      tokens: 125,
      unpricedModels: [],
    });
    expect(snapshot.daily).toEqual([
      {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costUsd: 0.000_138,
        date: "2026-02-15",
        inputTokens: 30,
        modelsUsed: ["gpt-5"],
        outputTokens: 10,
        totalTokens: 40,
        unpricedModels: [],
      },
      {
        cacheReadTokens: 10,
        cacheWriteTokens: 0,
        costUsd: 0.000_301,
        date: "2026-03-11",
        inputTokens: 50,
        modelsUsed: ["gpt-5"],
        outputTokens: 25,
        totalTokens: 85,
        unpricedModels: [],
      },
    ]);
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});

test("treats still-unpriced model variants as zero-cost estimates while preserving the unknown model list", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-unpriced-cost-"));

  try {
    await writeJsonl(join(homeDirectory, ".codex", "sessions", "2026", "03", "11", "today.jsonl"), [
      JSON.stringify({
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 10,
              input_tokens: 50,
              output_tokens: 25,
            },
            model: "gpt-5.3-codex-spark",
          },
          type: "token_count",
        },
        timestamp: "2026-03-11T12:00:00.000Z",
        type: "event_msg",
      }),
    ]);

    const snapshot = await fetchTokenCostSnapshot("codex", {
      homeDirectory,
      now: new Date("2026-03-11T14:00:00.000Z"),
    });

    expect(snapshot.today).toEqual({
      costUsd: 0,
      tokens: 85,
      unpricedModels: ["gpt-5.3-codex-spark"],
    });
    expect(snapshot.last30Days).toEqual({
      costUsd: 0,
      tokens: 85,
      unpricedModels: ["gpt-5.3-codex-spark"],
    });
    expect(snapshot.daily).toEqual([
      {
        cacheReadTokens: 10,
        cacheWriteTokens: 0,
        costUsd: 0,
        date: "2026-03-11",
        inputTokens: 50,
        modelsUsed: ["gpt-5.3-codex-spark"],
        outputTokens: 25,
        totalTokens: 85,
        unpricedModels: ["gpt-5.3-codex-spark"],
      },
    ]);
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});

test("prices newly supported Codex models from the official OpenAI pricing pages", async () => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "agent-stats-priced-codex-cost-"));

  try {
    await writeJsonl(join(homeDirectory, ".codex", "sessions", "2026", "03", "11", "today.jsonl"), [
      JSON.stringify({
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 10,
              input_tokens: 50,
              output_tokens: 25,
            },
            model: "gpt-5.4",
          },
          type: "token_count",
        },
        timestamp: "2026-03-11T12:00:00.000Z",
        type: "event_msg",
      }),
      JSON.stringify({
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 0,
              input_tokens: 40,
              output_tokens: 20,
            },
            model: "gpt-5.1-codex-max",
          },
          type: "token_count",
        },
        timestamp: "2026-03-11T12:05:00.000Z",
        type: "event_msg",
      }),
      JSON.stringify({
        payload: {
          info: {
            last_token_usage: {
              cached_input_tokens: 5,
              input_tokens: 30,
              output_tokens: 10,
            },
            model: "gpt-5.1-codex-mini",
          },
          type: "token_count",
        },
        timestamp: "2026-03-11T12:10:00.000Z",
        type: "event_msg",
      }),
    ]);

    const snapshot = await fetchTokenCostSnapshot("codex", {
      homeDirectory,
      now: new Date("2026-03-11T14:00:00.000Z"),
    });

    expect(snapshot.today).toEqual({
      costUsd: 0.000_754,
      tokens: 190,
      unpricedModels: [],
    });
    expect(snapshot.last30Days).toEqual({
      costUsd: 0.000_754,
      tokens: 190,
      unpricedModels: [],
    });
    expect(snapshot.daily).toEqual([
      {
        cacheReadTokens: 15,
        cacheWriteTokens: 0,
        costUsd: 0.000_754,
        date: "2026-03-11",
        inputTokens: 120,
        modelsUsed: ["gpt-5.1-codex-max", "gpt-5.1-codex-mini", "gpt-5.4"],
        outputTokens: 55,
        totalTokens: 190,
        unpricedModels: [],
      },
    ]);
  } finally {
    await rm(homeDirectory, { force: true, recursive: true });
  }
});
