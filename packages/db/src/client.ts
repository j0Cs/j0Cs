import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __forjaDb?: Db; __forjaPool?: pg.Pool };

/**
 * SSL do Postgres gerenciado (Supabase):
 * - DATABASE_SSL_CA: certificado da Supabase (PEM, Database Settings → SSL) → verificação completa (recomendado);
 * - DATABASE_SSL=no-verify: criptografa sem validar o certificado (só para destravar um teste);
 * - nada: segue o que a connection string pedir (local sem SSL).
 */
export function sslConfig(env = process.env): pg.PoolConfig["ssl"] {
  if (env.DATABASE_SSL_CA) return { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  if (env.DATABASE_SSL === "no-verify") return { rejectUnauthorized: false };
  return undefined;
}

/**
 * Conexão preguiçosa e única por processo (sobrevive ao hot reload do Next).
 * Na Vercel use a URL do pooler da Supabase em modo transação (porta 6543) e um pool pequeno.
 */
export function getDb(): Db {
  if (!g.__forjaDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não definida (veja .env.example).");
    g.__forjaPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 10_000,
      ssl: sslConfig(),
    });
    g.__forjaDb = drizzle(g.__forjaPool, { schema });
  }
  return g.__forjaDb;
}

export async function closeDb() {
  await g.__forjaPool?.end();
  g.__forjaPool = undefined;
  g.__forjaDb = undefined;
}
