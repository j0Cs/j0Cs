import { assinarEstado, githubApp } from "@forja/agent";
import { canManage, getApiSession } from "@/lib/session";

export const runtime = "nodejs";

/** Leva a pessoa à instalação do GitHub App "Forja Agentes", com o estado assinado da organização. */
export async function GET(request: Request) {
  const s = await getApiSession();
  const volta = (motivo: string) => Response.redirect(new URL(`/agente?github=${motivo}`, request.url), 303);
  if (!s) return Response.redirect(new URL("/entrar?next=/agente", request.url), 303);
  if (!canManage(s.role)) return volta("sem-permissao");
  const gh = await githubApp();
  if (!gh) return volta("nao-configurado");
  return Response.redirect(gh.urlDeInstalacao(assinarEstado({ orgId: s.org.id, userId: s.user.id })), 303);
}
