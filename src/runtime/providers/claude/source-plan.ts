import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { resolveClaudeWebSession } from "@/runtime/providers/claude-web-auth.ts";
import type { ClaudeWebSessionSnapshot } from "@/runtime/providers/claude-web-models.ts";
import { joinPath } from "@/runtime/providers/shared.ts";

const claudeTokenFileNames = ["session-token.json", "session.json"] as const;

interface ClaudeSourceConfig {
  activeTokenAccountIndex: number;
  cookieSource: "auto" | "manual";
  tokenAccounts: {
    label: string;
    token: string;
  }[];
}

interface ClaudeCliSourceHandle {
  claudeBinaryPath: string;
  scriptBinaryPath: string | null;
}

interface ClaudeResolvedBrowserSessionSource {
  kind: "browser-session";
  session: ClaudeWebSessionSnapshot;
}

interface ClaudeResolvedManualSessionTokenSource {
  kind: "manual-session-token";
  sessionToken: string;
}

interface ClaudeResolvedTokenFileSource {
  kind: "token-file";
  tokenFilePath: string;
}

type ClaudeResolvedWebSource =
  | ClaudeResolvedBrowserSessionSource
  | ClaudeResolvedManualSessionTokenSource
  | ClaudeResolvedTokenFileSource;

interface ClaudeResolvedCliSource {
  cli: ClaudeCliSourceHandle;
  fallbackWeb: ClaudeResolvedWebSource | null;
  kind: "cli";
}

interface ClaudeResolvedOauthSource {
  fallbackCli: ClaudeCliSourceHandle | null;
  kind: "oauth";
  oauthPath: string;
}

interface ClaudeResolvedSelectedWebSource {
  kind: "web";
  web: ClaudeResolvedWebSource;
}

type ClaudeResolvedSource =
  | ClaudeResolvedCliSource
  | ClaudeResolvedOauthSource
  | ClaudeResolvedSelectedWebSource;

const resolveClaudeOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", ".credentials.json");

const resolveClaudeDefaultTokenFilePath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".claude", claudeTokenFileNames[0]);

const getActiveClaudeSessionToken = (providerConfig: ClaudeSourceConfig): string | null => {
  const activeTokenAccount = providerConfig.tokenAccounts[providerConfig.activeTokenAccountIndex];
  const sessionToken = activeTokenAccount?.token.trim();

  if (typeof sessionToken === "string" && sessionToken !== "") {
    return sessionToken;
  }

  return explicitNull;
};

const resolveClaudeCliSourceHandle = async (
  host: RuntimeHost,
): Promise<ClaudeCliSourceHandle | null> => {
  const claudeBinaryPath = await host.commands.which("claude");

  if (claudeBinaryPath === null) {
    return explicitNull;
  }

  return {
    claudeBinaryPath,
    scriptBinaryPath: await host.commands.which("script"),
  };
};

const resolveClaudeTokenFilePath = async (host: RuntimeHost): Promise<string | null> => {
  for (const fileName of claudeTokenFileNames) {
    const filePath = joinPath(host.homeDirectory, ".claude", fileName);

    if (await host.fileSystem.fileExists(filePath)) {
      return filePath;
    }
  }

  return explicitNull;
};

const resolveClaudeWebSource = async (
  host: RuntimeHost,
  providerConfig: ClaudeSourceConfig,
): Promise<ClaudeResolvedWebSource | null> => {
  if (providerConfig.cookieSource === "manual") {
    const sessionToken = getActiveClaudeSessionToken(providerConfig);

    if (sessionToken === null) {
      return explicitNull;
    }

    return {
      kind: "manual-session-token",
      sessionToken,
    };
  }

  try {
    const autoSession = await resolveClaudeWebSession(host, {
      cookieSource: "auto",
      manualSessionToken: explicitNull,
    });

    if (autoSession !== null) {
      return {
        kind: "browser-session",
        session: autoSession,
      };
    }
  } catch {
    // Fall through to the legacy token-file path.
  }

  const tokenFilePath = await resolveClaudeTokenFilePath(host);

  if (tokenFilePath === null) {
    return explicitNull;
  }

  return {
    kind: "token-file",
    tokenFilePath,
  };
};

const resolveClaudeSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth" | "web",
  providerConfig: ClaudeSourceConfig,
): Promise<ClaudeResolvedSource | null> => {
  const oauthPath = resolveClaudeOauthPath(host);
  const hasOauth = await host.fileSystem.fileExists(oauthPath);

  if (selectedSource === "oauth") {
    if (!hasOauth) {
      return explicitNull;
    }

    return {
      fallbackCli: explicitNull,
      kind: "oauth",
      oauthPath,
    };
  }

  if (selectedSource === "cli") {
    const cliSource = await resolveClaudeCliSourceHandle(host);

    if (cliSource === null) {
      return explicitNull;
    }

    return {
      cli: cliSource,
      fallbackWeb: explicitNull,
      kind: "cli",
    };
  }

  if (selectedSource === "web") {
    const webSource = await resolveClaudeWebSource(host, providerConfig);

    if (webSource === null) {
      return explicitNull;
    }

    return {
      kind: "web",
      web: webSource,
    };
  }

  if (hasOauth) {
    return {
      fallbackCli: await resolveClaudeCliSourceHandle(host),
      kind: "oauth",
      oauthPath,
    };
  }

  const cliSource = await resolveClaudeCliSourceHandle(host);

  if (cliSource !== null) {
    return {
      cli: cliSource,
      fallbackWeb: await resolveClaudeWebSource(host, providerConfig),
      kind: "cli",
    };
  }

  const webSource = await resolveClaudeWebSource(host, providerConfig);

  if (webSource === null) {
    return explicitNull;
  }

  return {
    kind: "web",
    web: webSource,
  };
};

export {
  resolveClaudeDefaultTokenFilePath,
  resolveClaudeOauthPath,
  resolveClaudeSource,
  resolveClaudeTokenFilePath,
  resolveClaudeWebSource,
  type ClaudeCliSourceHandle,
  type ClaudeResolvedCliSource,
  type ClaudeResolvedOauthSource,
  type ClaudeResolvedSource,
  type ClaudeResolvedWebSource,
  type ClaudeSourceConfig,
};
