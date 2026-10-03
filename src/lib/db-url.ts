/**
 * Finds the Postgres connection string. Hosting integrations name it differently
 * (Neon on Vercel may create DATABASE_URL, POSTGRES_URL or <PREFIX>_URL), so any
 * variable holding a postgres:// URL is accepted. Keep in sync with scripts/migrate.mjs.
 */
export function resolveDatabaseUrl(source: Record<string, string | undefined> = process.env, kind: "pooled" | "direct" = "pooled"): string | undefined {
  const isPg = (v: string | undefined): v is string => !!v && /^postgres(?:ql)?:\/\//i.test(v);
  const direct = (name: string) => /UNPOOLED|NON_POOLING|DIRECT/i.test(name);
  if (kind === "pooled" && isPg(source.DATABASE_URL)) return source.DATABASE_URL;
  const names = Object.keys(source)
    .filter((n) => isPg(source[n]))
    .sort((a, b) => score(b) - score(a));
  function score(n: string) {
    let s = 0;
    if (kind === "direct" ? direct(n) : !direct(n)) s += 10;
    if (/^DATABASE_URL/.test(n)) s += 5;
    if (/^POSTGRES_URL/.test(n)) s += 3;
    if (/_URL(?:_|$)/.test(n)) s += 1;
    return s;
  }
  return names.length ? source[names[0]!] : undefined;
}

/** The site's public origin: APP_URL, or on Vercel the production domain Vercel provides. */
export function resolveAppUrl(source: Record<string, string | undefined> = process.env): string {
  if (source.APP_URL) return source.APP_URL;
  if (source.VERCEL_PROJECT_PRODUCTION_URL) return `https://${source.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "";
}
