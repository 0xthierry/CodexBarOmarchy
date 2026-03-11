import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { createInitialLocalState } from "@/ui/tui/controller.ts";
import {
  createTuiViewModel,
  formatHeaderClockDisplay,
  maskEmailAddress,
} from "@/ui/tui/presenter.ts";

test("derives provider tabs in config order and focuses the selected provider", () => {
  const defaultConfig = createDefaultConfig();
  const providerOrder: (typeof defaultConfig.providerOrder)[number][] = [
    "gemini",
    "codex",
    "claude",
  ];
  const config = {
    ...defaultConfig,
    providerOrder,
    providers: {
      ...defaultConfig.providers,
      claude: {
        ...defaultConfig.providers.claude,
        enabled: false,
      },
    },
    selectedProvider: "gemini" as const,
  };
  const state = createAppStoreState(config, createDefaultProviderRuntimeStateMap());
  const viewModel = createTuiViewModel(state, createInitialLocalState());

  expect(viewModel.tabs.map((tab) => tab.id)).toEqual(["gemini", "codex", "claude"]);
  expect(viewModel.tabs.map((tab) => tab.label)).toEqual(["gemini", "codex", "claude off"]);
  expect(viewModel.tabs.find((tab) => tab.selected)?.id).toBe("gemini");
});

test("renders the required shell sections for the selected provider", () => {
  const config = createDefaultConfig();
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();
  const currentTime = new Date("2026-03-10T15:45:12.000Z");

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "OAuth",
    },
    latestError: null,
    providerDetails: null,
    serviceStatus: {
      description: "Partial outage on chat history",
      indicator: "major",
      updatedAt: "2026-03-10T11:59:00.000Z",
    },
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: {
        currencyCode: "USD",
        limit: 100,
        periodLabel: "Monthly",
        resetsAt: null,
        updatedAt: "2026-03-10T12:00:00.000Z",
        used: 25,
      },
      quotaBuckets: [
        {
          modelId: "gemini-2.5-pro",
          remainingFraction: 0.72,
          resetTime: "2026-03-10T18:00:00.000Z",
        },
      ],
      rateWindows: [
        {
          label: "Session",
          resetAt: null,
          usedPercent: 58,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: {
          detail: null,
          label: "Session",
          value: "58%",
        },
        sonnet: null,
        weekly: null,
      },
    },
    version: "1.2.3",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
    currentTime,
  );

  expect(viewModel.headerLines[0]).toContain("CODEX");
  expect(viewModel.headerLines[1]).toContain(formatHeaderClockDisplay(currentTime));
  expect(viewModel.usageLines.join("\n")).toContain("Session");
  expect(viewModel.usageLines.join("\n")).toContain("Extra usage 25%");
  expect(viewModel.usageLines.join("\n")).toContain("USD 25.00 / USD 100.00 Monthly");
  expect(viewModel.usageLines.join("\n")).not.toContain("Raw quotas");
  expect(viewModel.usageLines.join("\n")).not.toContain("gemini-2.5-pro");
  expect(viewModel.usageBanner).toEqual({
    text: "Partial outage on chat history",
    tone: "status",
  });
  expect(viewModel.detailsLines.join("\n")).not.toContain("health");
  expect(viewModel.detailsLines.join("\n")).toContain("extra");
  expect(viewModel.detailsLines.join("\n")).toContain("account");
  expect(viewModel.detailsLines.join("\n")).toContain("co****ex@example.com");
  expect(viewModel.detailsLines.join("\n")).toContain("updated");
  expect(viewModel.configLines.join("\n")).toContain("Usage");
  expect(viewModel.menuLines.join("\n")).toContain("settings");
});

test("masks account emails for screenshot-safe display", () => {
  expect(maskEmailAddress("thierry@gmail.com")).toBe("thi****ry@gmail.com");
  expect(maskEmailAddress("asdfds1234@gmail.com")).toBe("asd****34@gmail.com");
  expect(maskEmailAddress("ab@example.com")).toBe("a****@example.com");
  expect(maskEmailAddress(null)).toBe("unknown");
  expect(maskEmailAddress("not-an-email")).toBe("not-an-email");
});

