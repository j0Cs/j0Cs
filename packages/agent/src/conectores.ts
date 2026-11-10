/**
 * Catálogo de conectores e a verificação de cada credencial no serviço real (uma leitura barata que
 * devolve o nome da conta) antes de guardar cifrado. Endereços conferidos em 09/11/2026: todos
 * respondem 401/400 sem credencial. "uso" diz com honestidade o que a Forja faz com cada um hoje.
 */

export type CategoriaDeConector = "codigo" | "hospedagem" | "banco" | "gasto_ia";

export interface DefinicaoDeConector {
  type: string;
  name: string;
  categoria: CategoriaDeConector;
  description: string;
  /** O que a Forja faz com ele hoje. */
  uso: string;
  credentialLabel: string;
  credentialHint: string;
  available: boolean;
  /** Conectado em outra tela (sem formulário de token aqui). */
  href?: string;
}

export const CATEGORIAS_DE_CONECTOR: Record<CategoriaDeConector, { titulo: string; descricao: string }> = {
  codigo: { titulo: "Código", descricao: "Onde ficam os repositórios." },
  hospedagem: { titulo: "Hospedagem e deploy", descricao: "Onde os sistemas vão ao ar." },
  banco: { titulo: "Banco de dados", descricao: "Onde ficam os dados dos sistemas." },
  gasto_ia: { titulo: "Gasto com APIs de IA", descricao: "Chaves de administração para ver o gasto real da sua organização nas APIs." },
};

const VERIFICADO = "Por enquanto a Forja testa e guarda a conexão; o agente passa a usar este serviço nas próximas versões.";

