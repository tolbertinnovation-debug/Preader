// Applies SQL files in db/migrations in lexical order, once each, inside transactions.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
// Prefer a direct (unpooled) connection: advisory locks need a stable session, which
// transaction-mode poolers (e.g. Neon's -pooler endpoint) don't guarantee.
// Mirrors resolveDatabaseUrl() in src/lib/db-url.ts.
function resolveDirectUrl(source) {
  const isPg = (v) => !!v && /^postgres(?:ql)?:\/\//i.test(v);
  const direct = (n) => /UNPOOLED|NON_POOLING|DIRECT/i.test(n);
  const score = (n) =>
    (direct(n) ? 10 : 0) + (/^DATABASE_URL/.test(n) ? 5 : 0) + (/^POSTGRES_URL/.test(n) ? 3 : 0) + (/_URL(?:_|$)/.test(n) ? 1 : 0);
  const names = Object.keys(source).filter((n) => isPg(source[n])).sort((a, b) => score(b) - score(a));
  return names.length ? source[names[0]] : undefined;
}
const url = resolveDirectUrl(process.env);
if (!url) {
  // On Vercel the database is usually connected after the first deploy; don't block that deploy.
  if (process.argv.includes("--skip-if-no-db")) {
    console.warn("No database connection found — skipping migrations. Connect a database and redeploy.");
    process.exit(0);
  }
  console.error("No database connection found: set DATABASE_URL");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(727274)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
  await client.end();
}
