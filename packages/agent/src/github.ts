import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/**
 * Cliente mínimo do GitHub App "Forja Agentes" (fetch puro, sem SDK).
 * Nenhum token de pessoa fica guardado: a cada uso o app pede um token de instalação de 1 hora.
 */
export interface ConfigGithubApp {
  appId: string;
  slug: string;
  privateKey: string;
  clientId?: string | null;
  clientSecret?: string | null;
  /** https://api.github.com (trocável nos testes) */
  apiBase?: string;
  /** https://github.com (OAuth e página de instalação) */
  webBase?: string;
}

export class ErroGithub extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Chave privada vinda de Secrets pode chegar com "\n" escrito: volta para quebras de linha de verdade. */
export function normalizarChavePrivada(chave: string) {
  const t = chave.trim();
  return t.includes("\n") ? t : t.replace(/\\n/g, "\n");
}

/** JWT do app (RS256), válido por 9 minutos, para falar com a API como o próprio app. */
export function jwtDoApp(cfg: Pick<ConfigGithubApp, "appId" | "privateKey">, agoraS = Math.floor(Date.now() / 1000)) {
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({ iat: agoraS - 60, exp: agoraS + 540, iss: cfg.appId }));
  const assinatura = createSign("RSA-SHA256").update(`${cabecalho}.${corpo}`).sign(normalizarChavePrivada(cfg.privateKey));
  return `${cabecalho}.${corpo}.${b64url(assinatura)}`;
}

export interface Repositorio {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface ArquivoParaCommit {
  path: string;
  /** null = apagar */
  content: string | null;
}

const tokens = new Map<string, { token: string; ate: number }>();
const LIMITE_TARBALL = 50 * 1024 * 1024;

export class GithubApp {
  readonly api: string;
  readonly web: string;
  constructor(
    readonly cfg: ConfigGithubApp,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.api = (cfg.apiBase ?? "https://api.github.com").replace(/\/+$/, "");
    this.web = (cfg.webBase ?? "https://github.com").replace(/\/+$/, "");
  }

