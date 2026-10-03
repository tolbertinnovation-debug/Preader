import "server-only";
import bcrypt from "bcryptjs";

const COST = 12;
let dummy: Promise<string> | null = null;

export function hashPassword(pw: string) {
  return bcrypt.hash(pw, COST);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) {
    // Spend the same time as a real check so response timing doesn't reveal which emails exist.
    dummy ??= bcrypt.hash("preader-timing-equaliser", COST);
    await bcrypt.compare(pw, await dummy);
    return false;
  }
  return bcrypt.compare(pw, hash);
}
