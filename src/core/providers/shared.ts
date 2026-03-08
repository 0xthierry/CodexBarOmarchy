type ProviderId = "claude" | "codex" | "gemini";

interface ProviderMap<ValueType> {
  claude: ValueType;
  codex: ValueType;
  gemini: ValueType;
}

// eslint-disable-next-line unicorn/no-null
const explicitNull = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readArray = (record: Record<string, unknown>, key: string): unknown[] => {
  const value = record[key];

  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

const readBoolean = (record: Record<string, unknown>, key: string, fallback: boolean): boolean => {
  const value = record[key];

  if (typeof value === "boolean") {
    return value;
  }

  return fallback;
};

const readInteger = (record: Record<string, unknown>, key: string, fallback: number): number => {
  const value = record[key];

  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  return fallback;
};

const readNullableString = (
  record: Record<string, unknown>,
  key: string,
  fallback: string | null,
): string | null => {
  const value = record[key];

  if (typeof value === "string") {
    return value;
  }

  if (value === explicitNull) {
    return explicitNull;
  }

  return fallback;
};

const readStringEnum = <EnumValue extends string>(
  record: Record<string, unknown>,
  options: {
    allowedValues: readonly EnumValue[];
    fallback: EnumValue;
    key: string;
  },
): EnumValue => {
  const value = record[options.key];

  if (typeof value === "string") {
    for (const allowedValue of options.allowedValues) {
      if (allowedValue === value) {
        return allowedValue;
      }
    }
  }

  return options.fallback;
};

const createProviderMap = <ValueType>(
  factory: (providerId: ProviderId) => ValueType,
): ProviderMap<ValueType> => ({
  claude: factory("claude"),
  codex: factory("codex"),
  gemini: factory("gemini"),
});

export {
  createProviderMap,
  explicitNull,
  isRecord,
  readArray,
  readBoolean,
  readInteger,
  readNullableString,
  readStringEnum,
  type ProviderMap,
};