export const CONECTORES: DefinicaoDeConector[] = [
  // código
  { type: "github", name: "GitHub", categoria: "codigo", description: "Repositórios e pull requests do agente.", uso: "Leitura do repositório, auditoria e PRs do agente (pelo app Forja Agentes).", credentialLabel: "", credentialHint: "", available: true, href: "/agente" },
  { type: "gitlab", name: "GitLab", categoria: "codigo", description: "GitLab.com ou o seu GitLab próprio.", uso: VERIFICADO, credentialLabel: "Personal access token", credentialHint: "GitLab → Preferences → Access tokens (escopos read_api e read_repository; api para abrir merge requests). GitLab próprio: cole o endereço, um espaço e o token.", available: true },
  { type: "bitbucket", name: "Bitbucket", categoria: "codigo", description: "Repositórios do Bitbucket Cloud.", uso: VERIFICADO, credentialLabel: "E-mail e API token", credentialHint: "Atlassian → Account settings → Security → API tokens (escopos de leitura de repositório). Cole no formato e-mail:token.", available: true },
  { type: "azure_devops", name: "Azure DevOps", categoria: "codigo", description: "Repos do Azure DevOps.", uso: VERIFICADO, credentialLabel: "Personal access token", credentialHint: "dev.azure.com → User settings → Personal access tokens (Code: Read).", available: true },
  // hospedagem
  { type: "vercel", name: "Vercel", categoria: "hospedagem", description: "Preview de cada pull request do agente, com o link na conversa.", uso: "Cria o projeto a partir do repositório e publica o preview de cada PR do agente.", credentialLabel: "Token da Vercel", credentialHint: "vercel.com → Account Settings → Tokens → Create (escopo: o time dos seus projetos). Na Vercel, instale também o app do GitHub com acesso aos repositórios.", available: true },
  { type: "netlify", name: "Netlify", categoria: "hospedagem", description: "Sites e funções na Netlify.", uso: VERIFICADO, credentialLabel: "Personal access token", credentialHint: "app.netlify.com → User settings → Applications → Personal access tokens.", available: true },
  { type: "cloudflare", name: "Cloudflare", categoria: "hospedagem", description: "Pages, Workers e DNS.", uso: VERIFICADO, credentialLabel: "API token", credentialHint: "dash.cloudflare.com → My Profile → API Tokens → Create Token (modelo “Edit Cloudflare Workers” ou leitura).", available: true },
  { type: "railway", name: "Railway", categoria: "hospedagem", description: "Serviços, workers e bancos na Railway.", uso: VERIFICADO, credentialLabel: "Account token", credentialHint: "railway.com → Account Settings → Tokens (token da conta, sem escolher time).", available: true },
  { type: "render", name: "Render", categoria: "hospedagem", description: "Web services, workers e cron na Render.", uso: VERIFICADO, credentialLabel: "API key", credentialHint: "dashboard.render.com → Account Settings → API Keys.", available: true },
  { type: "flyio", name: "Fly.io", categoria: "hospedagem", description: "Máquinas e apps na Fly.io.", uso: VERIFICADO, credentialLabel: "Token", credentialHint: "No terminal: fly tokens create org (cole inteiro, começando por FlyV1) ou fly auth token.", available: true },
  // banco
  { type: "supabase", name: "Supabase", categoria: "banco", description: "Cria o banco do projeto e aplica as migrações do agente, depois da sua confirmação.", uso: "Cria projetos e aplica as migrações das tarefas do agente.", credentialLabel: "Access token (Management API)", credentialHint: "supabase.com/dashboard/account/tokens → Generate new token.", available: true },
  { type: "neon", name: "Neon", categoria: "banco", description: "Postgres serverless com branches.", uso: VERIFICADO, credentialLabel: "API key pessoal", credentialHint: "console.neon.tech → Account settings → API keys.", available: true },
  { type: "turso", name: "Turso", categoria: "banco", description: "SQLite distribuído (libSQL).", uso: VERIFICADO, credentialLabel: "Platform API token", credentialHint: "No terminal: turso auth api-tokens mint forja.", available: true },
  { type: "planetscale", name: "PlanetScale", categoria: "banco", description: "MySQL e Postgres gerenciados.", uso: VERIFICADO, credentialLabel: "Service token", credentialHint: "app.planetscale.com → Settings → Service tokens. Cole no formato id:token.", available: true },
  { type: "postgres", name: "PostgreSQL", categoria: "banco", description: "Qualquer banco Postgres acessível pela internet.", uso: "Conexão testada; prefira um usuário só-leitura.", credentialLabel: "Connection string", credentialHint: "postgres://usuario:senha@host:5432/banco — prefira um usuário só-leitura.", available: true },
  { type: "firebase", name: "Firebase", categoria: "banco", description: "Firestore e Auth do Google.", uso: "", credentialLabel: "", credentialHint: "", available: false },
  { type: "mongodb_atlas", name: "MongoDB Atlas", categoria: "banco", description: "MongoDB gerenciado.", uso: "", credentialLabel: "", credentialHint: "", available: false },
  // gasto com APIs
  { type: "anthropic_admin", name: "Anthropic (Claude API)", categoria: "gasto_ia", description: "Gasto diário da sua organização na API do Claude, em Minhas IAs.", uso: "Lê o relatório de custo da sua organização (nunca faz chamadas aos modelos).", credentialLabel: "Admin API key", credentialHint: "console.anthropic.com → Settings → Admin keys (começa com sk-ant-admin). Só leitura de relatórios é usada.", available: true },
  { type: "openai_admin", name: "OpenAI API", categoria: "gasto_ia", description: "Gasto diário da sua organização na API da OpenAI, em Minhas IAs.", uso: "Lê o relatório de custo da sua organização (nunca faz chamadas aos modelos).", credentialLabel: "Admin key", credentialHint: "platform.openai.com → Settings → Organization → Admin keys.", available: true },
];

export interface ResultadoDaVerificacao {
  ok: boolean;
  account?: string;
  error?: string;
  /** Guardado no conector (ex.: o time padrão da Vercel). */
  metadata?: Record<string, unknown>;
}

