import { expect, test } from "bun:test";
import { createRefreshActionResult } from "@/core/actions/provider-adapter.ts";
import { createAppStore } from "@/core/store/app-store.ts";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createSuccessfulProviderActionResult } from "@/core/actions/action-result.ts";

type OmarchyAgentBarConfig = ReturnType<typeof createDefaultConfig>;
type ProviderActionName = "login" | "openTokenFile" | "refresh" | "reloadTokenFile" | "repair";
type ProviderCall =
  | "claude:login"
  | "claude:openTokenFile"
  | "claude:refresh"
  | "claude:reloadTokenFile"
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
  openTokenFile: ReturnType<typeof createSuccessfulAdapterAction<"claude", "openTokenFile">>;
  refresh: ReturnType<typeof createSuccessfulRefreshAdapterAction<"claude">>;
  reloadTokenFile: ReturnType<typeof createSuccessfulAdapterAction<"claude", "reloadTokenFile">>;
  repair: ReturnType<typeof createSuccessfulAdapterAction<"claude", "repair">>;
}

interface CodexProviderAdapterFixture {
  login: ReturnType<typeof createSuccessfulAdapterAction<"codex", "login">>;
  refresh: ReturnType<typeof createSuccessfulRefreshAdapterAction<"codex">>;
}

interface GeminiProviderAdapterFixture {
  login: ReturnType<typeof createSuccessfulAdapterAction<"gemini", "login">>;
  refresh: ReturnType<typeof createSuccessfulRefreshAdapterAction<"gemini">>;
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

const fakeBinaryPath = (binaryName: string): string => `test-bin/${binaryName}`;

const createFakeConfigStore = (initialConfig: OmarchyAgentBarConfig): FakeConfigStore => {
  let currentConfig = initialConfig;

  return {
    deleteIfPresent: resolveVoid,
    filePath: "test-config/fake-omarchy-agent-bar-config.json",
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
  findBinary: (binaryName: "claude" | "codex" | "gemini"): string => fakeBinaryPath(binaryName),
  isInstalled: (): boolean => true,
});

const createSuccessfulAdapterAction =
  <ProviderValue extends "claude" | "codex" | "gemini", ActionValue extends ProviderActionName>(
    calls: string[],
    actionSpec: SuccessfulActionSpec<ProviderValue, ActionValue>,
  ) =>
  async (
    _context?: unknown,
  ): Promise<
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

const createSuccessfulRefreshAdapterAction =
  <ProviderValue extends "claude" | "codex" | "gemini">(
    calls: string[],
    actionSpec: SuccessfulActionSpec<ProviderValue, "refresh">,
  ) =>
  async (): Promise<ReturnType<typeof createRefreshActionResult<ProviderValue>>> => {
    calls.push(actionSpec.callName);
    await Promise.resolve();

    return createRefreshActionResult(
      createSuccessfulProviderActionResult(actionSpec.providerId, "refresh", actionSpec.message),
    );
  };

const createClaudeProviderAdapter = (calls: string[]): ClaudeProviderAdapterFixture => ({
  login: createSuccessfulAdapterAction(calls, {
    actionName: "login",
    callName: "claude:login",
    message: "Claude login started.",
    providerId: "claude",
  }),
  openTokenFile: createSuccessfulAdapterAction(calls, {
    actionName: "openTokenFile",
    callName: "claude:openTokenFile",
    message: "Claude token file opened.",
    providerId: "claude",
  }),
  refresh: createSuccessfulRefreshAdapterAction(calls, {
    actionName: "refresh",
    callName: "claude:refresh",
    message: "Claude refreshed.",
    providerId: "claude",
  }),
  reloadTokenFile: createSuccessfulAdapterAction(calls, {
    actionName: "reloadTokenFile",
    callName: "claude:reloadTokenFile",
    message: "Claude token file reloaded.",
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
  refresh: createSuccessfulRefreshAdapterAction(calls, {
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
  refresh: createSuccessfulRefreshAdapterAction(calls, {
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
    createRefreshActionResult(
      createSuccessfulProviderActionResult("gemini", "refresh", "Gemini refreshed."),
    ),
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
