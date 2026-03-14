import type { RuntimeHost } from "@/runtime/host.ts";
import { readCommandVersion } from "@/runtime/providers/shared.ts";

const claudeOAuthRefreshEndpoint = "https://platform.claude.com/v1/oauth/token";
const claudeOAuthUsageEndpoint = "https://api.anthropic.com/api/oauth/usage";
const claudeTimeoutMs = 8000;
const claudeCliUsageTimeoutMs = 18_000;
const claudeCliStatusTimeoutMs = 10_000;
const fallbackClaudeCodeVersion = "2.1.0";
const oauthUsageBetaHeader = "oauth-2025-04-20";

const resolveClaudeVersion = async (host: RuntimeHost): Promise<string | null> =>
  readCommandVersion(host, "claude", ["--version"], claudeTimeoutMs);

export {
  claudeCliStatusTimeoutMs,
  claudeCliUsageTimeoutMs,
  claudeOAuthRefreshEndpoint,
  claudeOAuthUsageEndpoint,
  claudeTimeoutMs,
  fallbackClaudeCodeVersion,
  oauthUsageBetaHeader,
  resolveClaudeVersion,
};
