import { CABECALHO_DESKTOP, getWebAuth } from "@forja/auth";
import { consumeRateLimit, getDb } from "@forja/db";

export const runtime = "nodejs";

/**
 * Última etapa do login do app desktop: troca o código de uso único por uma sessão própria do app.
 * As rotas POST do Better Auth ficam fechadas (app/api/auth), então esta é a única porta, com o
 * cabeçalho do app (um formulário de outro site não consegue enviar) e limite por IP.
 */
export async function POST(request: Request) {
  if (request.headers.get(CABECALHO_DESKTOP) !== "1") return new Response("Só o app desktop usa esta rota.", { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconhecido";
  if (!(await consumeRateLimit(getDb(), `desktop:sessao:ip:${ip}`, 20, 600))) return new Response("Muitas tentativas.", { status: 429 });

  const corpo = (await request.json().catch(() => null)) as { codigo?: unknown } | null;
  if (typeof corpo?.codigo !== "string") return new Response("Código ausente.", { status: 400 });
  const interna = new Request(new URL("/api/auth/desktop/sessao", request.url), {
    method: "POST",
    headers: { "content-type": "application/json", [CABECALHO_DESKTOP]: "1", "user-agent": request.headers.get("user-agent") ?? "", "x-forwarded-for": ip },
    body: JSON.stringify({ codigo: corpo.codigo }),
  });
  const resposta = await getWebAuth().handler(interna);
  if (!resposta.ok) return new Response("Código inválido ou vencido.", { status: 400 });
  const saida = new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  for (const c of resposta.headers.getSetCookie()) saida.headers.append("set-cookie", c);
  return saida;
}
