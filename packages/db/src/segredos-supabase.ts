import { createHash } from "node:crypto";
import type { ProviderId } from "@forja/core";

/**
 * Chaves dos provedores de IA nos Secrets das Edge Functions do Supabase (Edge Functions → Secrets),
 * com estes nomes. A Forja roda na Vercel e não enxerga esses Secrets diretamente: quem os lê é a
 * função `forja-chaves` (supabase/functions/forja-chaves), que só responde à chave secreta do
 * projeto que a integração Supabase ↔ Vercel cadastrou nos apps.
 */
export const NOMES_NOS_SECRETS: Record<ProviderId, string[]> = {
  anthropic: ["CLAUDE_KEY", "ANTHROPIC_API_KEY"],
  openai: ["OPENAI_KEY", "OPENAI_API_KEY"],
  google: ["GEMINI_API", "GEMINI_API_KEY"],
  xai: ["GROK_API", "XAI_API_KEY"],
};

/** Releitura a cada 2 min: trocar uma chave nos Secrets vale nesse prazo, sem deploy. */
const VALIDADE_MS = 2 * 60_000;
/** Depois de uma falha, tenta de novo logo (uma oscilação não some com as chaves por minutos). */
const VALIDADE_APOS_ERRO_MS = 15_000;

export interface ChaveDoSupabase {
  /** id estável (uuid derivado do nome), gravado como provider_key_id no uso e nas calls. */
  id: string;
  name: string;
  providerId: ProviderId;
  secret: string;
}

let cache: { ate: number; chaves: ChaveDoSupabase[] } | null = null;

/** uuid estável a partir do nome do secret (o mesmo em todas as instâncias). */
function idDoSecret(nome: string) {
  const h = createHash("sha256").update(`supabase-secret:${nome}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function configuracao() {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return base && chave ? { url: `${base.replace(/\/+$/, "")}/functions/v1/forja-chaves`, chave } : null;
}

async function lerSecrets(): Promise<ChaveDoSupabase[]> {
  if (cache && Date.now() < cache.ate) return cache.chaves;
  const cfg = configuracao();
  if (!cfg) {
    cache = { ate: Date.now() + VALIDADE_MS, chaves: [] };
    return [];
  }
  let chaves: ChaveDoSupabase[] = [];
  let validade = VALIDADE_MS;
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.chave}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`forja-chaves respondeu ${r.status}`);
    const corpo = (await r.json()) as { chaves?: Partial<Record<ProviderId, { nome: string; valor: string } | null>> };
    for (const providerId of Object.keys(NOMES_NOS_SECRETS) as ProviderId[]) {
      const c = corpo.chaves?.[providerId];
      if (c?.valor) chaves.push({ id: idDoSecret(c.nome), name: c.nome, providerId, secret: c.valor });
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "não consegui ler as chaves dos Secrets do Supabase", err: String(err) }));
    chaves = cache?.chaves ?? []; // mantém as últimas chaves boas durante uma oscilação
    validade = VALIDADE_APOS_ERRO_MS;
  }
  cache = { ate: Date.now() + validade, chaves };
  return chaves;
}

/** Chave do provedor nos Secrets do Supabase (no máximo uma por provedor). */
export async function chavesDoSupabase(providerId: ProviderId): Promise<ChaveDoSupabase[]> {
  return (await lerSecrets()).filter((c) => c.providerId === providerId);
}

/** A chave com este id (para desligar uma call com a mesma chave que a abriu). */
export async function chaveDoSupabasePorId(id: string): Promise<ChaveDoSupabase | null> {
  return (await lerSecrets()).find((c) => c.id === id) ?? null;
}

/** Só os nomes encontrados (nunca o valor), para o painel do dono. */
export async function nomesNosSecrets(): Promise<{ name: string; providerId: ProviderId }[]> {
  return (await lerSecrets()).map(({ name, providerId }) => ({ name, providerId }));
}
