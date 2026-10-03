import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { deriveEncryptionKey, MIN_PASSPHRASE_LENGTH } from "./encryption-key";
import { env } from "./env";

// Versioned AES-256-GCM envelope: "v1.<iv>.<tag>.<ciphertext>" (base64url parts).
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const derived = deriveEncryptionKey(env.encryptionKey);
  if (!derived) {
    throw new Error(`ENCRYPTION_KEY must be a base64 32-byte key or a random passphrase of at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  cachedKey = derived;
  return derived;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(envelope: string): string {
  const [version, iv, tag, ct] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Like decrypt(), but returns null when data can't be read (e.g. it was saved under a previous key). */
export function tryDecrypt(envelope: string | null | undefined): string | null {
  if (!envelope) return null;
  try {
    return decrypt(envelope);
  } catch {
    return null;
  }
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
