import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const isJsonlPath = (filePath: string): boolean => filePath.toLowerCase().endsWith(".jsonl");

const enumerateJsonlFiles = async (rootPaths: readonly string[]): Promise<string[]> => {
  const discoveredFiles: string[] = [];

  for (const rootPath of rootPaths) {
    const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const entryPath = join(rootPath, entry.name);

      if (entry.isDirectory()) {
        discoveredFiles.push(...(await enumerateJsonlFiles([entryPath])));
        continue;
      }

      if (entry.isFile() && isJsonlPath(entryPath)) {
        discoveredFiles.push(entryPath);
      }
    }
  }

  return discoveredFiles.toSorted((left, right) => left.localeCompare(right));
};

const readJsonlRecords = async (filePath: string): Promise<unknown[]> => {
  const fileContents = await readFile(filePath, "utf8").catch(() => "");

  if (fileContents === "") {
    return [];
  }

  const parsedRecords: unknown[] = [];

  for (const rawLine of fileContents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (line === "") {
      continue;
    }

    try {
      parsedRecords.push(JSON.parse(line) as unknown);
    } catch {
      continue;
    }
  }

  return parsedRecords;
};

const dayKeyFromTimestamp = (timestamp: string): string | null => {
  if (!timestamp.includes("T")) {
    return null;
  }

  const parsedDate = new Date(timestamp);

  return Number.isNaN(parsedDate.valueOf()) ? null : parsedDate.toISOString().slice(0, 10);
};

const roundUsd = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export { dayKeyFromTimestamp, enumerateJsonlFiles, readJsonlRecords, roundUsd };
