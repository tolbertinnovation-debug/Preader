import { DEFAULT_OPTIONS, type RewriteOptions } from "./options";
import { preferencesSchema, type Preferences } from "./validation";

/** Merges stored preferences over defaults, ignoring anything invalid. */
export function resolveOptions(prefs: Preferences | null | undefined): RewriteOptions {
  const parsed = preferencesSchema.safeParse(prefs ?? {});
  return { ...DEFAULT_OPTIONS, ...(parsed.success ? parsed.data : {}) } as RewriteOptions;
}
