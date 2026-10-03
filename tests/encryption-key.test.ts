import { describe, expect, it } from "vitest";
import { deriveEncryptionKey } from "@/lib/encryption-key";

describe("deriveEncryptionKey", () => {
  it("uses a base64 32-byte key as-is (existing deployments keep working)", () => {
    const raw = Buffer.alloc(32, 7);
    expect(deriveEncryptionKey(raw.toString("base64"))?.equals(raw)).toBe(true);
  });

  it("stretches a long passphrase into a stable 32-byte key", () => {
    const pass = "Xk9#vR2!pLq7@wZ4$mT8^bN3&cH6*jF1";
    const a = deriveEncryptionKey(pass);
    expect(a?.length).toBe(32);
    expect(deriveEncryptionKey(pass)?.equals(a!)).toBe(true);
    expect(deriveEncryptionKey(pass + "x")?.equals(a!)).toBe(false);
  });

  it("rejects missing or short values", () => {
    expect(deriveEncryptionKey(undefined)).toBeNull();
    expect(deriveEncryptionKey("")).toBeNull();
    expect(deriveEncryptionKey("short-password-123")).toBeNull();
  });
});