test("omits usage health status when the provider is operational", () => {
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.gemini.snapshot = {
    identity: {
      accountEmail: "gemini@example.com",
      planLabel: "Pro",
    },
    latestError: null,
    providerDetails: null,
    serviceStatus: {
      description: null,
      indicator: "none",
      updatedAt: "2026-03-10T12:00:00.000Z",
    },
    sourceLabel: "api",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [
        {
          modelId: "gemini-2.5-pro",
          remainingFraction: 0.58,
          resetTime: "2026-03-10T18:00:00.000Z",
        },
      ],
      rateWindows: [
        {
          label: "Pro",
          resetAt: null,
          usedPercent: 42,
        },
      ],
      windows: {
        flash: null,
        pro: {
          detail: null,
          label: "Pro",
          value: "42%",
        },
        session: null,
        sonnet: null,
        weekly: null,
      },
    },
    version: "1.0.0",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(createDefaultConfig(), runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageBanner).toBeNull();
  expect(viewModel.usageLines.join("\n")).not.toContain("Raw quotas");
  expect(viewModel.detailsLines.join("\n")).not.toContain("quotas");
});

test("renders Codex provider details from the structured providerDetails snapshot", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "codex" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "pro",
    },
    latestError: null,
    providerDetails: {
      dashboard: {
        additionalRateLimits: [
          {
            label: "GPT-5.3-Codex-Spark",
            remainingPercent: 81,
            resetAt: "2026-03-10T19:00:00.000Z",
          },
        ],
        approximateCreditUsage: {
          cloudMessages: 12,
          localMessages: 3,
        },
        codeReviewWindow: {
          label: "Code review",
          remainingPercent: 64,
          resetAt: "2026-03-10T18:00:00.000Z",
        },
        creditHistory: [
          {
            amount: -2.5,
            occurredAt: "2026-03-10T09:00:00.000Z",
            type: "usage",
          },
        ],
        purchaseUrl: "https://chatgpt.com/buy-credits",
        usageBreakdown: [
          {
            date: "2026-03-10",
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
            cacheReadTokens: 10,
            cacheWriteTokens: 0,
            costUsd: 1.23,
            date: "2026-03-10",
            inputTokens: 50,
            modelsUsed: ["gpt-5"],
            outputTokens: 25,
            totalTokens: 85,
            unpricedModels: [],
          },
        ],
        last30Days: {
          costUsd: 4.56,
          tokens: 320,
          unpricedModels: [],
        },
        today: {
          costUsd: 1.23,
          tokens: 85,
          unpricedModels: [],
        },
        updatedAt: "2026-03-10T12:00:00.000Z",
      },
    },
    serviceStatus: null,
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: {
          detail: null,
          label: "Credits",
          value: "10.50",
        },
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Weekly",
          resetAt: "2026-03-10T18:00:00.000Z",
          usedPercent: 75,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: {
          detail: "2026-03-10T18:00:00.000Z",
          label: "Weekly",
          value: "75%",
        },
      },
    },
    version: "1.2.3",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("OpenAI credit balance\n\nCode review 36%");
  expect(viewModel.usageLines.join("\n")).toContain("Code review 36%");
  expect(viewModel.usageLines.join("\n")).toContain("GPT-5.3-Codex-Spark 19%");
  expect(viewModel.usageLines.join("\n")).toContain("██████░░░░░░░░░░");
  expect(viewModel.usageLines.join("\n")).toContain("███░░░░░░░░░░░░░");
  expect(viewModel.usageLines.join("\n")).toContain("Resets 10 Mar 19:00");
  expect(viewModel.usageLines.join("\n")).toContain("Weekly");
  expect(viewModel.usageLines.join("\n")).toContain("Credit history 1 events");
  expect(viewModel.usageLines.join("\n")).toContain("Credits approx 12 cloud / 3 local");
  expect(viewModel.usageLines.join("\n")).toContain("Cost:");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost today: USD 1.23");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost 30d: USD 4.56");
});

