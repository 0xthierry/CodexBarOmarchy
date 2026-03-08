import { createDefaultConfig } from "../src/core/config/schema.ts";
import type { ProviderRefreshActionResult } from "../src/core/actions/provider-adapter.ts";
import { createRuntimeProviderAdapters } from "../src/runtime/provider-adapters.ts";
import { createRuntimeHost } from "../src/shell/runtime-host.ts";

const providerIds = ["codex", "claude", "gemini"] as const;

type ProviderId = (typeof providerIds)[number];

const fail = (message: string): never => {
  throw new Error(message);
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    fail(message);
  }
};

const parseRequestedProviders = (): ProviderId[] => {
  const args = process.argv.slice(2);
  const providerArg = args.find((value) => value.startsWith("--provider="));

  if (providerArg === undefined) {
    return [...providerIds];
  }

  const rawProviderIds = providerArg
    .slice("--provider=".length)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (rawProviderIds.length === 0) {
    fail("Expected at least one provider in --provider=<codex,claude,gemini>.");
  }

  for (const providerId of rawProviderIds) {
    assert(
      providerIds.includes(providerId as ProviderId),
      `Unknown provider "${providerId}". Expected one of: ${providerIds.join(", ")}.`,
    );
  }

  return rawProviderIds as ProviderId[];
};

const assertMetricShape = (
  providerId: ProviderId,
  metrics: { detail: string | null; label: string; value: string }[],
): void => {
  assert(metrics.length > 0, `${providerId}: expected at least one metric.`);

  for (const metric of metrics) {
    assert(metric.label.trim() !== "", `${providerId}: metric label must not be empty.`);
    assert(metric.value.trim() !== "", `${providerId}: metric value must not be empty.`);
    assert(
      metric.detail === null || metric.detail.trim() !== "",
      `${providerId}: metric detail must be null or a non-empty string.`,
    );
  }
};

const assertCodexResult = (
  result: ProviderRefreshActionResult<"codex">,
): void => {
  assert(result.status === "success", `codex: expected success, got ${result.status}: ${result.message}`);
  assert(result.snapshot !== null, "codex: expected snapshot.");

  const snapshot = result.snapshot;
  const metricLabels = new Set(snapshot.metrics.map((metric) => metric.label));

  assert(snapshot.sourceLabel === "oauth" || snapshot.sourceLabel === "cli", "codex: unexpected source.");
  assert(snapshot.state === "ready", "codex: snapshot state must be ready.");
  assert(
    snapshot.version === null || snapshot.version.trim() !== "",
    "codex: version must be null or a non-empty string.",
  );
  assertMetricShape("codex", snapshot.metrics);
  assert(
    metricLabels.has("Session") || metricLabels.has("Weekly") || metricLabels.has("Credits"),
    "codex: expected at least one Codex usage metric.",
  );
};

const assertClaudeResult = (
  result: ProviderRefreshActionResult<"claude">,
): void => {
  assert(result.status === "success", `claude: expected success, got ${result.status}: ${result.message}`);
  assert(result.snapshot !== null, "claude: expected snapshot.");

  const snapshot = result.snapshot;
  const metricLabels = new Set(snapshot.metrics.map((metric) => metric.label));

  assert(
    snapshot.sourceLabel === "oauth" ||
      snapshot.sourceLabel === "cli" ||
      snapshot.sourceLabel === "web" ||
      snapshot.sourceLabel === "local",
    `claude: unexpected source "${snapshot.sourceLabel ?? "null"}".`,
  );
  assert(snapshot.state === "ready", "claude: snapshot state must be ready.");
  assertMetricShape("claude", snapshot.metrics);

  if (snapshot.sourceLabel === "local") {
    assert(
      metricLabels.has("Tokens") ||
        metricLabels.has("Messages") ||
        metricLabels.has("Sessions") ||
        metricLabels.has("Tools"),
      "claude: local fallback did not expose local stats metrics.",
    );

    return;
  }

  assert(
    metricLabels.has("Session") || metricLabels.has("Weekly") || metricLabels.has("Sonnet"),
    "claude: expected Claude usage window metrics.",
  );
};

const assertGeminiResult = (
  result: ProviderRefreshActionResult<"gemini">,
): void => {
  assert(result.status === "success", `gemini: expected success, got ${result.status}: ${result.message}`);
  assert(result.snapshot !== null, "gemini: expected snapshot.");

  const snapshot = result.snapshot;
  const metricLabels = snapshot.metrics.map((metric) => metric.label);
  const uniqueMetricLabels = new Set(metricLabels);

  assert(snapshot.sourceLabel === "api", `gemini: unexpected source "${snapshot.sourceLabel ?? "null"}".`);
  assert(snapshot.state === "ready", "gemini: snapshot state must be ready.");
  assertMetricShape("gemini", snapshot.metrics);
  assert(metricLabels.length === uniqueMetricLabels.size, "gemini: duplicate quota metrics detected.");

  for (const label of uniqueMetricLabels) {
    assert(label === "Pro" || label === "Flash", `gemini: unexpected metric label "${label}".`);
  }
};

const printResult = (
  providerId: ProviderId,
  result: ProviderRefreshActionResult<ProviderId>,
): void => {
  console.log(`\n=== ${providerId} ===`);
  console.log(`status: ${result.status}`);
  console.log(`message: ${result.message}`);

  if (result.snapshot === null) {
    console.log("snapshot: null");
    return;
  }

  console.log(`source: ${result.snapshot.sourceLabel ?? "null"}`);
  console.log(`account: ${result.snapshot.accountEmail ?? "null"}`);
  console.log(`plan: ${result.snapshot.planLabel ?? "null"}`);
  console.log(`updatedAt: ${result.snapshot.updatedAt ?? "null"}`);

  for (const metric of result.snapshot.metrics) {
    console.log(
      `metric: ${metric.label}=${metric.value}${metric.detail === null ? "" : ` (${metric.detail})`}`,
    );
  }
};

const main = async (): Promise<void> => {
  const selectedProviderIds = parseRequestedProviders();
  const host = createRuntimeHost();
  const providerAdapters = createRuntimeProviderAdapters(host);
  const config = createDefaultConfig();

  for (const providerId of selectedProviderIds) {
    const result = await providerAdapters[providerId].refresh({
      config,
      providerConfig: config.providers[providerId],
    });

    printResult(providerId, result);

    if (providerId === "codex") {
      assertCodexResult(result);
      continue;
    }

    if (providerId === "claude") {
      assertClaudeResult(result);
      continue;
    }

    assertGeminiResult(result);
  }

  console.log("\nhost integration passed");
};

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`\nhost integration failed: ${message}`);
  process.exit(1);
});
