import { and, eq, schema } from "@forja/db";
import { getApiSession } from "@/lib/session";
import { cobrarAte, encerrarSessao, precoMinutoBrlMicros } from "@/lib/voz";

export const runtime = "nodejs";

/** Pulso do navegador a cada 15 s: cobra o tempo decorrido e corta se o saldo não cobre o próximo minuto. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { db, org } = session;
  const { sessaoId } = (await request.json()) as { sessaoId?: string };
  if (!sessaoId) return Response.json({ erro: "sessaoId obrigatório." }, { status: 400 });

  const sessao = await db.query.voiceSessions.findFirst({
    where: and(eq(schema.voiceSessions.id, sessaoId), eq(schema.voiceSessions.orgId, org.id)),
  });
  if (!sessao) return Response.json({ erro: "Chamada não encontrada." }, { status: 404 });
  if (sessao.status !== "active") return Response.json({ encerrar: true, motivo: "Chamada já encerrada." });
  if (org.status !== "active") {
    await cobrarAte(db, sessao, new Date());
    await encerrarSessao(db, sessao, "conta-suspensa");
    return Response.json({ encerrar: true, motivo: "Sua conta está suspensa. Fale com o suporte." });
  }

  const { cobrado, saldo } = await cobrarAte(db, sessao, new Date());
  const proximoMinuto = await precoMinutoBrlMicros(db);
  if (saldo !== null && saldo < proximoMinuto) {
    await encerrarSessao(db, sessao, "saldo");
    return Response.json({ encerrar: true, motivo: "Seu saldo de créditos acabou. Faça uma recarga para continuar.", cobrado });
  }
  return Response.json({ encerrar: false, cobrado });
}
