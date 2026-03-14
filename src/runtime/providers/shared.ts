import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";
import {
  isRecord,
  joinPath,
  parseJsonText,
  readArray,
  readBoolean,
  readFiniteNumber,
  readJsonFile,
  readNestedRecord,
  readString,
  readStringArray,
  writeJsonFile,
} from "@/runtime/providers/collection/io.ts";
import type { JsonFileReadResult } from "@/runtime/providers/collection/io.ts";
import { readJwtEmail } from "@/runtime/providers/collection/jwt.ts";

const readCommandVersion = async (
  host: RuntimeHost,
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<string | null> => {
  if ((await host.commands.which(command)) === null) {
    return explicitNull;
  }

  const commandResult = await host.commands.run(command, args, {
    timeoutMs,
  });

  if (commandResult.exitCode !== 0) {
    return explicitNull;
  }

  const versionToken = commandResult.stdout.match(/([0-9]+(?:\.[0-9]+){1,}[0-9A-Za-z.-]*)/u)?.[1];

  return typeof versionToken === "string" && versionToken !== "" ? versionToken : explicitNull;
};

export {
  createProviderCostSnapshot,
  createProviderQuotaBucketSnapshot,
  createRefreshError,
  createRefreshSuccess,
  createSnapshot,
  createUsageSnapshot,
  formatFractionPercent,
  formatPercent,
  updateProviderDetails,
  type ProviderMetricInput,
} from "@/runtime/providers/collection/snapshot.ts";
export {
  applyRefreshEnrichers,
  runResolvedRefresh,
} from "@/runtime/providers/collection/pipeline.ts";

export {
  isRecord,
  joinPath,
  parseJsonText,
  readArray,
  readBoolean,
  readCommandVersion,
  readFiniteNumber,
  readJsonFile,
  readJwtEmail,
  readNestedRecord,
  readString,
  readStringArray,
  writeJsonFile,
  type JsonFileReadResult,
};
