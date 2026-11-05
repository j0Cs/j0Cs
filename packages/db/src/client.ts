import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { SUPABASE_ROOT_CA_2021 } from "./supabase-ca";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __forjaDb?: Db; __forjaPool?: pg.Pool };

/**
 * URL do banco no runtime: DATABASE_URL, ou POSTGRES_URL da integração Supabase ↔ Vercel
 * (as duas apontam para o pooler em modo transação, porta 6543).
 */
export function urlDoBanco(env = process.env): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_URL || undefined;
}

const hostDe = (url?: string) => {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
};
/** Banco na Supabase (pooler *.pooler.supabase.com ou conexão direta db.*.supabase.co)? */
export const ehSupabase = (url?: string) => /\.supabase\.(com|co)$/.test(hostDe(url));

/**
 * SSL do Postgres gerenciado (Supabase):
 * - DATABASE_SSL_CA: certificado (PEM, numa linha com \n) → verificação completa;
 * - DATABASE_SSL=no-verify: criptografa sem validar o certificado (só para destravar um teste);
 * - host da Supabase sem nada definido: usa o certificado raiz público da Supabase (verificação completa);
 * - nada: segue o que a connection string pedir (local sem SSL).
 */
export function sslConfig(env = process.env, url?: string): pg.PoolConfig["ssl"] {
  if (env.DATABASE_SSL_CA) return { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  if (env.DATABASE_SSL === "no-verify") return { rejectUnauthorized: false };
  if (ehSupabase(url)) return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  return undefined;
}

/**
 * Com SSL configurado por variável, remove sslmode/sslrootcert/... da URL: no `pg`, os
 * parâmetros da URL sobrescrevem o objeto `ssl` e o certificado da Supabase seria ignorado.
 */
export function semParametrosSsl(connectionString: string, env = process.env): string {
  if (!sslConfig(env, connectionString)) return connectionString;
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    // URL que o parser não entende: o erro do Node traria a URL inteira (com a senha) no log.
    // Devolve como veio; o `pg` trata e omite a senha nas mensagens de erro dele.
    return connectionString;
  }
  for (const p of ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) url.searchParams.delete(p);
  return url.toString();
}

/**
 * Porta da URL do banco sem nunca vazar a senha: se a URL não for válida, o erro do Node incluiria
 * a URL inteira (campo `input`). Lança uma mensagem limpa, sem `cause`.
 */
export function portaDaUrl(connectionString: string, nome: string): string {
  try {
    return new URL(connectionString).port;
  } catch {
    throw new Error(
      `${nome} inválida. Se a senha do banco tem caracteres especiais (/ ? # @ % :), escreva-os codificados ` +
        "(%2F %3F %23 %40 %25 %3A) ou troque por uma senha só com letras e números.",
    );
  }
}

/**
 * URL das migrações: precisa de sessão (a trava pg_advisory_lock é de sessão), nunca o modo transação.
 * 1. DATABASE_URL_DIRECT;
 * 2. integração Supabase: o pooler em modo sessão é o MESMO host na porta 5432 (IPv4, funciona no
 *    build da Vercel; a conexão direta db.*.supabase.co só tem IPv6);
 * 3. POSTGRES_URL_NON_POOLING;
 * 4. a URL do runtime (a migração recusa se for a 6543).
 */
export function urlDeMigracao(env = process.env): { url: string | undefined; nome: string } {
  if (env.DATABASE_URL_DIRECT) return { url: env.DATABASE_URL_DIRECT, nome: "DATABASE_URL_DIRECT" };
  const runtime = urlDoBanco(env);
  const nomeRuntime = env.DATABASE_URL ? "DATABASE_URL" : "POSTGRES_URL";
  if (runtime) {
    try {
      const u = new URL(runtime);
      if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") {
        u.port = "5432";
        for (const p of ["pgbouncer", "workaround", "supa"]) u.searchParams.delete(p);
        return { url: u.toString(), nome: `${nomeRuntime} (pooler em modo sessão, 5432)` };
      }
    } catch {
      // URL inválida: a validação abaixo (portaDaUrl) dá a mensagem limpa
    }
  }
  if (env.POSTGRES_URL_NON_POOLING) return { url: env.POSTGRES_URL_NON_POOLING, nome: "POSTGRES_URL_NON_POOLING" };
  return { url: runtime, nome: nomeRuntime };
}

/**
 * Conexão preguiçosa e única por processo (sobrevive ao hot reload do Next).
 * Na Vercel use a URL do pooler da Supabase em modo transação (porta 6543) e um pool pequeno.
 */
export function getDb(): Db {
  if (!g.__forjaDb) {
    const connectionString = urlDoBanco();
    if (!connectionString) throw new Error("DATABASE_URL (ou POSTGRES_URL da integração Supabase) não definida (veja .env.example).");
    g.__forjaPool = new pg.Pool({
      connectionString: semParametrosSsl(connectionString),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      ssl: sslConfig(process.env, connectionString),
    });
    // Fluid compute: libera conexões ociosas antes de a instância hibernar (sem efeito fora da Vercel).
    attachDatabasePool(g.__forjaPool);
    g.__forjaDb = drizzle(g.__forjaPool, { schema });
  }
  return g.__forjaDb;
}

export async function closeDb() {
  await g.__forjaPool?.end();
  g.__forjaPool = undefined;
  g.__forjaDb = undefined;
}
