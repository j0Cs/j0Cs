import pg from "pg";

export type ConnectorType = "github" | "vercel" | "supabase" | "postgres" | "netlify" | "railway";

export interface ConnectorDefinition {
  type: ConnectorType;
  name: string;
  description: string;
  credentialLabel: string;
  credentialHint: string;
  available: boolean;
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    type: "github",
    name: "GitHub",
    description: "Repositórios, branches e pull requests criados pelos agentes.",
    credentialLabel: "Token de acesso (fine-grained)",
    credentialHint: "GitHub → Settings → Developer settings → Fine-grained tokens. Na Sprint 3 vira GitHub App (1 clique).",
    available: true,
  },
  {
    type: "vercel",
    name: "Vercel",
    description: "Deploy de previews e produção dos sistemas criados.",
    credentialLabel: "Token da Vercel",
    credentialHint: "vercel.com → Account Settings → Tokens.",
    available: true,
  },
  {
    type: "supabase",
    name: "Supabase",
    description: "Banco Postgres, autenticação e storage dos seus projetos.",
    credentialLabel: "Access token (Management API)",
    credentialHint: "supabase.com/dashboard/account/tokens.",
    available: true,
  },
  {
    type: "postgres",
    name: "PostgreSQL",
    description: "Qualquer banco Postgres acessível pela internet.",
    credentialLabel: "Connection string",
    credentialHint: "postgres://usuario:senha@host:5432/banco — prefira um usuário só-leitura.",
    available: true,
  },
  {
    type: "netlify",
    name: "Netlify",
    description: "Deploy alternativo à Vercel.",
    credentialLabel: "Token",
    credentialHint: "",
    available: false,
  },
  {
    type: "railway",
    name: "Railway",
    description: "Backends e workers de longa duração.",
    credentialLabel: "Token",
    credentialHint: "",
    available: false,
  },
];

export interface VerifyResult {
  ok: boolean;
  account?: string;
  error?: string;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$|169\.254\.)/i;

/** Testa a credencial no serviço real antes de salvar. */
export async function verifyConnector(type: ConnectorType, credential: string): Promise<VerifyResult> {
  try {
    switch (type) {
      case "github": {
        const res = await fetch("https://api.github.com/user", {
          headers: { authorization: `Bearer ${credential}`, accept: "application/vnd.github+json" },
        });
        if (!res.ok) return { ok: false, error: `GitHub recusou o token (${res.status}).` };
        const body = (await res.json()) as { login: string };
        return { ok: true, account: body.login };
      }
      case "vercel": {
        const res = await fetch("https://api.vercel.com/v2/user", { headers: { authorization: `Bearer ${credential}` } });
        if (!res.ok) return { ok: false, error: `Vercel recusou o token (${res.status}).` };
        const body = (await res.json()) as { user?: { username?: string; email?: string } };
        return { ok: true, account: body.user?.username ?? body.user?.email };
      }
      case "supabase": {
        const res = await fetch("https://api.supabase.com/v1/projects", { headers: { authorization: `Bearer ${credential}` } });
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
        const { rows } = await client.query<{ db: string }>("select current_database() as db");
        await client.end();
        return { ok: true, account: `${url.hostname}/${rows[0]?.db ?? ""}` };
      }
      default:
        return { ok: false, error: "Conector ainda não disponível." };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Falha ao conectar." };
  }
}
