import type { ProviderAdapters } from "@/core/actions/provider-adapter.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { createClaudeProviderAdapter } from "@/runtime/providers/claude.ts";
import { createCodexProviderAdapter } from "@/runtime/providers/codex.ts";
import { createGeminiProviderAdapter } from "@/runtime/providers/gemini.ts";

const createRuntimeProviderAdapters = (host: RuntimeHost): ProviderAdapters => ({
  claude: createClaudeProviderAdapter(host),
  codex: createCodexProviderAdapter(host),
  gemini: createGeminiProviderAdapter(host),
});

export { createRuntimeProviderAdapters };