test("renders Claude provider details from the structured providerDetails snapshot", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "claude" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.claude.snapshot = {
    identity: {
      accountEmail: "claude@example.com",
      planLabel: "Claude Team",
    },
    latestError: null,
    providerDetails: {
      accountOrg: "Claude Team",
      kind: "claude",
      tokenCost: {
        daily: [
          {
            cacheReadTokens: 100,
            cacheWriteTokens: 50,
            costUsd: 6.61,
            date: "2026-03-10",
            inputTokens: 1200,
            modelsUsed: ["claude-sonnet-4-5"],
            outputTokens: 240,
            totalTokens: 1590,
            unpricedModels: [],
          },
        ],
        last30Days: {
          costUsd: 12.34,
          tokens: 3200,
          unpricedModels: [],
        },
        today: {
          costUsd: 6.61,
          tokens: 1590,
          unpricedModels: [],
        },
        updatedAt: "2026-03-10T12:00:00.000Z",
      },
    },
    serviceStatus: null,
    sourceLabel: "web",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Weekly",
          resetAt: "2026-03-10T18:00:00.000Z",
          usedPercent: 60,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: {
          detail: "2026-03-10T18:00:00.000Z",
          label: "Weekly",
          value: "60%",
        },
      },
    },
    version: "2.1.71",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("Cost:");
  expect(viewModel.usageLines.join("\n")).toContain("Weekly");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost today: USD 6.61");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost 30d: USD 12.34");
  expect(viewModel.detailsLines.join("\n")).toContain("org");
  expect(viewModel.detailsLines.join("\n")).toContain("Claude Team");
});

test("keeps Claude local counters compact so cost lines remain visible", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "claude" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.claude.snapshot = {
    identity: {
      accountEmail: "claude@example.com",
      planLabel: "max",
    },
    latestError: null,
    providerDetails: {
      accountOrg: "max",
      kind: "claude",
      tokenCost: {
        daily: [],
        last30Days: {
          costUsd: 795.79,
          tokens: 1000,
          unpricedModels: [],
        },
        today: {
          costUsd: 15.18,
          tokens: 100,
          unpricedModels: [],
        },
        updatedAt: "2026-03-11T12:00:00.000Z",
      },
    },
    serviceStatus: {
      description: "Partially Degraded Service",
      indicator: "minor",
      updatedAt: "2026-03-11T12:00:00.000Z",
    },
    sourceLabel: "cli",
    state: "ready",
    updatedAt: "2026-03-11T12:00:00.000Z",
    usage: {
      additional: [
        {
          detail: "2026-03-07",
          label: "Tokens",
          value: "48319",
        },
        {
          detail: "2026-03-07",
          label: "Messages",
          value: "3880",
        },
        {
          detail: "2026-03-07",
          label: "Sessions",
          value: "4",
        },
        {
          detail: "2026-03-07",
          label: "Tools",
          value: "151",
        },
      ],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: null,
      },
    },
    version: null,
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("Tokens      48319\n2026-03-07\nMessages");
  expect(viewModel.usageLines.join("\n")).toContain("Cost:");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost today: USD 15.18");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost 30d: USD 795.79");
  expect(viewModel.usageBanner).toEqual({
    text: "Partially Degraded Service",
    tone: "status",
  });
});

test("formats estimated token costs with grouped thousands separators", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "codex" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "pro",
    },
    latestError: null,
    providerDetails: {
      dashboard: null,
      kind: "codex",
      tokenCost: {
        daily: [],
        last30Days: {
          costUsd: 1951.481028,
          tokens: 100,
          unpricedModels: [],
        },
        today: {
          costUsd: 458.755806,
          tokens: 10,
          unpricedModels: [],
        },
        updatedAt: "2026-03-11T12:00:00.000Z",
      },
    },
    serviceStatus: null,
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-11T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: null,
      },
    },
    version: "0.114.0",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost today: USD 458.76");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost 30d: USD 1,951.48");
});

test("prefers refresh errors over service status in the usage banner", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "claude" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.claude.snapshot = {
    identity: {
      accountEmail: "claude@example.com",
      planLabel: "Claude Team",
    },
    latestError: "Claude OAuth request failed with HTTP 429.",
    providerDetails: null,
    serviceStatus: {
      description: "Partially Degraded Service",
      indicator: "minor",
      updatedAt: "2026-03-11T12:00:00.000Z",
    },
    sourceLabel: "oauth",
    state: "error",
    updatedAt: "2026-03-11T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Weekly",
          resetAt: "2026-03-12T12:00:00.000Z",
          usedPercent: 60,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: {
          detail: "2026-03-12T12:00:00.000Z",
          label: "Weekly",
          value: "60%",
        },
      },
    },
    version: "2.1.72",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("Weekly");
  expect(viewModel.usageBanner).toEqual({
    text: "Claude OAuth request failed with HTTP 429.",
    tone: "error",
  });
});

