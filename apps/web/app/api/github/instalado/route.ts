import { ErroGithub, githubApp, lerEstado, registrarInstalacao } from "@forja/agent";
import { canManage, getApiSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Volta da instalação no GitHub (Setup URL do app, com "Request user authorization (OAuth) during
 * installation" ligado). A instalação só é ligada à organização depois de provar, com o código
 * OAuth, que a PESSOA logada enxerga essa instalação no GitHub. O estado assinado amarra a volta
 * à mesma pessoa e organização que começaram o fluxo.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const volta = (motivo: string) => Response.redirect(new URL(`/agente?github=${motivo}`, request.url), 303);
  const s = await getApiSession();
  if (!s) return Response.redirect(new URL("/entrar?next=/agente", request.url), 303);
  if (!canManage(s.role)) return volta("sem-permissao");

  const installationId = Number(url.searchParams.get("installation_id"));
  const codigo = url.searchParams.get("code");
  const estado = lerEstado(url.searchParams.get("state") ?? "");
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return volta("sem-instalacao");
  if (!estado || estado.orgId !== s.org.id || estado.userId !== s.user.id) return volta("estado-invalido");
  if (!codigo) return volta("sem-oauth");

  const gh = await githubApp();
  if (!gh) return volta("nao-configurado");
  try {
    const tokenDaPessoa = await gh.trocarCodigo(codigo);
    const visiveis = await gh.instalacoesDoUsuario(tokenDaPessoa);
    if (!visiveis.includes(installationId)) return volta("instalacao-alheia");
    await registrarInstalacao(s.db, gh, { orgId: s.org.id, userId: s.user.id, installationId });
    return volta("ok");
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "instalação do GitHub falhou", err: String(err) }));
    return volta(err instanceof ErroGithub && err.status === 401 ? "oauth-recusado" : "falhou");
  }
}
