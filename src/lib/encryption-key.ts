import { scryptSync } from "node:crypto";

export const MIN_PASSPHRASE_LENGTH = 32;

/**
 * Turns ENCRYPTION_KEY into a 32-byte AES key. Accepts either a base64-encoded
 * 32-byte key or a long random passphrase (e.g. from a password manager), which
 * is stretched with scrypt. Returns null if the value is unusable.
 */
export function deriveEncryptionKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    const bytes = Buffer.from(value, "base64");
    if (bytes.length === 32) return bytes;
  }
  if (value.length < MIN_PASSPHRASE_LENGTH) return null;
  // Fixed salt: the key must be reproducible from the passphrase alone.
  return scryptSync(value, "preader/encryption-key/v1", 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
