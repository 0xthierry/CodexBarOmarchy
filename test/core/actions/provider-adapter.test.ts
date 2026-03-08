import { expect, test } from "bun:test";
import { createAppStore } from "@/core/store/app-store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderActionName = "login" | "refresh" | "repair";
type ProviderCall =
  | "claude:login"
  | "claude:refresh"
  | "claude:repair"
  | "codex:login"
  | "codex:refresh"
  | "gemini:login"
  | "gemini:refresh";

interface FakeConfigStore {
  deleteIfPresent: () => Promise<void>;
  filePath: string;
  load: () => Promise<OmarchyAgentBarConfig>;
  loadOrCreateDefault: () => Promise<{
    config: OmarchyAgentBarConfig;
    created: boolean;
  }>;
  save: (config: OmarchyAgentBarConfig) => Promise<OmarchyAgentBarConfig>;
}

interface TestBinaryLocator {
  findBinary: (binaryName: "claude" | "codex" | "gemini") => string | null;
  isInstalled: (binaryName: "claude" | "codex" | "gemini") => boolean;
}

interface ProviderAdapterFixture {
  calls: string[];
  providerAdapters: ReturnType<typeof createProviderAdapters>;
}

interface ClaudeProviderAdapterFixture {
  login: ReturnType<typeof createSuccessfulAdapterAction<"claude", "login">>;
  refresh: ReturnType<typeof createSuccessfulAdapterAction<"claude", "refresh">>;
  repair: ReturnType<typeof createSuccessfulAdapterAction<"claude", "repair">>;
}

interface CodexProviderAdapterFixture {
  login: ReturnType<typeof createSuccessfulAdapterAction<"codex", "login">>;
  refresh: ReturnType<typeof createSuccessfulAdapterAction<"codex", "refresh">>;
}

interface GeminiProviderAdapterFixture {
  login: ReturnType<typeof createSuccessfulAdapterAction<"gemini", "login">>;
  refresh: ReturnType<typeof createSuccessfulAdapterAction<"gemini", "refresh">>;
}

interface ProviderAdaptersFixture {
  claude: ClaudeProviderAdapterFixture;
  codex: CodexProviderAdapterFixture;
  gemini: GeminiProviderAdapterFixture;
}

interface SuccessfulActionSpec<
  ProviderValue extends "claude" | "codex" | "gemini",
  ActionValue extends ProviderActionName,
> {
  actionName: ActionValue;
  callName: ProviderCall;
  message: string;
  providerId: ProviderValue;
}

const resolveVoid = async (): Promise<void> => {
  await Promise.resolve();
};

const createFakeConfigStore = (initialConfig: OmarchyAgentBarConfig): FakeConfigStore => {
  let currentConfig = initialConfig;

  return {
    deleteIfPresent: resolveVoid,
    filePath: "/tmp/fake-omarchy-agent-bar-config.json",
    load: async (): Promise<OmarchyAgentBarConfig> => {
      await Promise.resolve();

      return currentConfig;
    },
    loadOrCreateDefault: async (): Promise<{
      config: OmarchyAgentBarConfig;
      created: boolean;
    }> => {
      await Promise.resolve();

      return {
        config: currentConfig,
        created: false,
      };
    },
    save: async (config: OmarchyAgentBarConfig): Promise<OmarchyAgentBarConfig> => {
      currentConfig = config;
      await Promise.resolve();

      return config;
    },
  };
};

const createTestBinaryLocator = (): TestBinaryLocator => ({
  findBinary: (binaryName: "claude" | "codex" | "gemini"): string => `/usr/bin/${binaryName}`,
  isInstalled: (): boolean => true,
});

const createSuccessfulAdapterAction =
  <ProviderValue extends "claude" | "codex" | "gemini", ActionValue extends ProviderActionName>(
    calls: string[],
    actionSpec: SuccessfulActionSpec<ProviderValue, ActionValue>,
  ) =>
  async (): Promise<
    ReturnType<typeof createSuccessfulProviderActionResult<ProviderValue, ActionValue>>
  > => {
    calls.push(actionSpec.callName);
    await Promise.resolve();

    return createSuccessfulProviderActionResult(
      actionSpec.providerId,
      actionSpec.actionName,
      actionSpec.message,
    );
  };

