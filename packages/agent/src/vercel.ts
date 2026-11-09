/**
 * API da Vercel do cliente (token em Conectores). Só o necessário para o preview do PR:
 * achar ou criar o projeto ligado ao repositório e criar o deployment da branch.
 * VERCEL_API_BASE troca o endereço (testes com a Vercel simulada).
 */

export class ErroVercel extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigo?: string,
  ) {
    super(message);
  }
}

export interface ProjetoVercel {
  id: string;
  name: string;
  link?: { type?: string; org?: string; repo?: string } | null;
}

export interface DeploymentVercel {
  id: string;
  url: string;
  readyState: string;
  errorMessage?: string | null;
  inspectorUrl?: string | null;
}

/** Estados em que o preview não muda mais. */
export const PREVIEW_FINAL = new Set(["READY", "ERROR", "CANCELED"]);

/** Framework da Vercel a partir do package.json (null = deixa a Vercel tratar como site estático). */
export function detectarFramework(packageJson: string | null): string | null {
  if (!packageJson) return null;
  let deps: Record<string, unknown> = {};
  try {
    const p = JSON.parse(packageJson) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    deps = { ...p.dependencies, ...p.devDependencies };
  } catch {
    return null;
  }
  const tem = (n: string) => n in deps;
  const temPrefixo = (n: string) => Object.keys(deps).some((d) => d.startsWith(n));
  if (tem("next")) return "nextjs";
  if (tem("@react-router/dev")) return "react-router";
  if (temPrefixo("@remix-run/")) return "remix";
  if (tem("astro")) return "astro";
  if (tem("@sveltejs/kit")) return "sveltekit";
  if (tem("nuxt")) return "nuxtjs";
  if (tem("gatsby")) return "gatsby";
  if (tem("@angular/core")) return "angular";
  if (tem("react-scripts")) return "create-react-app";
  if (tem("vite")) return "vite";
  if (tem("vue")) return "vue";
  return null;
}

/** Nome de projeto aceito pela Vercel: minúsculas, números, ".", "_" e "-" (até 100). */
export function nomeDeProjeto(repo: string) {
  const base = repo
    .split("/")
    .at(-1)!
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{3,}/g, "--")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);
  return base || "projeto-forja";
}

export class VercelApi {
  readonly base: string;
  constructor(
    private readonly token: string,
    private teamId: string | null = null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = (process.env.VERCEL_API_BASE || "https://api.vercel.com").replace(/\/+$/, "");
  }

  get time() {
    return this.teamId;
  }

  private async req<T>(metodo: string, caminho: string, corpo?: unknown, query: Record<string, string> = {}): Promise<T> {
    const q = new URLSearchParams(query);
    if (this.teamId) q.set("teamId", this.teamId);
    const qs = q.toString();
    const r = await this.fetchImpl(`${this.base}${caminho}${qs ? `${caminho.includes("?") ? "&" : "?"}${qs}` : ""}`, {
      method: metodo,
      headers: { authorization: `Bearer ${this.token}`, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
      throw new ErroVercel(r.status, j.error?.message ?? `Vercel respondeu ${r.status}`, j.error?.code);
    }
    return (await r.json()) as T;
  }

  async usuario() {
    const r = await this.req<{ user: { id: string; username?: string; email?: string; defaultTeamId?: string | null } }>("GET", "/v2/user");
    return r.user;
  }

  /** Usa o time padrão da conta quando o conector não guardou um (contas Hobby também são times). */
  async garantirTime() {
    if (this.teamId) return this.teamId;
    const u = await this.usuario();
    this.teamId = u.defaultTeamId ?? null;
    return this.teamId;
  }

  async projeto(idOuNome: string) {
    return this.req<ProjetoVercel>("GET", `/v9/projects/${encodeURIComponent(idOuNome)}`);
  }

  /** Projeto já ligado a este repositório do GitHub, se houver. */
  async projetoDoRepo(fullName: string): Promise<ProjetoVercel | null> {
    const r = await this.req<{ projects: ProjetoVercel[] }>("GET", "/v10/projects", undefined, {
      repoUrl: `https://github.com/${fullName}`,
      limit: "100",
    });
    const alvo = fullName.toLowerCase();
    return r.projects.find((p) => p.link?.type === "github" && `${p.link.org}/${p.link.repo}`.toLowerCase() === alvo) ?? null;
  }

  async criarProjeto(p: { nome: string; repo: string; framework: string | null }) {
    return this.req<ProjetoVercel>("POST", "/v11/projects", {
      name: p.nome,
      framework: p.framework,
      gitRepository: { type: "github", repo: p.repo },
    });
  }

  /** Deployment de preview da branch (sem target = preview). */
  async criarPreview(p: { projeto: ProjetoVercel; repo: string; branch: string; framework: string | null }) {
    const [org, repo] = p.repo.split("/");
    return this.req<DeploymentVercel>(
      "POST",
      "/v13/deployments",
      {
        name: p.projeto.name,
        project: p.projeto.id,
        gitSource: { type: "github", org, repo, ref: p.branch },
        projectSettings: { framework: p.framework },
      },
      { skipAutoDetectionConfirmation: "1" },
    );
  }

  async deployment(id: string) {
    return this.req<DeploymentVercel>("GET", `/v13/deployments/${encodeURIComponent(id)}`);
  }
}
