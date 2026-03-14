import { explicitNull } from "@/core/providers/shared.ts";
import { isRecord, readString } from "@/runtime/providers/collection/io.ts";

const decodeBase64Url = (value: string): string | null => {
  const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
  const requiredPadding = (4 - (normalizedValue.length % 4)) % 4;

  try {
    return atob(`${normalizedValue}${"=".repeat(requiredPadding)}`);
  } catch {
    return explicitNull;
  }
};

const decodeJwtPayloadRecord = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1];

  if (typeof payload !== "string" || payload === "") {
    return explicitNull;
  }

  const decodedPayload = decodeBase64Url(payload);

  if (decodedPayload === null) {
    return explicitNull;
  }

  try {
    const parsedValue: unknown = JSON.parse(decodedPayload);

    return isRecord(parsedValue) ? parsedValue : explicitNull;
  } catch {
    return explicitNull;
  }
};

const readJwtStringClaim = (
  record: Record<string, unknown>,
  tokenKey: string,
  claimKey: string,
): string | null => {
  const token = readString(record, tokenKey);

  if (token === null) {
    return explicitNull;
  }

  const payload = decodeJwtPayloadRecord(token);

  if (payload === null) {
    return explicitNull;
  }

  return readString(payload, claimKey);
};

const readJwtEmail = (record: Record<string, unknown>, key: string): string | null =>
  readJwtStringClaim(record, key, "email");

export { decodeJwtPayloadRecord, readJwtEmail, readJwtStringClaim };
