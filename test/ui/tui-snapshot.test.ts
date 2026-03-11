import { expect, test } from "bun:test";
import { createDefaultConfig } from "@/core/config/schema.ts";
import { createAppStoreState } from "@/core/store/state.ts";
import { createDefaultProviderRuntimeStateMap } from "@/core/store/runtime-state.ts";
import { createInitialLocalState } from "@/ui/tui/controller.ts";
import { createTuiViewModel } from "@/ui/tui/presenter.ts";
import { renderTuiSnapshot } from "@/ui/tui/snapshot.ts";

test("renders a deterministic plain-text snapshot for non-tty output", () => {
  const runtimeStateMap = createDefaultProviderRuntimeStateMap();

  runtimeStateMap.codex.snapshot = {
    identity: {
      accountEmail: "codex@example.com",
      planLabel: "OAuth",
    },
    latestError: null,
    providerDetails: null,
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
          label: "Session",
          resetAt: null,
          usedPercent: 58,
        },
        {
          label: "Weekly",
          resetAt: null,
          usedPercent: 81,
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
        weekly: {
          detail: null,
          label: "Weekly",
          value: "81%",
        },
      },
    },
    version: "1.2.3",
  };

  const snapshot = renderTuiSnapshot(
    createTuiViewModel(
      createAppStoreState(createDefaultConfig(), runtimeStateMap),
      createInitialLocalState(),
    ),
  );

  expect(snapshot).toContain("agent-stats");
  expect(snapshot).toContain("usage");
  expect(snapshot).toContain("details");
  expect(snapshot).toContain("config");
  expect(snapshot).toContain("menu");
  expect(snapshot).toContain("Session");
  expect(snapshot).not.toContain("Raw quotas");
  expect(snapshot).not.toContain("Provider health:");
});
