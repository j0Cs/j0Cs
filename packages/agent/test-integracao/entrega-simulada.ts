/**
 * Vercel e Supabase (Management API) simulados para o teste da entrega. O SQL dos projetos do
 * Supabase roda num Postgres local de verdade (um banco por projeto), com o mesmo protocolo simples
 * do endpoint real: várias instruções numa consulta só rodam numa transação implícita.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pg from "pg";

const ler = async (req: IncomingMessage) => {
  const partes: Buffer[] = [];
  for await (const p of req) partes.push(p as Buffer);
  const t = Buffer.concat(partes).toString();
  return t ? (JSON.parse(t) as Record<string, unknown>) : {};
};
const responder = (res: ServerResponse, status: number, corpo: unknown) =>
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(corpo));

export async function iniciarVercelSimulada(porta: number) {
  const estado = {
    token: "vercel-token-bom",
    time: "team_cliente",
    projetos: [] as { id: string; name: string; framework: string | null; link: { type: string; org: string; repo: string } }[],
    deployments: new Map<string, { id: string; url: string; readyState: string; corpo: Record<string, unknown>; consultas: number }>(),
    semAcesso: new Set<string>(),
    falharBuild: false,
    semTime: 0,
    pedidos: [] as string[],
  };
  let seq = 0;
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    estado.pedidos.push(`${req.method} ${p}`);
    if (req.headers.authorization !== `Bearer ${estado.token}`) return responder(res, 403, { error: { code: "forbidden", message: "Not authorized" } });
    if (p === "/v2/user") return responder(res, 200, { user: { id: "u1", username: "cliente", defaultTeamId: estado.time } });
    if (url.searchParams.get("teamId") !== estado.time) {
      estado.semTime++;
      return responder(res, 404, { error: { code: "not_found", message: "Project not found" } });
    }
    const corpo = req.method === "POST" ? await ler(req) : {};
    let m: RegExpMatchArray | null;
    if (p === "/v10/projects" && req.method === "GET") return responder(res, 200, { projects: estado.projetos });
    if ((m = p.match(/^\/v9\/projects\/(.+)$/))) {
      const pr = estado.projetos.find((x) => x.id === decodeURIComponent(m![1]!) || x.name === decodeURIComponent(m![1]!));
      return pr ? responder(res, 200, pr) : responder(res, 404, { error: { code: "not_found", message: "Project not found" } });
    }
    if (p === "/v11/projects" && req.method === "POST") {
      const git = corpo.gitRepository as { type: string; repo: string };
      if (estado.semAcesso.has(git.repo)) {
        return responder(res, 400, { error: { code: "bad_request", message: "To link a GitHub repository, you need to install the GitHub integration first." } });
      }
      if (estado.projetos.some((x) => x.name === corpo.name)) return responder(res, 409, { error: { code: "conflict", message: "Project already exists" } });
      const [org, repo] = git.repo.split("/");
      const pr = { id: `prj_${++seq}`, name: String(corpo.name), framework: (corpo.framework as string | null) ?? null, link: { type: git.type, org: org!, repo: repo! } };
      estado.projetos.push(pr);
      return responder(res, 200, pr);
    }
    if (p === "/v13/deployments" && req.method === "POST") {
      const git = corpo.gitSource as { ref: string };
      const id = `dpl_${++seq}`;
      const dep = { id, url: `${corpo.name}-git-${git.ref.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-cliente.vercel.app`, readyState: "QUEUED", corpo, consultas: 0 };
      estado.deployments.set(id, dep);
      return responder(res, 200, { id, url: dep.url, readyState: dep.readyState });
    }
    if ((m = p.match(/^\/v13\/deployments\/(.+)$/))) {
      const dep = estado.deployments.get(decodeURIComponent(m[1]!));
      if (!dep) return responder(res, 404, { error: { code: "not_found", message: "Deployment not found" } });
      dep.consultas++;
      dep.readyState = dep.consultas === 1 ? "BUILDING" : estado.falharBuild ? "ERROR" : "READY";
      return responder(res, 200, {
        id: dep.id,
        url: dep.url,
        readyState: dep.readyState,
        errorMessage: dep.readyState === "ERROR" ? "Command \"npm run build\" exited with 1" : null,
        inspectorUrl: `https://vercel.com/cliente/x/${dep.id}`,
      });
    }
    return responder(res, 404, { error: { code: "not_found", message: `simulado: ${req.method} ${p}` } });
  });
  await new Promise<void>((ok) => servidor.listen(porta, "127.0.0.1", ok));
  return { estado, url: `http://127.0.0.1:${porta}`, fechar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}

export async function iniciarSupabaseSimulado(porta: number, bancos: Record<string, string>, novoBanco: string) {
  const estado = {
    token: "sbp_bom",
    projetos: [] as { id: string; ref: string; name: string; region: string; status: string; organization_slug: string }[],
    senhas: new Map<string, string>(),
    criacoes: [] as Record<string, unknown>[],
    consultas: [] as { ref: string; query: string }[],
  };
  for (const ref of Object.keys(bancos)) {
    estado.projetos.push({ id: ref, ref, name: `Projeto ${ref.slice(0, 4)}`, region: "sa-east-1", status: "ACTIVE_HEALTHY", organization_slug: "org-cliente" });
  }
  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    if (req.headers.authorization !== `Bearer ${estado.token}`) return responder(res, 401, { message: "Unauthorized" });
    const corpo = req.method === "POST" ? await ler(req) : {};
    let m: RegExpMatchArray | null;
    if (p === "/v1/organizations") return responder(res, 200, [{ id: "org-cliente", slug: "org-cliente", name: "Cliente" }]);
    if (p === "/v1/projects" && req.method === "GET") return responder(res, 200, estado.projetos);
    if (p === "/v1/projects" && req.method === "POST") {
      estado.criacoes.push({ ...corpo, db_pass: "(oculta)" });
      if (corpo.organization_slug !== "org-cliente") return responder(res, 400, { message: "organization_slug inválido" });
      if (String(corpo.db_pass ?? "").length < 16) return responder(res, 400, { message: "senha fraca" });
      const ref = "novoprojetoabcdefghi";
      const projeto = { id: ref, ref, name: String(corpo.name), region: String((corpo.region_selection as { code: string }).code), status: "COMING_UP", organization_slug: "org-cliente" };
      estado.projetos.push(projeto);
      estado.senhas.set(ref, String(corpo.db_pass));
      bancos[ref] = novoBanco;
      return responder(res, 201, projeto);
    }
    if ((m = p.match(/^\/v1\/projects\/([^/]+)\/database\/query$/)) && req.method === "POST") {
      const ref = m[1]!;
      const cs = bancos[ref];
      if (!cs) return responder(res, 404, { message: "Project not found" });
      estado.consultas.push({ ref, query: String(corpo.query) });
      const c = new pg.Client({ connectionString: cs });
      await c.connect();
      try {
        const r = await c.query(String(corpo.query));
        const ultimo = Array.isArray(r) ? r.at(-1) : r;
        return responder(res, 201, ultimo?.rows ?? []);
      } catch (e) {
        return responder(res, 400, { message: `Failed to run sql query: ${(e as Error).message}` });
      } finally {
        await c.end();
      }
    }
    if ((m = p.match(/^\/v1\/projects\/([^/]+)$/))) {
      const pr = estado.projetos.find((x) => x.ref === m![1]);
      return pr ? responder(res, 200, pr) : responder(res, 404, { message: "Project not found" });
    }
    return responder(res, 404, { message: `simulado: ${req.method} ${p}` });
  });
  await new Promise<void>((ok) => servidor.listen(porta, "127.0.0.1", ok));
  return { estado, url: `http://127.0.0.1:${porta}`, fechar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}
