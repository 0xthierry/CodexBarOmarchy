import { explicitNull } from "@/core/providers/shared.ts";
import type { RuntimeHost } from "@/runtime/host.ts";

interface JsonFileReadInvalidResult {
  status: "invalid";
}

interface JsonFileReadMissingResult {
  status: "missing";
}

interface JsonFileReadOkResult {
  status: "ok";
  value: unknown;
}

type JsonFileReadResult =
  | JsonFileReadInvalidResult
  | JsonFileReadMissingResult
  | JsonFileReadOkResult;

const joinPath = (...segments: string[]): string => segments.join("/");

const parseJsonText = (value: string): unknown => JSON.parse(value) as unknown;

const readJsonFile = async (host: RuntimeHost, filePath: string): Promise<JsonFileReadResult> => {
  if (!(await host.fileSystem.fileExists(filePath))) {
    return { status: "missing" };
  }

  try {
    const fileContents = await host.fileSystem.readTextFile(filePath);

    return {
      status: "ok",
      value: parseJsonText(fileContents),
    };
  } catch {
    return { status: "invalid" };
  }
};

const writeJsonFile = async (
  host: RuntimeHost,
  filePath: string,
  value: unknown,
): Promise<void> => {
  await host.fileSystem.writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNestedRecord = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null => {
  const value = record[key];

  if (isRecord(value)) {
    return value;
  }

  return explicitNull;
};

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key];

  if (typeof value === "string" && value !== "") {
    return value;
  }

  return explicitNull;
};

const readBoolean = (record: Record<string, unknown>, key: string): boolean | null => {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  return explicitNull;
};

const readArray = (record: Record<string, unknown>, key: string): unknown[] | null => {
  const value = record[key];

  if (Array.isArray(value)) {
    return value;
  }

  return explicitNull;
};

const readNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return explicitNull;
};

const readStringArray = (record: Record<string, unknown>, key: string): string[] | null => {
  const value = readArray(record, key);

  if (value === null) {
    return explicitNull;
  }

  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && entry !== "",
  );

  return strings.length === value.length ? strings : explicitNull;
};

const readFiniteNumber = (record: Record<string, unknown>, key: string): number | null => {
  const numericValue = readNumber(record, key);

  if (numericValue !== null) {
    return numericValue;
  }

  const value = record[key];

  if (typeof value === "string" && value !== "") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return explicitNull;
};

export {
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
  type JsonFileReadResult,
};
