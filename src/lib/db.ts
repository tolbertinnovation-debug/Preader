import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { env } from "./env";

const globalForDb = globalThis as unknown as { __preaderPool?: Pool };

function pool(): Pool {
  if (!globalForDb.__preaderPool) {
    globalForDb.__preaderPool = new Pool({
      connectionString: env.databaseUrl,
      // Each serverless instance holds its own pool, so keep it small on Vercel.
      max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" } : undefined,
    });
  }
  return globalForDb.__preaderPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
