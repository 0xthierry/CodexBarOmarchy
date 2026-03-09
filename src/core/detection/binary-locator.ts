import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { explicitNull } from "@/core/providers/shared.ts";

interface BinaryLocator {
  findBinary: (binaryName: SupportedBinaryName) => string | null;
  isInstalled: (binaryName: SupportedBinaryName) => boolean;
}

type SupportedBinaryName = "claude" | "codex" | "gemini";

const getPathSegments = (): string[] => {
  const configuredPath = process.env["PATH"];

  if (typeof configuredPath !== "string" || configuredPath === "") {
    return [];
  }

  return configuredPath.split(delimiter).filter((segment) => segment !== "");
};

const canExecute = (filePath: string): boolean => {
  try {
    accessSync(filePath, constants.X_OK);

    return true;
  } catch {
    return false;
  }
};

const findBinary = (binaryName: SupportedBinaryName): string | null => {
  for (const directoryPath of getPathSegments()) {
    const binaryPath = join(directoryPath, binaryName);

    if (canExecute(binaryPath)) {
      return binaryPath;
    }
  }

  return explicitNull;
};

const isInstalled = (binaryName: SupportedBinaryName): boolean => findBinary(binaryName) !== null;

const createBinaryLocator = (): BinaryLocator => ({
  findBinary,
  isInstalled,
});

export { createBinaryLocator, type BinaryLocator, type SupportedBinaryName };
