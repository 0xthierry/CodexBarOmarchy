import { explicitNull } from "@/core/providers/shared.ts";

interface BinaryLocator {
  findBinary: (binaryName: SupportedBinaryName) => string | null;
  isInstalled: (binaryName: SupportedBinaryName) => boolean;
}

type SupportedBinaryName = "claude" | "codex" | "gemini";

const findBinary = (binaryName: SupportedBinaryName): string | null => {
  const resolvedBinary = Bun.which(binaryName);

  if (typeof resolvedBinary !== "string") {
    return explicitNull;
  }

  return resolvedBinary;
};

const isInstalled = (binaryName: SupportedBinaryName): boolean => findBinary(binaryName) !== null;

const createBinaryLocator = (): BinaryLocator => ({
  findBinary,
  isInstalled,
});

export { createBinaryLocator, type BinaryLocator, type SupportedBinaryName };
