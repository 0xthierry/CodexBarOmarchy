import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import { joinPath } from "@/runtime/providers/shared.ts";

interface CodexResolvedCliSource {
  kind: "cli";
}

interface CodexResolvedOauthSource {
  authPath: string;
  fallbackCli: CodexResolvedCliSource | null;
  kind: "oauth";
}

type CodexResolvedSource = CodexResolvedCliSource | CodexResolvedOauthSource;

const resolveCodexAuthPath = (host: RuntimeHost): string => {
  const configuredCodexHome = host.env["CODEX_HOME"];

  if (typeof configuredCodexHome === "string" && configuredCodexHome !== "") {
    return joinPath(configuredCodexHome, "auth.json");
  }

  return joinPath(host.homeDirectory, ".codex", "auth.json");
};

const resolveCodexCliSource = async (host: RuntimeHost): Promise<CodexResolvedCliSource | null> => {
  if ((await host.commands.which("codex")) === null) {
    return explicitNull;
  }

  return { kind: "cli" };
};

const resolveCodexSource = async (
  host: RuntimeHost,
  selectedSource: "auto" | "cli" | "oauth",
): Promise<CodexResolvedSource | null> => {
  const authPath = resolveCodexAuthPath(host);
  const hasOauth = await host.fileSystem.fileExists(authPath);
  const cliSource = await resolveCodexCliSource(host);

  if (selectedSource === "oauth") {
    if (!hasOauth) {
      return explicitNull;
    }

    return {
      authPath,
      fallbackCli: explicitNull,
      kind: "oauth",
    };
  }

  if (selectedSource === "cli") {
    return cliSource;
  }

  if (hasOauth) {
    return {
      authPath,
      fallbackCli: cliSource,
      kind: "oauth",
    };
  }

  return cliSource;
};

export {
  resolveCodexAuthPath,
  resolveCodexSource,
  type CodexResolvedCliSource,
  type CodexResolvedOauthSource,
  type CodexResolvedSource,
};
