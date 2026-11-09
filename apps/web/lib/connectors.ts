import pg from "pg";

export type ConnectorType = "github" | "vercel" | "supabase" | "postgres" | "netlify" | "railway";

export interface ConnectorDefinition {
  type: ConnectorType;
  name: string;
  description: string;
  credentialLabel: string;
  credentialHint: string;
  available: boolean;
  /** Conectado em outra tela (sem formulário de token aqui). */
  href?: string;
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    type: "github",
    name: "GitHub",
    description: "Repositórios e pull requests do agente. A conexão é pelo app Forja Agentes, em Agente.",
    credentialLabel: "",
    credentialHint: "",
    available: true,
    href: "/agente",
  },
  {
    type: "vercel",
    name: "Vercel",
    description: "Preview de cada pull request do agente, com o link na conversa. O projeto é criado sozinho a partir do repositório.",
    credentialLabel: "Token da Vercel",
    credentialHint: "vercel.com → Account Settings → Tokens → Create (escopo: o time dos seus projetos). Na Vercel, instale também o app do GitHub com acesso aos repositórios.",
    available: true,
  },
  {
    type: "supabase",
    name: "Supabase",
    description: "Cria o banco do projeto e aplica as migrações que o agente escreveu, depois da sua confirmação.",
    credentialLabel: "Access token (Management API)",
    credentialHint: "supabase.com/dashboard/account/tokens → Generate new token.",
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
  /** Guardado no conector (ex.: o time padrão da Vercel). */
  metadata?: Record<string, unknown>;
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
        const res = await fetch(`${(process.env.VERCEL_API_BASE || "https://api.vercel.com").replace(/\/+$/, "")}/v2/user`, { headers: { authorization: `Bearer ${credential}` } });
        if (!res.ok) return { ok: false, error: `Vercel recusou o token (${res.status}).` };
        const body = (await res.json()) as { user?: { username?: string; email?: string; defaultTeamId?: string | null } };
        return { ok: true, account: body.user?.username ?? body.user?.email, metadata: { teamId: body.user?.defaultTeamId ?? null } };
      }
      case "supabase": {
        const res = await fetch(`${(process.env.SUPABASE_API_BASE || "https://api.supabase.com").replace(/\/+$/, "")}/v1/projects`, { headers: { authorization: `Bearer ${credential}` } });
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
