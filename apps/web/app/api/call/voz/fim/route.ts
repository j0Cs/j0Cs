import { and, eq, schema } from "@forja/db";
import { getApiSession } from "@/lib/session";
import { cobrarAte, encerrarSessao } from "@/lib/voz";

export const runtime = "nodejs";

/** Fim normal da chamada: cobra até agora (relógio do servidor) e encerra no provedor. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { db, org } = session;
  const { sessaoId, falhou } = (await request.json()) as { sessaoId?: string; falhou?: boolean };
  const sessao = sessaoId
    ? await db.query.voiceSessions.findFirst({ where: and(eq(schema.voiceSessions.id, sessaoId), eq(schema.voiceSessions.orgId, org.id)) })
    : undefined;
  if (!sessao) return Response.json({ erro: "Chamada não encontrada." }, { status: 404 });
  // Conexão que não chegou a fechar (nenhum pulso, menos de 30 s): não cobra o cliente; a plataforma absorve.
  const naoConectou = falhou === true && sessao.billedSeconds === 0 && Date.now() - sessao.startedAt.getTime() < 30_000;
  const { cobrado } =
    (sessao.status === "active" || sessao.status === "closing") && !naoConectou ? await cobrarAte(db, sessao, new Date()) : { cobrado: 0 };
  await encerrarSessao(db, sessao, naoConectou ? "falha-conexao" : "fim");
  return Response.json({ ok: true, cobrado });
}
