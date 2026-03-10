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
    accountEmail: "codex@example.com",
    latestError: null,
    metrics: [
      {
        detail: null,
        label: "Session",
        value: "58%",
      },
      {
        detail: null,
        label: "Weekly",
        value: "81%",
      },
    ],
    planLabel: "OAuth",
    sourceLabel: "oauth",
    state: "ready",
    updatedAt: "2026-03-10T12:00:00.000Z",
    version: "1.2.3",
  };

  const snapshot = renderTuiSnapshot(
    createTuiViewModel(
      createAppStoreState(createDefaultConfig(), runtimeStateMap),
      createInitialLocalState(),
    ),
  );

  expect(snapshot).toContain("omarchy-agent-bar");
  expect(snapshot).toContain("usage");
  expect(snapshot).toContain("details");
  expect(snapshot).toContain("config");
  expect(snapshot).toContain("menu");
  expect(snapshot).toContain("Session");
});
