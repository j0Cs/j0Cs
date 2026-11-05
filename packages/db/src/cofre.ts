import type { ProviderId } from "@forja/core";
import { sql } from "drizzle-orm";
import type { Db } from "./client";

/**
 * Chaves dos provedores guardadas no Vault da Supabase (Database → Vault), com estes nomes.
 * O app conecta como `postgres` e lê `vault.decrypted_secrets`: a chave nunca passa pela tela
 * nem pelo repositório. Vale o primeiro nome que existir; as chaves do painel (Chaves de API)
 * continuam valendo e têm prioridade (rodízio, prioridade, desativar).
 */
export const NOMES_NO_COFRE: Record<ProviderId, string[]> = {
  anthropic: ["CLAUDE_KEY", "ANTHROPIC_API_KEY"],
  openai: ["OPENAI_KEY", "OPENAI_API_KEY"],
  google: ["GEMINI_API", "GEMINI_API_KEY"],
  xai: ["GROK_API", "XAI_API_KEY"],
};

const TODOS = Object.values(NOMES_NO_COFRE).flat();
/** Releitura do Vault a cada minuto: trocar uma chave lá vale em até 1 min, sem deploy. */
const VALIDADE_MS = 60_000;

export interface ChaveDoCofre {
  /** id do segredo no Vault (uuid), gravado como provider_key_id no uso e nas calls. */
  id: string;
  name: string;
  secret: string;
}

/** Depois de uma falha de leitura, tenta de novo logo (uma oscilação do banco não some com as chaves por 1 min). */
const VALIDADE_APOS_ERRO_MS = 10_000;

let cache: { ate: number; chaves: ChaveDoCofre[] } | null = null;

async function lerCofre(db: Db): Promise<ChaveDoCofre[]> {
  if (cache && Date.now() < cache.ate) return cache.chaves;
  let chaves: ChaveDoCofre[] = [];
  let validade = VALIDADE_MS;
  try {
    const nomes = sql.join(
      TODOS.map((n) => sql`${n}`),
      sql`, `,
    );
    const r = await db.execute<{ id: string; name: string; secret: string | null }>(
      sql`select id::text as id, name, decrypted_secret as secret from vault.decrypted_secrets where name in (${nomes})`,
    );
    chaves = r.rows
      .map((row) => ({ id: row.id, name: row.name, secret: (row.secret ?? "").trim() }))
      .filter((c) => c.secret.length > 0);
  } catch {
    // sem Vault (Postgres local) ou sem permissão: segue só com as chaves do painel
    validade = VALIDADE_APOS_ERRO_MS;
  }
  cache = { ate: Date.now() + validade, chaves };
  return chaves;
}

/** Chaves do Vault para um provedor, na ordem dos nomes aceitos. */
export async function chavesDoCofre(db: Db, providerId: ProviderId): Promise<ChaveDoCofre[]> {
  const chaves = await lerCofre(db);
  return NOMES_NO_COFRE[providerId].flatMap((nome) => chaves.filter((c) => c.name === nome));
}

/** A chave do Vault com este id (para desligar uma call com a mesma chave que a abriu). */
export async function chaveDoCofrePorId(db: Db, id: string): Promise<ChaveDoCofre | null> {
  return (await lerCofre(db)).find((c) => c.id === id) ?? null;
}

/** Só os nomes e datas (nunca o valor), para o painel do dono mostrar o que está no Vault. */
export async function nomesNoCofre(db: Db): Promise<{ id: string; name: string; providerId: ProviderId; updatedAt: Date | null }[]> {
  try {
    const nomes = sql.join(
      TODOS.map((n) => sql`${n}`),
      sql`, `,
    );
    const r = await db.execute<{ id: string; name: string; updated_at: string | null }>(
      sql`select id::text as id, name, updated_at::text as updated_at from vault.secrets where name in (${nomes}) order by name`,
    );
    return r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      providerId: (Object.keys(NOMES_NO_COFRE) as ProviderId[]).find((p) => NOMES_NO_COFRE[p].includes(row.name))!,
      updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    }));
  } catch {
    return [];
  }
}
