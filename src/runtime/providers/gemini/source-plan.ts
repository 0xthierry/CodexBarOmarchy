import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  isRecord,
  joinPath,
  readJsonFile,
  readNestedRecord,
  readString,
} from "@/runtime/providers/shared.ts";

interface GeminiResolvedApiSource {
  kind: "api";
  oauthPath: string;
}

type GeminiResolvedSource = GeminiResolvedApiSource;

const resolveGeminiSettingsPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "settings.json");

const resolveGeminiOauthPath = (host: RuntimeHost): string =>
  joinPath(host.homeDirectory, ".gemini", "oauth_creds.json");

const readGeminiAuthType = async (host: RuntimeHost): Promise<string | null> => {
  const settingsPayload = await readJsonFile(host, resolveGeminiSettingsPath(host));

  if (settingsPayload.status !== "ok") {
    return explicitNull;
  }

  const rootRecord = isRecord(settingsPayload.value) ? settingsPayload.value : {};
  const security = readNestedRecord(rootRecord, "security");
  const auth = security ? readNestedRecord(security, "auth") : explicitNull;

  return auth ? readString(auth, "selectedType") : explicitNull;
};

const resolveGeminiSource = async (host: RuntimeHost): Promise<GeminiResolvedSource | null> => {
  const authType = await readGeminiAuthType(host);

  if (authType === null || authType === "api-key" || authType === "vertex-ai") {
    return explicitNull;
  }

  const oauthPath = resolveGeminiOauthPath(host);

  if (!(await host.fileSystem.fileExists(oauthPath))) {
    return explicitNull;
  }

  return {
    kind: "api",
    oauthPath,
  };
};

export {
  readGeminiAuthType,
  resolveGeminiOauthPath,
  resolveGeminiSettingsPath,
  resolveGeminiSource,
  type GeminiResolvedApiSource,
  type GeminiResolvedSource,
};