const HOST_PRIVADO = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$|169\.254\.|.*\.internal$|.*\.local$)/i;
const base = (env: string, padrao: string) => (process.env[env] || padrao).replace(/\/+$/, "");

type Req = { url: string; init?: RequestInit };

async function lerJson(f: typeof fetch, r: Req, servico: string) {
  // sem seguir redirecionamentos: um endereço público não pode levar a verificação para a rede interna
  const res = await f(r.url, { ...r.init, signal: AbortSignal.timeout(15_000), redirect: "manual" });
  if (res.status >= 300 && res.status < 400) throw new Error(`${servico} respondeu com um redirecionamento; use o endereço direto da API.`);
  if (res.status === 401 || res.status === 403) throw new Error(`${servico} recusou a credencial (${res.status}).`);
  if (!res.ok) throw new Error(`${servico} respondeu ${res.status}.`);
  return (await res.json().catch(() => ({}))) as Record<string, unknown> & { [k: string]: unknown };
}

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
const basic = (u: string, s: string) => ({ authorization: `Basic ${Buffer.from(`${u}:${s}`).toString("base64")}` });

/** Testa a credencial no serviço (não serve para github nem postgres, tratados à parte). */
export async function verificarConector(tipo: string, credencial: string, f: typeof fetch = fetch): Promise<ResultadoDaVerificacao> {
  const c = credencial.trim();
  try {
    switch (tipo) {
      case "gitlab": {
        let url = "https://gitlab.com";
        let token = c;
        const m = /^(https:\/\/\S+)\s+(\S+)$/.exec(c);
        if (m) {
          const u = new URL(m[1]!);
          if (u.protocol !== "https:" || (process.env.NODE_ENV === "production" && HOST_PRIVADO.test(u.hostname))) return { ok: false, error: "Use o endereço https público do seu GitLab." };
          url = u.origin;
          token = m[2]!;
        }
        const j = await lerJson(f, { url: `${base("GITLAB_API_BASE", url)}/api/v4/user`, init: { headers: { "PRIVATE-TOKEN": token } } }, "O GitLab");
        return { ok: true, account: String(j.username ?? j.name ?? "conta"), metadata: { baseUrl: url } };
      }
      case "bitbucket": {
        const i = c.indexOf(":");
        if (i < 1) return { ok: false, error: "Use o formato e-mail:token." };
        const j = await lerJson(f, { url: `${base("BITBUCKET_API_BASE", "https://api.bitbucket.org")}/2.0/user`, init: { headers: basic(c.slice(0, i), c.slice(i + 1)) } }, "O Bitbucket");
        return { ok: true, account: String(j.display_name ?? j.nickname ?? j.username ?? "conta") };
      }
      case "azure_devops": {
        const j = await lerJson(f, { url: `${base("AZURE_DEVOPS_API_BASE", "https://app.vssps.visualstudio.com")}/_apis/profile/profiles/me?api-version=7.1`, init: { headers: basic("", c) } }, "O Azure DevOps");
        return { ok: true, account: String(j.displayName ?? j.emailAddress ?? "conta") };
      }
      case "netlify": {
        const j = await lerJson(f, { url: `${base("NETLIFY_API_BASE", "https://api.netlify.com")}/api/v1/user`, init: { headers: bearer(c) } }, "A Netlify");
        return { ok: true, account: String(j.full_name ?? j.email ?? "conta") };
      }
      case "cloudflare": {
        const j = await lerJson(f, { url: `${base("CLOUDFLARE_API_BASE", "https://api.cloudflare.com")}/client/v4/user/tokens/verify`, init: { headers: bearer(c) } }, "A Cloudflare");
        const r = j.result as { status?: string } | undefined;
        if (r?.status !== "active") return { ok: false, error: `O token da Cloudflare não está ativo (${r?.status ?? "?"}).` };
        return { ok: true, account: "token ativo" };
      }
      case "railway": {
        const j = await lerJson(
          f,
          { url: `${base("RAILWAY_API_BASE", "https://backboard.railway.com")}/graphql/v2`, init: { method: "POST", headers: { ...bearer(c), "content-type": "application/json" }, body: JSON.stringify({ query: "{ me { name email } }" }) } },
          "A Railway",
        );
        const me = (j.data as { me?: { name?: string; email?: string } } | undefined)?.me;
        if (!me) return { ok: false, error: "A Railway não reconheceu o token. Use um token da conta (sem escolher time)." };
        return { ok: true, account: String(me.name ?? me.email ?? "conta") };
      }
      case "render": {
        const r = await f(`${base("RENDER_API_BASE", "https://api.render.com")}/v1/owners?limit=1`, { headers: bearer(c), signal: AbortSignal.timeout(15_000), redirect: "manual" });
        if (!r.ok) return { ok: false, error: `A Render recusou a chave (${r.status}).` };
        const j = (await r.json()) as { owner?: { name?: string; email?: string } }[];
        return { ok: true, account: String(j[0]?.owner?.name ?? j[0]?.owner?.email ?? "conta") };
      }
      case "flyio": {
        const auth = /^FlyV1\s/.test(c) ? c : `Bearer ${c}`;
        const j = await lerJson(
          f,
          { url: `${base("FLY_API_BASE", "https://api.fly.io")}/graphql`, init: { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ query: "{ viewer { email } }" }) } },
          "A Fly.io",
        );
        const v = (j.data as { viewer?: { email?: string } } | undefined)?.viewer;
        if (!v) return { ok: false, error: "A Fly.io não reconheceu o token." };
        return { ok: true, account: String(v.email ?? "conta") };
      }
      case "neon": {
        const j = await lerJson(f, { url: `${base("NEON_API_BASE", "https://console.neon.tech")}/api/v2/users/me`, init: { headers: bearer(c) } }, "A Neon");
        return { ok: true, account: String(j.email ?? j.name ?? "conta") };
      }
      case "turso": {
        const j = await lerJson(f, { url: `${base("TURSO_API_BASE", "https://api.turso.tech")}/v1/organizations`, init: { headers: bearer(c) } }, "A Turso");
        const orgs = (Array.isArray(j) ? j : ((j as { organizations?: unknown[] }).organizations ?? [])) as { name?: string; slug?: string }[];
        return { ok: true, account: String(orgs[0]?.name ?? orgs[0]?.slug ?? "conta") };
      }
      case "planetscale": {
        if (!/^[^:\s]+:[^:\s]+$/.test(c)) return { ok: false, error: "Use o formato id:token." };
        const j = await lerJson(f, { url: `${base("PLANETSCALE_API_BASE", "https://api.planetscale.com")}/v1/organizations`, init: { headers: { authorization: c } } }, "A PlanetScale");
        const orgs = (j.data ?? []) as { name?: string }[];
        return { ok: true, account: String(orgs[0]?.name ?? "conta") };
      }
      case "anthropic_admin": {
        if (!c.startsWith("sk-ant-admin")) return { ok: false, error: "Use uma Admin key (começa com sk-ant-admin), não uma chave comum de API." };
        const j = await lerJson(f, { url: `${base("ANTHROPIC_ADMIN_API_BASE", "https://api.anthropic.com")}/v1/organizations/me`, init: { headers: { "x-api-key": c, "anthropic-version": "2023-06-01" } } }, "A Anthropic");
        return { ok: true, account: String(j.name ?? "organização") };
      }
      case "openai_admin": {
        await lerJson(f, { url: `${base("OPENAI_ADMIN_API_BASE", "https://api.openai.com")}/v1/organization/projects?limit=1`, init: { headers: bearer(c) } }, "A OpenAI");
        return { ok: true, account: "organização" };
      }
      default:
        return { ok: false, error: "Conector ainda não disponível." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao conectar." };
  }
}
