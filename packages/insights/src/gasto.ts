/**
 * Gasto real nas APIs de IA, lido com as chaves de administração que o cliente conectou em Conectores
 * (anthropic_admin, openai_admin). Só relatórios de custo: nenhuma chamada a modelo. O resultado fica
 * uma hora no metadata do conector, para não consultar o provedor a cada abertura da página.
 *
 * Anthropic: GET /v1/organizations/cost_report (buckets diários, valores em centavos como texto decimal).
 * OpenAI:   GET /v1/organization/costs (buckets diários, amount.value em dólares).
 */
import { decryptSecret } from "@forja/core/server";
import { and, eq, inArray, schema, type Db } from "@forja/db";

export type ProvedorDeGasto = "anthropic_admin" | "openai_admin";

export const PROVEDORES_DE_GASTO: Record<ProvedorDeGasto, string> = {
  anthropic_admin: "Anthropic (Claude API)",
  openai_admin: "OpenAI API",
};

export interface GastoPorDia {
  /** AAAA-MM-DD (UTC, como os provedores agrupam). */
  dia: string;
  usdMicros: number;
}

export interface GastoDaApi {
  conectorId: string;
  provedor: ProvedorDeGasto;
  nome: string;
  totalUsdMicros: number;
  dias: GastoPorDia[];
  atualizadoEm: string;
  erro: string | null;
}

const UMA_HORA = 3_600_000;
const base = (env: string, padrao: string) => (process.env[env] || padrao).replace(/\/+$/, "");
const diaUtc = (d: Date) => d.toISOString().slice(0, 10);

async function pedir(f: typeof fetch, url: string, headers: Record<string, string>) {
  const res = await f(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401 || res.status === 403) throw new Error(`a chave foi recusada (${res.status}); gere outra e conecte de novo`);
  if (!res.ok) throw new Error(`o provedor respondeu ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function somar(mapa: Map<string, number>, dia: string, micros: number) {
  if (!Number.isFinite(micros) || micros === 0) return;
  mapa.set(dia, (mapa.get(dia) ?? 0) + micros);
}

/** Custo diário na API do Claude. amount vem em centavos, como texto decimal. */
export async function gastoAnthropic(chave: string, dias: number, agora: Date, f: typeof fetch = fetch): Promise<GastoPorDia[]> {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - dias + 1));
  const fim = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + 1));
  const mapa = new Map<string, number>();
  let pagina: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ starting_at: inicio.toISOString(), ending_at: fim.toISOString(), bucket_width: "1d", limit: "31" });
    if (pagina) q.set("page", pagina);
    const j = await pedir(f, `${base("ANTHROPIC_ADMIN_API_BASE", "https://api.anthropic.com")}/v1/organizations/cost_report?${q}`, {
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    });
    for (const b of (j.data ?? []) as { starting_at?: string; results?: { amount?: string | number; currency?: string }[] }[]) {
      const dia = String(b.starting_at ?? "").slice(0, 10);
      if (!dia) continue;
      for (const r of b.results ?? []) {
        if (r.currency && r.currency.toUpperCase() !== "USD") continue;
        somar(mapa, dia, Math.round(Number(r.amount ?? 0) * 10_000)); // centavos → micro-dólares
      }
    }
    if (!j.has_more || !j.next_page) break;
    pagina = String(j.next_page);
  }
  return [...mapa].map(([dia, usdMicros]) => ({ dia, usdMicros })).sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Custo diário na API da OpenAI. amount.value vem em dólares. */
export async function gastoOpenAI(chave: string, dias: number, agora: Date, f: typeof fetch = fetch): Promise<GastoPorDia[]> {
  const inicio = Math.floor(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - dias + 1) / 1000);
  const mapa = new Map<string, number>();
  let pagina: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ start_time: String(inicio), bucket_width: "1d", limit: String(Math.min(180, dias + 1)) });
    if (pagina) q.set("page", pagina);
    const j = await pedir(f, `${base("OPENAI_ADMIN_API_BASE", "https://api.openai.com")}/v1/organization/costs?${q}`, { authorization: `Bearer ${chave}` });
    for (const b of (j.data ?? []) as { start_time?: number; results?: { amount?: { value?: number | string; currency?: string } }[] }[]) {
      if (!b.start_time) continue;
      const dia = diaUtc(new Date(b.start_time * 1000));
      for (const r of b.results ?? []) {
        if (r.amount?.currency && r.amount.currency.toLowerCase() !== "usd") continue;
        somar(mapa, dia, Math.round(Number(r.amount?.value ?? 0) * 1e6));
      }
    }
    if (!j.has_more || !j.next_page) break;
    pagina = String(j.next_page);
  }
  return [...mapa].map(([dia, usdMicros]) => ({ dia, usdMicros })).sort((a, b) => a.dia.localeCompare(b.dia));
}

/**
 * Gasto dos últimos `dias` em cada chave de administração conectada pela organização. Usa o valor
 * guardado se tiver menos de uma hora; um erro do provedor não derruba a página, vira `erro`.
 */
export async function gastoDasApis(db: Db, orgId: string, opts: { dias?: number; agora?: Date; f?: typeof fetch; forcar?: boolean } = {}): Promise<GastoDaApi[]> {
  const dias = opts.dias ?? 30;
  const agora = opts.agora ?? new Date();
  const conectores = await db
    .select()
    .from(schema.connectors)
    .where(and(eq(schema.connectors.orgId, orgId), inArray(schema.connectors.type, Object.keys(PROVEDORES_DE_GASTO))));

  return Promise.all(
    conectores.map(async (c): Promise<GastoDaApi> => {
      const provedor = c.type as ProvedorDeGasto;
      const guardado = c.metadata.gasto as Omit<GastoDaApi, "conectorId" | "provedor" | "nome"> | undefined;
      if (!opts.forcar && guardado?.atualizadoEm && agora.getTime() - new Date(guardado.atualizadoEm).getTime() < UMA_HORA) {
        return { conectorId: c.id, provedor, nome: c.name, ...guardado };
      }
      let lista: GastoPorDia[] = guardado?.dias ?? [];
      let erro: string | null = null;
      try {
        const chave = decryptSecret(c.encryptedCredentials);
        lista = provedor === "anthropic_admin" ? await gastoAnthropic(chave, dias, agora, opts.f) : await gastoOpenAI(chave, dias, agora, opts.f);
      } catch (e) {
        erro = e instanceof Error ? e.message : "falha ao ler o relatório";
      }
      const corte = diaUtc(new Date(agora.getTime() - (dias - 1) * 86_400_000));
      lista = lista.filter((d) => d.dia >= corte);
      const novo = { totalUsdMicros: lista.reduce((s, d) => s + d.usdMicros, 0), dias: lista, atualizadoEm: agora.toISOString(), erro };
      await db
        .update(schema.connectors)
        .set({ metadata: { ...c.metadata, gasto: novo } })
        .where(eq(schema.connectors.id, c.id));
      return { conectorId: c.id, provedor, nome: c.name, ...novo };
    }),
  );
}
