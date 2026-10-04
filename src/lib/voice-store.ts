import "server-only";
import { tryDecrypt } from "./crypto";
import { cleanPinned } from "./text/voice";

/** Decrypts a user's pinned expressions; unreadable data yields an empty list. */
export function readPinned(envelope: string | null | undefined): string[] {
  const raw = tryDecrypt(envelope);
  if (!raw) return [];
  try {
    return cleanPinned(JSON.parse(raw));
  } catch {
    return [];
  }
}
