import { createVerify, type KeyObject } from "node:crypto";
import { createServer, type Server } from "node:http";
import { tarGz } from "../test/tar-gz";

/**
 * GitHub simulado (só o que o agente usa), com estado em memória. Confere o JWT do app com a
 * chave pública e o token de instalação em cada chamada de repositório.
 */
export interface RepoSimulado {
  fullName: string;
  defaultBranch: string;
  /** null = repositório vazio (sem commits) */
  arquivos: Record<string, string> | null;
  private?: boolean;
}

/** Pull request simulado: o head tem os próprios arquivos (servidos pelo tarball do headSha). */
export interface PullSimulado {
  numero: number;
  titulo: string;
  corpo: string;
  autor: string;
  headRef: string;
  headSha: string;
  headRepo: string;
  baseRef: string;
  baseSha: string;
  arquivos: Record<string, string>;
  alterados: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}

export interface GithubSimulado {
  url: string;
  repos: Map<string, RepoSimulado & { sha: string | null }>;
  arvores: Map<string, { base: string | null; entradas: { path: string; content?: string; sha?: string | null }[] }>;
  refs: Map<string, string>;
  prs: { repo: string; title: string; head: string; base: string; body: string; number: number }[];
  /** chave: "dono/repo#numero" */
  pulls: Map<string, PullSimulado>;
  revisoes: { repo: string; numero: number; body: string; event: string; commit_id: string | null }[];
  chamadas: string[];
  /** instalações que o usuário do OAuth enxerga */
  instalacoesDoUsuario: number[];
  fechar(): Promise<void>;
}

