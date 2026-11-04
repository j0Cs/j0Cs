import { attachDatabasePool } from "@vercel/functions";
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
 * Com SSL configurado por variável, remove sslmode/sslrootcert/... da URL: no `pg`, os
 * parâmetros da URL sobrescrevem o objeto `ssl` e o certificado da Supabase seria ignorado.
 */
export function semParametrosSsl(connectionString: string, env = process.env): string {
  if (!sslConfig(env)) return connectionString;
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
 * Conexão preguiçosa e única por processo (sobrevive ao hot reload do Next).
 * Na Vercel use a URL do pooler da Supabase em modo transação (porta 6543) e um pool pequeno.
 */
export function getDb(): Db {
  if (!g.__forjaDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não definida (veja .env.example).");
    g.__forjaPool = new pg.Pool({
      connectionString: semParametrosSsl(connectionString),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      ssl: sslConfig(),
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