  private async req<T>(metodo: string, caminho: string, opts: { auth: string; corpo?: unknown; accept?: string } ): Promise<T> {
    const r = await this.fetchImpl(caminho.startsWith("http") ? caminho : `${this.api}${caminho}`, {
      method: metodo,
      headers: {
        authorization: opts.auth,
        accept: opts.accept ?? "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "Forja-Agentes",
        ...(opts.corpo !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: opts.corpo !== undefined ? JSON.stringify(opts.corpo) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { message?: string };
      throw new ErroGithub(r.status, j.message ?? `GitHub respondeu ${r.status}`);
    }
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  private comoApp() {
    return `Bearer ${jwtDoApp(this.cfg)}`;
  }

  /** Token de instalação (1 h), reaproveitado até 5 min antes de vencer. */
  async tokenDaInstalacao(installationId: number) {
    const chave = `${this.cfg.appId}:${installationId}`;
    const guardado = tokens.get(chave);
    if (guardado && guardado.ate - 5 * 60_000 > Date.now()) return guardado.token;
    const r = await this.req<{ token: string; expires_at: string }>("POST", `/app/installations/${installationId}/access_tokens`, {
      auth: this.comoApp(),
      corpo: {},
    });
    tokens.set(chave, { token: r.token, ate: Date.parse(r.expires_at) || Date.now() + 50 * 60_000 });
    return r.token;
  }

  async instalacao(installationId: number) {
    const r = await this.req<{ id: number; account: { login: string; type: string } | null }>("GET", `/app/installations/${installationId}`, {
      auth: this.comoApp(),
    });
    return { id: r.id, login: r.account?.login ?? "?", tipo: r.account?.type ?? "User" };
  }

  /** Repositórios que a instalação enxerga (até 500). */
  async repositorios(installationId: number): Promise<Repositorio[]> {
    const token = await this.tokenDaInstalacao(installationId);
    const todos: Repositorio[] = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await this.req<{ repositories: { id: number; full_name: string; default_branch: string; private: boolean }[] }>(
        "GET",
        `/installation/repositories?per_page=100&page=${pagina}`,
        { auth: `token ${token}` },
      );
      todos.push(...r.repositories.map((x) => ({ id: x.id, fullName: x.full_name, defaultBranch: x.default_branch, private: x.private })));
      if (r.repositories.length < 100) break;
    }
    return todos;
  }

  async repo(installationId: number, fullName: string) {
    const token = await this.tokenDaInstalacao(installationId);
    const r = await this.req<{ id: number; full_name: string; default_branch: string; private: boolean }>("GET", `/repos/${fullName}`, {
      auth: `token ${token}`,
    });
    return { id: r.id, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private };
  }

  /** Commit da ponta da branch; null = repositório ainda sem commits. */
  async shaDaBranch(installationId: number, fullName: string, branch: string) {
    const token = await this.tokenDaInstalacao(installationId);
    try {
      const r = await this.req<{ object: { sha: string } }>("GET", `/repos/${fullName}/git/ref/heads/${encodeURIComponent(branch)}`, {
        auth: `token ${token}`,
      });
      return r.object.sha;
    } catch (e) {
      if (e instanceof ErroGithub && (e.status === 409 || e.status === 404)) return null;
      throw e;
    }
  }

  /** Arquivo .tar.gz do repositório num commit. */
  async tarball(installationId: number, fullName: string, sha: string) {
    const token = await this.tokenDaInstalacao(installationId);
    const r = await this.fetchImpl(`${this.api}/repos/${fullName}/tarball/${sha}`, {
      headers: { authorization: `token ${token}`, "user-agent": "Forja-Agentes", "x-github-api-version": "2022-11-28" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new ErroGithub(r.status, `Não consegui baixar o repositório (${r.status}).`);
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (tamanho > LIMITE_TARBALL) throw new ErroGithub(413, "Repositório grande demais para o agente (limite de 50 MB compactado).");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > LIMITE_TARBALL) throw new ErroGithub(413, "Repositório grande demais para o agente (limite de 50 MB compactado).");
    return buf;
  }

  /** Dados de um pull request (para a revisão de QA da Forja). */
  async pullRequest(installationId: number, fullName: string, numero: number) {
    const token = await this.tokenDaInstalacao(installationId);
    const r = await this.req<{
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      state: string;
      user: { login: string } | null;
      head: { ref: string; sha: string; repo: { full_name: string } | null };
      base: { ref: string; sha: string };
      changed_files: number;
    }>("GET", `/repos/${fullName}/pulls/${numero}`, { auth: `token ${token}` });
    return {
      numero: r.number,
      titulo: r.title,
      corpo: r.body ?? "",
      url: r.html_url,
      estado: r.state,
      autor: r.user?.login ?? null,
      headRef: r.head.ref,
      headSha: r.head.sha,
      headRepo: r.head.repo?.full_name ?? null,
      baseRef: r.base.ref,
      baseSha: r.base.sha,
      arquivosAlterados: r.changed_files,
    };
  }

  /** Arquivos alterados no PR com o patch de cada um (até 300 arquivos). */
  async arquivosDoPR(installationId: number, fullName: string, numero: number) {
    const token = await this.tokenDaInstalacao(installationId);
    const todos: { arquivo: string; status: string; adicoes: number; remocoes: number; patch: string | null }[] = [];
    for (let pagina = 1; pagina <= 3; pagina++) {
      const r = await this.req<{ filename: string; status: string; additions: number; deletions: number; patch?: string }[]>(
        "GET",
        `/repos/${fullName}/pulls/${numero}/files?per_page=100&page=${pagina}`,
        { auth: `token ${token}` },
      );
      todos.push(...r.map((f) => ({ arquivo: f.filename, status: f.status, adicoes: f.additions, remocoes: f.deletions, patch: f.patch ?? null })));
      if (r.length < 100) break;
    }
    return todos;
  }

  /** Publica a revisão no PR como comentário de revisão (não aprova nem bloqueia). */
  async comentarNoPR(installationId: number, fullName: string, numero: number, corpo: string, commitSha?: string | null) {
    const token = await this.tokenDaInstalacao(installationId);
    const r = await this.req<{ html_url: string }>("POST", `/repos/${fullName}/pulls/${numero}/reviews`, {
      auth: `token ${token}`,
      corpo: { body: corpo, event: "COMMENT", ...(commitSha ? { commit_id: commitSha } : {}) },
    });
    return { url: r.html_url };
  }

  /** Conteúdo de um arquivo num commit (texto), ou null se não existir. */
  async arquivo(installationId: number, fullName: string, path: string, ref: string) {
    const token = await this.tokenDaInstalacao(installationId);
    const r = await this.fetchImpl(`${this.api}/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`, {
      headers: {
        authorization: `token ${token}`,
        accept: "application/vnd.github.raw+json",
        "user-agent": "Forja-Agentes",
        "x-github-api-version": "2022-11-28",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new ErroGithub(r.status, `Não consegui ler ${path} (${r.status}).`);
    return await r.text();
  }

  /**
   * Cria a branch com um commit das mudanças e abre o PR (Git Data API: árvore com base na original).
   * Repositório vazio: cria antes um README na branch padrão para haver um commit de partida.
   */
  async abrirPR(
    installationId: number,
    p: { fullName: string; base: string; baseSha: string | null; branch: string; arquivos: ArquivoParaCommit[]; titulo: string; corpo: string; mensagem: string },
  ) {
    const auth = `token ${await this.tokenDaInstalacao(installationId)}`;
    const repo = `/repos/${p.fullName}`;
    let baseSha = p.baseSha;
    if (!baseSha) {
      const nome = p.fullName.split("/")[1] ?? "projeto";
      const r = await this.req<{ commit: { sha: string } }>("PUT", `${repo}/contents/README.md`, {
        auth,
        corpo: { message: "Início do repositório (Forja)", content: Buffer.from(`# ${nome}\n`).toString("base64"), branch: p.base },
      });
      baseSha = r.commit.sha;
    }
    const commitBase = await this.req<{ tree: { sha: string } }>("GET", `${repo}/git/commits/${baseSha}`, { auth });
    const arvore = await this.req<{ sha: string }>("POST", `${repo}/git/trees`, {
      auth,
      corpo: {
        base_tree: commitBase.tree.sha,
        tree: p.arquivos.map((a) =>
          a.content === null
            ? { path: a.path, mode: "100644", type: "blob", sha: null }
            : { path: a.path, mode: "100644", type: "blob", content: a.content },
        ),
      },
    });
    const commit = await this.req<{ sha: string }>("POST", `${repo}/git/commits`, {
      auth,
      corpo: { message: p.mensagem, tree: arvore.sha, parents: [baseSha] },
    });
    let branch = p.branch;
    for (let tentativa = 0; ; tentativa++) {
      try {
        await this.req("POST", `${repo}/git/refs`, { auth, corpo: { ref: `refs/heads/${branch}`, sha: commit.sha } });
        break;
      } catch (e) {
        // branch com o mesmo nome já existe: outro sufixo
        if (e instanceof ErroGithub && e.status === 422 && tentativa < 3) {
          branch = `${p.branch}-${tentativa + 2}`;
          continue;
        }
        throw e;
      }
    }
    const pr = await this.req<{ html_url: string; number: number }>("POST", `${repo}/pulls`, {
      auth,
      corpo: { title: p.titulo, head: branch, base: p.base, body: p.corpo },
    });
    return { url: pr.html_url, numero: pr.number, branch, commitSha: commit.sha };
  }

  // ---- instalação pelo cliente (OAuth durante a instalação, para provar quem instalou) ----

  urlDeInstalacao(estado: string) {
    return `${this.web}/apps/${this.cfg.slug}/installations/new?state=${encodeURIComponent(estado)}`;
  }

  async trocarCodigo(codigo: string) {
    if (!this.cfg.clientId || !this.cfg.clientSecret) throw new ErroGithub(500, "GITHUB_APP_CLIENT_ID e GITHUB_APP_CLIENT_SECRET não configurados.");
    const r = await this.fetchImpl(`${this.web}/login/oauth/access_token`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "Forja-Agentes" },
      body: JSON.stringify({ client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, code: codigo }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
    if (!r.ok || !j.access_token) throw new ErroGithub(401, j.error_description ?? "O GitHub recusou o código de autorização.");
    return j.access_token;
  }

  /** Instalações que a PESSOA consegue ver (prova de que ela tem acesso à instalação). */
  async instalacoesDoUsuario(tokenDoUsuario: string) {
    const ids: number[] = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await this.req<{ installations: { id: number }[] }>("GET", `/user/installations?per_page=100&page=${pagina}`, {
        auth: `Bearer ${tokenDoUsuario}`,
      });
      ids.push(...r.installations.map((i) => i.id));
      if (r.installations.length < 100) break;
    }
    return ids;
  }
}

// ---- estado assinado do fluxo de instalação ----

/**
 * Segredo atual do app: a 1ª entrada de BETTER_AUTH_SECRETS ("2:valor,1:valor") quando houver
 * rotação (doc 10), senão BETTER_AUTH_SECRET.
 */
function segredoDoEstado() {
  const atual = process.env.BETTER_AUTH_SECRETS?.split(",")[0]?.trim();
  const s = (atual && atual.includes(":") ? atual.slice(atual.indexOf(":") + 1).trim() : "") || process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("BETTER_AUTH_SECRET não definido.");
  return s;
}

/** Estado opaco que volta do GitHub: organização, pessoa e validade de 30 min, assinado (HMAC). */
export function assinarEstado(dados: { orgId: string; userId: string }, agora = Date.now()) {
  const corpo = b64url(JSON.stringify({ o: dados.orgId, u: dados.userId, e: agora + 30 * 60_000 }));
  const mac = createHmac("sha256", segredoDoEstado()).update(`github-instalacao:${corpo}`).digest("base64url");
  return `${corpo}.${mac}`;
}

export function lerEstado(estado: string, agora = Date.now()): { orgId: string; userId: string } | null {
  const [corpo, mac] = estado.split(".");
  if (!corpo || !mac) return null;
  const esperado = createHmac("sha256", segredoDoEstado()).update(`github-instalacao:${corpo}`).digest();
  const recebido = Buffer.from(mac, "base64url");
  if (recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as { o: string; u: string; e: number };
    if (!d.o || !d.u || !(d.e > agora)) return null;
    return { orgId: d.o, userId: d.u };
  } catch {
    return null;
  }
}