const createClaudeProviderAdapter = (calls: string[]): ClaudeProviderAdapterFixture => ({
  login: createSuccessfulAdapterAction(calls, {
    actionName: "login",
    callName: "claude:login",
    message: "Claude login started.",
    providerId: "claude",
  }),
  refresh: createSuccessfulAdapterAction(calls, {
    actionName: "refresh",
    callName: "claude:refresh",
    message: "Claude refreshed.",
    providerId: "claude",
  }),
  repair: createSuccessfulAdapterAction(calls, {
    actionName: "repair",
    callName: "claude:repair",
    message: "Claude repair started.",
    providerId: "claude",
  }),
});

const createCodexProviderAdapter = (calls: string[]): CodexProviderAdapterFixture => ({
  login: createSuccessfulAdapterAction(calls, {
    actionName: "login",
    callName: "codex:login",
    message: "Codex login started.",
    providerId: "codex",
  }),
  refresh: createSuccessfulAdapterAction(calls, {
    actionName: "refresh",
    callName: "codex:refresh",
    message: "Codex refreshed.",
    providerId: "codex",
  }),
});

const createGeminiProviderAdapter = (calls: string[]): GeminiProviderAdapterFixture => ({
  login: createSuccessfulAdapterAction(calls, {
    actionName: "login",
    callName: "gemini:login",
    message: "Gemini login started.",
    providerId: "gemini",
  }),
  refresh: createSuccessfulAdapterAction(calls, {
    actionName: "refresh",
    callName: "gemini:refresh",
    message: "Gemini refreshed.",
    providerId: "gemini",
  }),
});

const createProviderAdapters = (calls: string[]): ProviderAdaptersFixture => ({
  claude: createClaudeProviderAdapter(calls),
  codex: createCodexProviderAdapter(calls),
  gemini: createGeminiProviderAdapter(calls),
});

const createProviderAdapterFixture = (): ProviderAdapterFixture => {
  const calls: string[] = [];

  return {
    calls,
    providerAdapters: createProviderAdapters(calls),
  };
};

test("dispatches shared provider actions through the matching adapter", async () => {
  const adapterFixture = createProviderAdapterFixture();
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator(),
    configStore: createFakeConfigStore(createDefaultConfig()),
    providerAdapters: adapterFixture.providerAdapters,
  });

  await appStore.initialize();

  const codexLoginResult = await appStore.loginProvider("codex");
  const geminiRefreshResult = await appStore.refreshProvider("gemini");

  expect(adapterFixture.calls).toEqual(["codex:login", "gemini:refresh"]);
  expect(codexLoginResult).toEqual(
    createSuccessfulProviderActionResult("codex", "login", "Codex login started."),
  );
  expect(geminiRefreshResult).toEqual(
    createSuccessfulProviderActionResult("gemini", "refresh", "Gemini refreshed."),
  );
});

test("dispatches recovery only for providers that support it", async () => {
  const adapterFixture = createProviderAdapterFixture();
  const appStore = createAppStore({
    binaryLocator: createTestBinaryLocator(),
    configStore: createFakeConfigStore(createDefaultConfig()),
    providerAdapters: adapterFixture.providerAdapters,
  });

  await appStore.initialize();

  const claudeRepairResult = await appStore.repairProvider("claude");
  const codexRepairResult = await appStore.repairProvider("codex");

  expect(adapterFixture.calls).toEqual(["claude:repair"]);
  expect(claudeRepairResult).toEqual(
    createSuccessfulProviderActionResult("claude", "repair", "Claude repair started."),
  );
  expect(codexRepairResult).toEqual({
    actionName: "repair",
    message: "codex does not support a recovery action.",
    providerId: "codex",
    status: "unsupported",
  });
});
