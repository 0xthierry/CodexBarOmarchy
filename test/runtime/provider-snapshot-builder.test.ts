import { expect, test } from "bun:test";
import { explicitNull } from "../../src/core/providers/shared.ts";
import {
  createRateWindowMetricInput,
  createUsageSnapshot,
} from "../../src/runtime/providers/collection/snapshot.ts";

test("createUsageSnapshot derives rate windows from numeric metric inputs", () => {
  const usage = createUsageSnapshot(
    [
      createRateWindowMetricInput({
        detail: "2026-03-18T17:26:53.000Z",
        kind: "session",
        label: "Session",
        usedPercent: 63,
      }),
      {
        kind: "credits",
        label: "Credits",
        value: "9.50",
      },
    ],
    explicitNull,
    [],
  );

  expect(usage.windows.session).toEqual({
    detail: "2026-03-18T17:26:53.000Z",
    kind: "session",
    label: "Session",
    value: "63%",
  });
  expect(usage.rateWindows).toEqual([
    {
      label: "Session",
      resetAt: "2026-03-18T17:26:53.000Z",
      usedPercent: 63,
    },
  ]);
  expect(usage.balances.credits).toEqual({
    detail: explicitNull,
    kind: "credits",
    label: "Credits",
    value: "9.50",
  });
});
