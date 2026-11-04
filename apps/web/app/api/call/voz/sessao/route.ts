import { createLiveSession } from "@forja/core/server";
import { createGatewayStore, schema } from "@forja/db";
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
  if (!user.emailVerified) return Response.json({ erro: "Confirme seu e-mail para usar a voz." }, { status: 403 });

  const body = (await request.json()) as { sdp?: string; projeto?: string };
  if (!body.sdp?.startsWith("v=")) return Response.json({ erro: "SDP inválido." }, { status: 400 });

  // saldo para pelo menos 2 minutos de voz (o raciocínio é cobrado à parte)
  const minimo = (await precoMinutoBrlMicros(db)) * 2;
  if (org.creditBalanceBrlMicros < minimo) {
    return Response.json({ erro: "Saldo insuficiente para a voz em nuvem. Use a voz do navegador ou faça uma recarga." }, { status: 402 });
  }

  const chaves = await createGatewayStore(db).listProviderKeys("openai", org.id);
  const chave = chaves[0];
  if (!chave) return Response.json({ erro: "Voz em nuvem indisponível no momento." }, { status: 503 });

  const projeto = await garantirProjeto(db, { orgId: org.id, userId: user.id, maxProjects: plan?.maxProjects }, body.projeto ?? "nova", "Ideia em call");
  if ("erro" in projeto) return Response.json({ erro: projeto.erro }, { status: 409 });

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
    return Response.json({ erro: "O provedor de voz não respondeu. Tente de novo ou use a voz do navegador." }, { status: 502 });
  }

  const quando = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date());
  const [conversa] = await db
    .insert(schema.conversations)
    .values({ orgId: org.id, projectId: projeto.id, title: `Call de voz · ${quando}`, modelId: "claude-sonnet-5-5", createdBy: user.id })
    .returning({ id: schema.conversations.id });
  const [sessao] = await db
    .insert(schema.voiceSessions)
    .values({
      orgId: org.id,
      userId: user.id,
      projectId: projeto.id,
      conversationId: conversa!.id,
      providerId: "openai",
      providerKeyId: chave.id,
      providerSessionId: live.sessionId,
      model: VOZ_PRODUTO.id,
    })
    .returning({ id: schema.voiceSessions.id });

  return Response.json({ sessaoId: sessao!.id, sdp: live.sdpAnswer, projectId: projeto.id, conversationId: conversa!.id });
}
