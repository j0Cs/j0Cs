import { and, consumeRateLimit, eq, schema } from "@forja/db";
import { getApiSession } from "@/lib/session";
import { cobrarAte, encerrarSessao, VOZ_PRODUTO } from "@/lib/voz";

export const runtime = "nodejs";

/** Isenções de "a conexão falhou" por pessoa e por hora: o aviso vem do navegador, não dá para confiar sem limite. */
const ISENCOES_POR_HORA = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fim normal da chamada: cobra até agora (relógio do servidor) e encerra no provedor. */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { db, org, user } = session;
  const { sessaoId, falhou } = (await request.json().catch(() => ({}))) as { sessaoId?: string; falhou?: boolean };
  const sessao = sessaoId
    ? await db.query.voiceSessions.findFirst({ where: and(eq(schema.voiceSessions.id, sessaoId), eq(schema.voiceSessions.orgId, org.id)) })
    : undefined;
  if (!sessao) {
    // O navegador desistiu antes de /sessao gravar a reserva (aba fechada logo no clique): deixa uma
    // marca "closed" com esse id, e a criação que ainda estiver a caminho falha na chave primária.
    if (falhou === true && sessaoId && UUID.test(sessaoId)) {
      await db
        .insert(schema.voiceSessions)
        .values({ id: sessaoId, orgId: org.id, userId: user.id, providerId: "openai", providerSessionId: "pendente", model: VOZ_PRODUTO.id, status: "closed", endedAt: new Date(), endReason: "cancelada-antes" })
        .onConflictDoNothing();
      return Response.json({ ok: true, cobrado: 0 });
    }
    return Response.json({ erro: "Chamada não encontrada." }, { status: 404 });
  }
  const cobravel = sessao.status === "active" || sessao.status === "closing";
  // Conexão que não chegou a fechar (nenhum pulso, menos de 30 s): a plataforma absorve, com limite
  const pediuIsencao = cobravel && falhou === true && sessao.billedSeconds === 0 && Date.now() - sessao.startedAt.getTime() < 30_000;
  const isento = pediuIsencao && (await consumeRateLimit(db, `voz-isencao:${user.id}`, ISENCOES_POR_HORA, 3600));
  const { cobrado } = cobravel && !isento ? await cobrarAte(db, sessao, new Date()) : { cobrado: 0 };
  // reserva ("connecting") nunca chegou a ser uma call: fecha como falha de conexão, sem cobrança
  await encerrarSessao(db, sessao, isento || sessao.status === "connecting" ? "falha-conexao" : "fim");
  return Response.json({ ok: true, cobrado });
}
