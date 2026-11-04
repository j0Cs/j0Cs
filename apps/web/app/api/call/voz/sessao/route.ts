import { createLiveSession } from "@forja/core/server";
import { createGatewayStore, eq, schema } from "@forja/db";
import { garantirProjeto } from "@/lib/projects";
import { firstName } from "@/lib/persona";
import { getApiSession } from "@/lib/session";
import { instrucoesDaVoz, precoMinutoBrlMicros, VOZ_PRODUTO } from "@/lib/voz";

export const runtime = "nodejs";

/** Eventos que o navegador pode mandar pelo data channel (o resto é bloqueado pelo provedor). */
const EVENTOS_DO_CLIENTE = ["session.commentary.append", "session.thinking.append", "session.input_audio.mute", "session.input_audio.unmute", "session.close"];

/**
 * Cria a chamada de voz em nuvem: recebe o SDP do navegador, abre a sessão no provedor
 * com a NOSSA chave (que nunca sai do servidor) e devolve o SDP de resposta.
 */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { db, org, plan, user } = session;
  if (org.status !== "active") return Response.json({ erro: "Sua conta está suspensa. Fale com o suporte." }, { status: 403 });
  if (!user.emailVerified) return Response.json({ erro: "Confirme seu e-mail para usar a voz." }, { status: 403 });

  const body = (await request.json()) as { sdp?: string; projeto?: string };
  if (!body.sdp?.startsWith("v=") || body.sdp.length > 20_000) return Response.json({ erro: "SDP inválido." }, { status: 400 });

  // saldo para pelo menos 2 minutos de voz (o raciocínio é cobrado à parte)
  const minimo = (await precoMinutoBrlMicros(db)) * 2;
  if (org.creditBalanceBrlMicros < minimo) {
    return Response.json({ erro: "Saldo insuficiente para a voz em nuvem. Use a voz do navegador ou faça uma recarga." }, { status: 402 });
  }

  const chaves = await createGatewayStore(db).listProviderKeys("openai", org.id);
  const chave = chaves[0];
  if (!chave) return Response.json({ erro: "Voz em nuvem indisponível no momento." }, { status: 503 });

  // 1) reserva a vaga: o índice único garante UMA call aberta por pessoa (sem corrida)
  let reserva: { id: string } | undefined;
  try {
    [reserva] = await db
      .insert(schema.voiceSessions)
      .values({ orgId: org.id, userId: user.id, providerId: "openai", providerKeyId: chave.id, providerSessionId: "pendente", model: VOZ_PRODUTO.id })
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
      voice: VOZ_PRODUTO.voice,
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
  await db
    .update(schema.voiceSessions)
    .set({ status: "active", providerSessionId: live.sessionId, projectId: projeto.id, conversationId: conversa!.id, startedAt: agora, lastPulseAt: agora })
    .where(eq(schema.voiceSessions.id, reserva!.id));

  return Response.json({ sessaoId: reserva!.id, sdp: live.sdpAnswer, projectId: projeto.id, conversationId: conversa!.id });
}