export async function iniciarGithubSimulado(opts: { porta: number; chavePublica: KeyObject; appId: string; installationId: number; repos: RepoSimulado[] }) {
  let seq = 0;
  const repos = new Map(
    opts.repos.map((r) => [r.fullName, { ...r, sha: r.arquivos ? `sha${String(++seq).padStart(5, "0")}` : null }]),
  );
  const estado: Omit<GithubSimulado, "url" | "fechar"> = {
    repos,
    arvores: new Map(),
    refs: new Map(),
    prs: [],
    pulls: new Map(),
    revisoes: [],
    chamadas: [],
    instalacoesDoUsuario: [opts.installationId],
  };
  const TOKEN = "ghs_instalacao_teste";

  const jwtValido = (auth: string | undefined) => {
    const jwt = auth?.replace(/^Bearer /, "") ?? "";
    const [h, c, s] = jwt.split(".");
    if (!h || !c || !s) return false;
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(opts.chavePublica, Buffer.from(s, "base64url"));
    const corpo = JSON.parse(Buffer.from(c, "base64url").toString()) as { iss: string; exp: number };
    return ok && corpo.iss === opts.appId && corpo.exp * 1000 > Date.now();
  };

  const servidor: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    let corpo = "";
    for await (const parte of req) corpo += parte;
    const json = corpo ? (JSON.parse(corpo) as Record<string, unknown>) : {};
    estado.chamadas.push(`${req.method} ${u.pathname}`);
    const responder = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      if (Buffer.isBuffer(body)) {
        res.writeHead(status, { "content-type": "application/x-gzip", "content-length": String(body.length), ...headers });
        return res.end(body);
      }
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    };
    const p = u.pathname;
    let m: RegExpMatchArray | null;

    // ---- como o app (JWT) ----
    if ((m = p.match(/^\/app\/installations\/(\d+)(\/access_tokens)?$/))) {
      if (!jwtValido(req.headers.authorization)) return responder(401, { message: "Bad JWT" });
      if (Number(m[1]) !== opts.installationId) return responder(404, { message: "Not Found" });
      if (m[2]) return responder(201, { token: TOKEN, expires_at: new Date(Date.now() + 3600_000).toISOString() });
      return responder(200, { id: opts.installationId, account: { login: "cliente-teste", type: "User" } });
    }
    // ---- OAuth da pessoa ----
    if (p === "/login/oauth/access_token") return responder(200, json.code === "codigo-bom" ? { access_token: "gho_pessoa" } : { error_description: "bad code" });
    if (p === "/user/installations") {
      if (req.headers.authorization !== "Bearer gho_pessoa") return responder(401, { message: "Bad credentials" });
      return responder(200, { installations: estado.instalacoesDoUsuario.map((id) => ({ id })) });
    }

    // ---- como a instalação ----
    if (req.headers.authorization !== `token ${TOKEN}`) return responder(401, { message: "Bad credentials" });
    if (p === "/installation/repositories") {
      return responder(200, {
        repositories: [...repos.values()].map((r, i) => ({ id: i + 1, full_name: r.fullName, default_branch: r.defaultBranch, private: r.private ?? true })),
      });
    }
    if (!(m = p.match(/^\/repos\/([^/]+\/[^/]+)(\/.*)?$/))) return responder(404, { message: "Not Found" });
    const repo = repos.get(m[1]!);
    if (!repo) return responder(404, { message: "Not Found" });
    const resto = m[2] ?? "";
    if (!resto) return responder(200, { id: 1, full_name: repo.fullName, default_branch: repo.defaultBranch, private: repo.private ?? true });
    if ((m = resto.match(/^\/git\/ref\/heads\/(.+)$/))) {
      if (!repo.sha) return responder(409, { message: "Git Repository is empty." });
      const sha = estado.refs.get(`${repo.fullName}:${decodeURIComponent(m[1]!)}`) ?? (decodeURIComponent(m[1]!) === repo.defaultBranch ? repo.sha : null);
      return sha ? responder(200, { object: { sha } }) : responder(404, { message: "Not Found" });
    }
    if ((m = resto.match(/^\/tarball\/(.+)$/))) {
      const doPR = [...estado.pulls.values()].find((x) => x.headRepo === repo.fullName && x.headSha === m![1]);
      if (doPR) return responder(200, tarGz(doPR.arquivos, `${repo.fullName.replace("/", "-")}-${doPR.headSha}`));
      if (m[1] !== repo.sha || !repo.arquivos) return responder(404, { message: "Not Found" });
      return responder(200, tarGz(repo.arquivos, `${repo.fullName.replace("/", "-")}-${repo.sha}`));
    }
    if (resto === "/contents/README.md" && req.method === "PUT") {
      if (repo.sha) return responder(422, { message: "sha required" });
      repo.sha = `sha${String(++seq).padStart(5, "0")}`;
      repo.arquivos = { "README.md": Buffer.from(String(json.content), "base64").toString() };
      return responder(201, { commit: { sha: repo.sha } });
    }
    if ((m = resto.match(/^\/contents\/(.+)$/))) {
      const caminho = decodeURIComponent(m[1]!);
      const conteudo = repo.arquivos?.[caminho];
      return conteudo === undefined ? responder(404, { message: "Not Found" }) : res.writeHead(200).end(conteudo);
    }
    if ((m = resto.match(/^\/git\/commits\/(.+)$/))) return responder(200, { sha: m[1], tree: { sha: `arvore-de-${m[1]}` } });
    if (resto === "/git/trees" && req.method === "POST") {
      const sha = `arvore${String(++seq).padStart(5, "0")}`;
      estado.arvores.set(sha, { base: (json.base_tree as string) ?? null, entradas: json.tree as never });
      return responder(201, { sha });
    }
    if (resto === "/git/commits" && req.method === "POST") return responder(201, { sha: `commit${String(++seq).padStart(5, "0")}` });
    if (resto === "/git/refs" && req.method === "POST") {
      const chave = `${repo.fullName}:${String(json.ref).replace("refs/heads/", "")}`;
      if (estado.refs.has(chave)) return responder(422, { message: "Reference already exists" });
      estado.refs.set(chave, String(json.sha));
      return responder(201, { ref: json.ref });
    }
    if ((m = resto.match(/^\/pulls\/(\d+)(\/files|\/reviews)?$/))) {
      const pull = estado.pulls.get(`${repo.fullName}#${m[1]}`);
      if (!pull) return responder(404, { message: "Not Found" });
      if (m[2] === "/files") return responder(200, u.searchParams.get("page") === "1" || !u.searchParams.get("page") ? pull.alterados : []);
      if (m[2] === "/reviews" && req.method === "POST") {
        estado.revisoes.push({ repo: repo.fullName, numero: pull.numero, body: String(json.body), event: String(json.event), commit_id: (json.commit_id as string) ?? null });
        return responder(200, { html_url: `https://github.com/${repo.fullName}/pull/${pull.numero}#pullrequestreview-${estado.revisoes.length}` });
      }
      return responder(200, {
        number: pull.numero,
        title: pull.titulo,
        body: pull.corpo,
        html_url: `https://github.com/${repo.fullName}/pull/${pull.numero}`,
        state: "open",
        user: { login: pull.autor },
        head: { ref: pull.headRef, sha: pull.headSha, repo: { full_name: pull.headRepo } },
        base: { ref: pull.baseRef, sha: pull.baseSha },
        changed_files: pull.alterados.length,
      });
    }
    if (resto === "/pulls" && req.method === "POST") {
      const numero = estado.prs.length + 1;
      estado.prs.push({ repo: repo.fullName, title: String(json.title), head: String(json.head), base: String(json.base), body: String(json.body), number: numero });
      return responder(201, { html_url: `https://github.com/${repo.fullName}/pull/${numero}`, number: numero });
    }
    return responder(404, { message: `simulado: ${req.method} ${p} não implementado` });
  });
  await new Promise<void>((ok) => servidor.listen(opts.porta, "127.0.0.1", ok));
  return {
    ...estado,
    url: `http://127.0.0.1:${opts.porta}`,
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  } satisfies GithubSimulado;
}