test("shows the new empty usage guidance when no usage metrics are available", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "claude" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.claude.snapshot = {
    identity: {
      accountEmail: null,
      planLabel: null,
    },
    latestError: null,
    providerDetails: null,
    serviceStatus: null,
    sourceLabel: "cli",
    state: "ready",
    updatedAt: "2026-03-11T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: null,
      },
    },
    version: "2.1.72",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines).toEqual(["No usage data yet, try another source in the settings."]);
});

test("renders unavailable token-cost text when pricing is unknown", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "codex" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "pro",
    },
    latestError: null,
    providerDetails: {
      dashboard: null,
      kind: "codex",
      tokenCost: {
        daily: [
          {
            cacheReadTokens: 10,
            cacheWriteTokens: 0,
            costUsd: null,
            date: "2026-03-10",
            inputTokens: 50,
            modelsUsed: ["gpt-5.4"],
            outputTokens: 25,
            totalTokens: 85,
            unpricedModels: ["gpt-5.4"],
          },
        ],
        last30Days: {
          costUsd: null,
          tokens: 85,
          unpricedModels: ["gpt-5.4"],
        },
        today: {
          costUsd: null,
          tokens: 85,
          unpricedModels: ["gpt-5.4"],
        },
        updatedAt: "2026-03-10T12:00:00.000Z",
      },
    },
    serviceStatus: null,
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Weekly",
          resetAt: "2026-03-10T18:00:00.000Z",
          usedPercent: 75,
        },
      ],
      windows: {
        flash: null,
        pro: null,
        session: null,
        sonnet: null,
        weekly: {
          detail: "2026-03-10T18:00:00.000Z",
          label: "Weekly",
          value: "75%",
        },
      },
    },
    version: "1.2.3",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).toContain("Cost:");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost today: unavailable");
  expect(viewModel.usageLines.join("\n")).toContain("Estimated token cost 30d: unavailable");
});

test("renders Gemini quota drill-down and incidents from providerDetails", () => {
  const config = {
    ...createDefaultConfig(),
    selectedProvider: "gemini" as const,
  };
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.gemini.snapshot = {
    identity: {
      accountEmail: "gemini@example.com",
      planLabel: "Free",
    },
    latestError: null,
    providerDetails: {
      incidents: [
        {
          severity: null,
          status: "SERVICE_INFORMATION",
          summary: "Minor issue.",
          updatedAt: "2026-03-10T12:05:00.000Z",
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
        otherBuckets: [
          {
            modelId: "gemini-2.0-flash-thinking",
            remainingFraction: 0.33,
            resetTime: "later",
          },
        ],
        proBuckets: [
          {
            modelId: "gemini-2.5-pro",
            remainingFraction: 0.72,
            resetTime: "tomorrow",
          },
        ],
      },
    },
    serviceStatus: {
      description: "Minor issue.",
      indicator: "minor",
      updatedAt: "2026-03-10T12:05:00.000Z",
    },
    sourceLabel: "api",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    usage: {
      additional: [],
      balances: {
        credits: null,
      },
      providerCost: null,
      quotaBuckets: [],
      rateWindows: [
        {
          label: "Pro",
          resetAt: "2026-03-10T18:00:00.000Z",
          usedPercent: 28,
        },
      ],
      windows: {
        flash: null,
        pro: {
          detail: "2026-03-10T18:00:00.000Z",
          label: "Pro",
          value: "28%",
        },
        session: null,
        sonnet: null,
        weekly: null,
      },
    },
    version: "0.29.7",
  };

  const viewModel = createTuiViewModel(
    createAppStoreState(config, runtimeStateMap),
    createInitialLocalState(),
  );

  expect(viewModel.usageLines.join("\n")).not.toContain("Quota buckets");
  expect(viewModel.usageLines.join("\n")).toContain("Incidents 1");
  expect(viewModel.detailsLines.join("\n")).toContain("incident");
  expect(viewModel.detailsLines.join("\n")).toContain("Minor issue.");
});

test("shows the settings modal structure when the modal is open", () => {
  const localState = {
    ...createInitialLocalState(),
    isSettingsOpen: true,
  };
  const viewModel = createTuiViewModel(
    createAppStoreState(createDefaultConfig(), createDefaultProviderRuntimeStateMap()),
    localState,
  );

  expect(viewModel.modal?.title).toBe("settings • codex");
  expect(viewModel.modal?.settingsItems.length).toBeGreaterThan(0);
  expect(viewModel.modal?.detailLines.join("\n")).toContain("Current:");
});
