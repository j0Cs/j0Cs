import { bloqueioDaOrg } from "@forja/core";
import { createLiveSession, endLiveSession } from "@forja/core/server";
import { and, consumeRateLimit, createGatewayStore, eq, schema } from "@forja/db";
import { garantirProjeto } from "@/lib/projects";
import { firstName } from "@/lib/persona";
import { getApiSession } from "@/lib/session";
import { waitUntil } from "@vercel/functions";
import { instrucoesDaVoz, precoMinutoBrlMicros, varrerSeForAVez, VOZ_PRODUTO, vozNuvemHabilitada } from "@/lib/voz";

export const runtime = "nodejs";

/** Eventos que o navegador pode mandar pelo data channel (o resto é bloqueado pelo provedor). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EVENTOS_DO_CLIENTE = ["session.commentary.append", "session.thinking.append", "session.input_audio.mute", "session.input_audio.unmute", "session.close"];

/**
 * Cria a chamada de voz em nuvem: recebe o SDP do navegador, abre a sessão no provedor
 * com a NOSSA chave (que nunca sai do servidor) e devolve o SDP de resposta.
 */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { db, org, plan, user } = session;
  const bloqueio = bloqueioDaOrg(org);
  if (bloqueio) return Response.json({ erro: bloqueio.message }, { status: bloqueio.code === "org_inactive" ? 403 : 402 });
  if (!user.emailVerified) return Response.json({ erro: "Confirme seu e-mail para usar a voz." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { sdp?: string; projeto?: string; reserva?: string; voz?: string };
  if (!body.sdp?.startsWith("v=") || body.sdp.length > 20_000) return Response.json({ erro: "SDP inválido." }, { status: 400 });
  // id da reserva gerado pelo navegador: ele consegue encerrar a reserva (beacon ao fechar a aba)
  // antes mesmo de esta resposta chegar
  if (body.reserva !== undefined && !UUID.test(body.reserva)) return Response.json({ erro: "Reserva inválida." }, { status: 400 });
  if (!(await consumeRateLimit(db, `voz-sessao:${user.id}`, 20, 3600))) {
    return Response.json({ erro: "Muitas calls abertas na última hora. Tente de novo mais tarde." }, { status: 429 });
  }

  // saldo para pelo menos 2 minutos de voz (o raciocínio é cobrado à parte)
  const minimo = (await precoMinutoBrlMicros(db)) * 2;
  if (org.creditBalanceBrlMicros < minimo) {
    return Response.json({ erro: "Saldo insuficiente para a voz em nuvem. Use a voz do navegador ou faça uma recarga." }, { status: 402 });
  }

  if (!vozNuvemHabilitada()) return Response.json({ erro: "Voz em nuvem indisponível no momento. Use a voz do navegador." }, { status: 503 });
  waitUntil(varrerSeForAVez(db).catch((err) => console.error(JSON.stringify({ level: "error", msg: "varredura na abertura falhou", err: String(err) }))));
  const chaves = await createGatewayStore(db).listProviderKeys("openai", org.id);
  const chave = chaves[0];
  if (!chave) return Response.json({ erro: "Voz em nuvem indisponível no momento." }, { status: 503 });

  // 1) reserva a vaga: o índice único garante UMA call aberta por pessoa (sem corrida)
  let reserva: { id: string } | undefined;
  try {
    [reserva] = await db
      .insert(schema.voiceSessions)
      .values({
        ...(body.reserva ? { id: body.reserva } : {}),
        orgId: org.id,
        userId: user.id,
        providerId: "openai",
        providerKeyId: chave.id,
        providerSessionId: "pendente",
        model: VOZ_PRODUTO.id,
      })
      .returning({ id: schema.voiceSessions.id });
  } catch {
    return Response.json({ erro: "Você já tem uma call em andamento. Encerre-a antes de abrir outra." }, { status: 409 });
  }
  const liberar = () => db.delete(schema.voiceSessions).where(eq(schema.voiceSessions.id, reserva!.id));

  // 2) projeto (com trava por organização para respeitar o limite do plano)
  const projeto = await garantirProjeto(db, { orgId: org.id, userId: user.id, maxProjects: plan?.maxProjects }, body.projeto ?? "nova", "Ideia em call");
  if ("erro" in projeto) {
    await liberar();
    return Response.json({ erro: projeto.erro }, { status: 409 });
  }

  // 3) sessão no provedor com a NOSSA chave
  let live: { sessionId: string; sdpAnswer: string };
  try {
    live = await createLiveSession({
      apiKey: chave.apiKey,
      sdpOffer: body.sdp,
      instructions: instrucoesDaVoz(firstName(user.name)),
      // as duas vozes em português do GPT-Live; qualquer outro valor cai no padrão
      voice: body.voz === "tempo" || body.voz === "bossa" ? body.voz : VOZ_PRODUTO.voice,
      allowedClientEvents: EVENTOS_DO_CLIENTE,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "falha ao criar sessão de voz", err: String(err) }));
    await liberar();
    if (projeto.criado) await db.delete(schema.projects).where(eq(schema.projects.id, projeto.id));
    return Response.json({ erro: "O provedor de voz não respondeu. Tente de novo ou use a voz do navegador." }, { status: 502 });
  }

  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const [conversa] = await db
    .insert(schema.conversations)
    .values({ orgId: org.id, projectId: projeto.id, title: `Call de voz · ${quando}`, modelId: "claude-sonnet-5-5", createdBy: user.id })
    .returning({ id: schema.conversations.id });
  const agora = new Date();
  // só ativa se a reserva ainda está de pé: se a pessoa saiu durante a criação, /fim já a fechou
  const [ativada] = await db
    .update(schema.voiceSessions)
    .set({ status: "active", providerSessionId: live.sessionId, projectId: projeto.id, conversationId: conversa!.id, startedAt: agora, lastPulseAt: agora })
    .where(and(eq(schema.voiceSessions.id, reserva!.id), eq(schema.voiceSessions.status, "connecting")))
    .returning({ id: schema.voiceSessions.id });
  if (!ativada) {
    await endLiveSession({ apiKey: chave.apiKey, sessionId: live.sessionId }).catch(() => undefined);
    await db.delete(schema.conversations).where(eq(schema.conversations.id, conversa!.id));
    if (projeto.criado) await db.delete(schema.projects).where(eq(schema.projects.id, projeto.id));
    return Response.json({ erro: "Chamada cancelada." }, { status: 409 });
  }

  return Response.json({ sessaoId: reserva!.id, sdp: live.sdpAnswer, projectId: projeto.id, conversationId: conversa!.id });
}
