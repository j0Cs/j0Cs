import { CONECTORES, verificarConector, type DefinicaoDeConector } from "@forja/agent";
import pg from "pg";

export type ConnectorDefinition = DefinicaoDeConector;
export const CONNECTORS = CONECTORES;

export interface VerifyResult {
  ok: boolean;
  account?: string;
  error?: string;
  /** Guardado no conector (ex.: o time padrão da Vercel). */
  metadata?: Record<string, unknown>;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$|169\.254\.)/i;

/** Testa a credencial no serviço real antes de salvar. Vercel, Supabase e Postgres ficam aqui; o resto no catálogo do agente. */
export async function verifyConnector(type: string, credential: string): Promise<VerifyResult> {
  try {
    switch (type) {
      case "vercel": {
        const res = await fetch(`${(process.env.VERCEL_API_BASE || "https://api.vercel.com").replace(/\/+$/, "")}/v2/user`, {
          headers: { authorization: `Bearer ${credential}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return { ok: false, error: `Vercel recusou o token (${res.status}).` };
        const body = (await res.json()) as { user?: { username?: string; email?: string; defaultTeamId?: string | null } };
        return { ok: true, account: body.user?.username ?? body.user?.email, metadata: { teamId: body.user?.defaultTeamId ?? null } };
      }
      case "supabase": {
        const res = await fetch(`${(process.env.SUPABASE_API_BASE || "https://api.supabase.com").replace(/\/+$/, "")}/v1/projects`, {
          headers: { authorization: `Bearer ${credential}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return { ok: false, error: `Supabase recusou o token (${res.status}).` };
        const body = (await res.json()) as unknown[];
        return { ok: true, account: `${body.length} projeto(s)` };
      }
      case "postgres": {
        const url = new URL(credential);
        if (process.env.NODE_ENV === "production" && PRIVATE_HOST.test(url.hostname)) {
          return { ok: false, error: "Endereços internos não são permitidos." };
        }
        const client = new pg.Client({ connectionString: credential, connectionTimeoutMillis: 5000 });
        await client.connect();
        try {
          const { rows } = await client.query<{ db: string }>("select current_database() as db");
          return { ok: true, account: `${url.hostname}/${rows[0]?.db ?? ""}` };
        } finally {
          await client.end();
        }
      }
      default:
        return verificarConector(type, credential);
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao conectar." };
  }
}
