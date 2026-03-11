import { expect, test } from "bun:test";
import { createCipheriv, createHash } from "node:crypto";
import {
  decryptChromiumCookieValue,
  deriveChromiumLinuxKey,
  stripChromiumV24DomainDigest,
} from "../../../src/runtime/browser-cookies/chromium.ts";

const encryptChromiumCookie = (plaintext: Buffer, key: Buffer): Uint8Array => {
  const cipher = createCipheriv("aes-128-cbc", key, Buffer.from(" ".repeat(16), "utf8"));
  return Buffer.concat([Buffer.from("v11", "utf8"), cipher.update(plaintext), cipher.final()]);
};

test("derives the Chromium Linux safe-storage key from the browser secret", () => {
  const key = deriveChromiumLinuxKey("test-secret");

  expect(key.toString("hex")).toBe("d7d4df19d842591632e8dfb427ab3474");
});

test("decrypts a Chromium v11 cookie payload and strips the version-24 domain digest", () => {
  const key = deriveChromiumLinuxKey("test-secret");
  const hostKey = ".chatgpt.com";
  const cookieValue = "session-cookie-value";
  const domainDigest = createHash("sha256").update(hostKey, "utf8").digest();
  const encryptedValue = encryptChromiumCookie(
    Buffer.concat([domainDigest, Buffer.from(cookieValue, "utf8")]),
    key,
  );
  const decryptedValue = decryptChromiumCookieValue(encryptedValue, key);

  expect(decryptedValue).not.toBeNull();

  if (decryptedValue === null) {
    throw new Error("Expected Chromium cookie decryption to succeed.");
  }

  expect(stripChromiumV24DomainDigest(decryptedValue, hostKey).toString("utf8")).toBe(cookieValue);
});
