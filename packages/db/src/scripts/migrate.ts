import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { sslConfig } from "../client";

/**
 * Migrações usam conexão direta/sessão (DATABASE_URL_DIRECT, porta 5432 na Supabase):
 * o pooler em modo transação (6543) não é adequado para DDL em transação longa.
 */
const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Defina DATABASE_URL_DIRECT ou DATABASE_URL.");
const pool = new pg.Pool({ connectionString, max: 1, ssl: sslConfig() });
const client = await pool.connect();
// Trava: os builds do app do cliente e do painel podem rodar ao mesmo tempo na Vercel.
await client.query("select pg_advisory_lock(7212026)");
try {
  await migrate(drizzle(client), { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
} finally {
  await client.query("select pg_advisory_unlock(7212026)");
  client.release();
}
console.log("✔ migrações aplicadas");

// Toda tabela do schema public precisa de RLS (a Supabase expõe public pela Data API).
const { rows } = await pool.query<{ tablename: string }>(
  "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1",
);
await pool.end();
if (rows.length) {
  console.error(`✘ tabelas sem RLS: ${rows.map((r) => r.tablename).join(", ")}`);
  console.error("  Adicione ALTER TABLE ... ENABLE ROW LEVEL SECURITY numa migração.");
  process.exit(1);
}
console.log("✔ RLS ativo em todas as tabelas do schema public");
