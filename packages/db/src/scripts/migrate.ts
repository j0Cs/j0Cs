import { somenteEmProducao } from "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { portaDaUrl, semParametrosSsl, sslConfig, urlDeMigracao } from "../client";

/**
 * Migrações usam conexão direta/sessão (DATABASE_URL_DIRECT, porta 5432 na Supabase):
 * o pooler em modo transação (6543) não é adequado para DDL em transação longa.
 */
somenteEmProducao("migração");

const { url: connectionString, nome } = urlDeMigracao();
if (!connectionString) throw new Error("Defina DATABASE_URL_DIRECT, DATABASE_URL ou conecte a integração Supabase (POSTGRES_URL).");
// A trava abaixo é de sessão: no pooler em modo transação ela vaza entre conexões do servidor.
if (portaDaUrl(connectionString, nome) === "6543") {
  throw new Error(
    "A migração não pode usar o pooler em modo transação (porta 6543). Defina DATABASE_URL_DIRECT " +
      "com a URL do pooler em modo sessão (porta 5432) da Supabase.",
  );
}
console.log(`↳ migrando por ${nome}`);
const pool = new pg.Pool({ connectionString: semParametrosSsl(connectionString), max: 1, ssl: sslConfig(process.env, connectionString) });
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
