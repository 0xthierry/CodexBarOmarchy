import { describe, expect, test } from "bun:test";

import projectName from "./index.ts";

describe("toolchain smoke test", () => {
  test("exports the project name", () => {
    expect(projectName).toBe("codex-bar-omarchy");
  });
});
