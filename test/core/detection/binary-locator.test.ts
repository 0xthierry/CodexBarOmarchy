import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";
import { createBinaryLocator } from "@/core/detection/binary-locator.ts";

const executableMode = 0o755;

test("finds installed binaries from PATH with executable permissions", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "omarchy-binary-locator-"));
  const binaryPath = join(temporaryDirectory, "codex");
  const originalPath = process.env["PATH"];

  await writeFile(binaryPath, "#!/bin/sh\nexit 0\n", {
    encoding: "utf8",
    mode: executableMode,
  });
  process.env["PATH"] = temporaryDirectory;

  try {
    const binaryLocator = createBinaryLocator();

    expect(binaryLocator.findBinary("codex")).toBe(binaryPath);
    expect(binaryLocator.isInstalled("codex")).toBe(true);
    expect(binaryLocator.findBinary("claude")).toBeNull();
  } finally {
    process.env["PATH"] = originalPath;
  }
});
