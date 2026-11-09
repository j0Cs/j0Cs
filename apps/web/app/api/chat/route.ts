import { ehPersona, instrucoesDaConversa, resumoDaEstrutura, type EstruturaDoRepositorio } from "@forja/agent";
import type { ChatMessage } from "@forja/core";
import { verificarSaldoBaixo } from "@forja/billing";
import { authorize, GatewayError, runChat, type Effort } from "@forja/core/server";
import { and, asc, createGatewayStore, eq, schema } from "@forja/db";
import { callSystemPrompt } from "@/lib/call";
import { firstName } from "@/lib/persona";
import { getApiSession } from "@/lib/session";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Instruções base: estáveis para aproveitar o cache de prompt. */
const BASE_SYSTEM = `Você é o assistente de engenharia de uma plataforma de criação de sistemas.
Responda em português do Brasil, de forma direta. Ao propor código, entregue arquivos completos
e explique como rodar. Quando faltar informação essencial, pergunte antes de supor.`;

const HISTORY_LIMIT = 40;
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh"];

export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return new Response("Não autenticado.", { status: 401 });
  const { db, org, user } = session;
  if (!user.emailVerified) {
    return new Response("Confirme seu e-mail para usar os modelos de IA (veja o aviso no topo da página).", { status: 403 });
  }
  const body = (await request.json()) as {
    projectId?: string;
    conversationId?: string | null;
    modelId?: string;
    effort?: string;
    /** Papel do time Forja na conversa (dev_senior, dev_pleno, qa_pleno, seguranca_pleno). */
    persona?: string;
    message?: string;
    /** "call" = chamada de voz: respostas curtas, faladas, sem markdown. */
    modo?: string;
    /** Responder à última mensagem do usuário já gravada (pedido vindo da Central). */
    responderUltima?: boolean;
  };
  const text = body.message?.trim().slice(0, 20_000);
  if (!body.projectId || !body.modelId || (!text && !body.responderUltima)) {
    return new Response("Requisição inválida.", { status: 400 });
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, body.projectId), eq(schema.projects.orgId, org.id)),
  });
  if (!project) return new Response("Projeto não encontrado.", { status: 404 });

  // Valida plano, saldo e chave ANTES de gravar qualquer coisa.
  const store = createGatewayStore(db);
  try {
    await authorize(store, { orgId: org.id, modelId: body.modelId, messages: [] });
  } catch (err) {
    if (err instanceof GatewayError) {
      const PAGAMENTO = ["insufficient_credits", "payment_overdue", "trial_ended", "subscription_required"];
      const status = PAGAMENTO.includes(err.code) ? 402 : err.code === "provider_unavailable" ? 503 : 403;
      return new Response(err.message, { status });
    }
    throw err;
  }

  if (body.responderUltima && !body.conversationId) return new Response("Requisição inválida.", { status: 400 });
  let conversation = body.conversationId
    ? await db.query.conversations.findFirst({
        where: and(eq(schema.conversations.id, body.conversationId), eq(schema.conversations.orgId, org.id)),
      })
    : undefined;
  if (!conversation && body.responderUltima) return new Response("Conversa não encontrada.", { status: 404 });
  if (!conversation) {
    [conversation] = await db
      .insert(schema.conversations)
      .values({
        orgId: org.id,
        projectId: project.id,
        title: text!.length > 60 ? `${text!.slice(0, 57)}…` : text!,
        modelId: body.modelId,
        createdBy: user.id,
      })
      .returning();
  }
  const conv = conversation!;

  if (!body.responderUltima) {
    await db.insert(schema.messages).values({ conversationId: conv.id, role: "user", content: text! });
  }

  const rows = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(asc(schema.messages.createdAt));
  const history: ChatMessage[] = rows.slice(-HISTORY_LIMIT).filter((m) => m.content.trim());
  while (history[0]?.role === "assistant") history.shift();
  // só responde se a última fala for do usuário (evita respostas duplicadas); uma resposta ainda
  // em geração (linha vazia) conta como resposta
  if (body.responderUltima && rows.at(-1)?.role !== "user") {
    return new Response("Nada a responder.", { status: 409 });
  }

  const call = body.modo === "call";
  const base = call ? callSystemPrompt(firstName(user.name)) : BASE_SYSTEM;
  // estrutura do repositório ligado ao projeto: um resumo curto (fica no prefixo em cache)
  const repo = project.repoSnapshot ? `\n\nRepositório do projeto: ${resumoDaEstrutura(project.repoSnapshot as unknown as EstruturaDoRepositorio)}` : "";
  const papel = !call && ehPersona(body.persona) ? `\n\n${instrucoesDaConversa(body.persona)}` : "";
  const system = (project.instructions ? `${base}\n\nInstruções do projeto:\n${project.instructions}` : base) + repo + papel;
  const effort = EFFORTS.includes(body.effort as Effort) ? (body.effort as Effort) : call ? "low" : undefined;
  const encoder = new TextEncoder();

  /*
   * A geração NÃO é ligada à conexão do navegador: se a pessoa interromper (botão parar, falar por
   * cima na call, fechar a aba), o modelo termina a resposta, que é salva na conversa e cobrada
   * pelo uso real informado pelo provedor. Cancelar no meio obrigaria a estimar tokens (raciocínio
   * e escrita de cache não aparecem no texto) e cobrar abaixo do custo. waitUntil mantém a função
   * viva depois que o cliente sai.
   */
  const projectId = project.id;
  // A linha da resposta nasce agora (vazia, fora do histórico) e é preenchida no fim: se a pessoa
  // mandar outra mensagem antes de esta resposta terminar, a ordem continua pergunta → resposta.
  const [linhaResposta] = await db
    .insert(schema.messages)
    .values({ conversationId: conv.id, role: "assistant", content: "" })
    .returning({ id: schema.messages.id });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      waitUntil(gerar(controller));
    },
  });

  async function gerar(controller: ReadableStreamDefaultController<Uint8Array>) {
      // Se o cliente desconectar, enqueue lança: ignoramos e seguimos até o gateway registrar o uso.
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // cliente saiu
        }
      };
      send({ type: "conversation", id: conv.id });
      let answer = "";
      try {
        for await (const event of runChat(
          { store },
          {
            orgId: org.id,
            userId: user.id,
            projectId,
            conversationId: conv.id,
            modelId: body.modelId!,
            system,
            messages: history,
            effort,
          },
        )) {
          if (event.type === "text") answer += event.text;
          if (event.type === "done") {
            await db
              .update(schema.messages)
              .set({
                content: answer || (event.refused ? "O modelo recusou esta solicitação." : ""),
                modelId: event.servedModel,
                usageEventId: event.usageEventId ?? null,
              })
              .where(eq(schema.messages.id, linhaResposta!.id));
            await db
              .update(schema.conversations)
              .set({ updatedAt: new Date(), modelId: body.modelId! })
              .where(eq(schema.conversations.id, conv.id));
            if (event.chargeBrlMicros > 0) {
              waitUntil(
                verificarSaldoBaixo(db, org.id).catch((e) =>
                  console.error(JSON.stringify({ level: "error", msg: "aviso de saldo falhou", err: String(e) })),
                ),
              );
            }
          }
          send(event);
        }
      } catch (err) {
        console.error("[chat]", err);
        send({ type: "error", code: "internal", message: "Erro interno. Tente novamente." });
      } finally {
        // sem resposta gravada (erro, recusa vazia): não deixa uma linha vazia na conversa
        await db
          .delete(schema.messages)
          .where(and(eq(schema.messages.id, linhaResposta!.id), eq(schema.messages.content, "")))
          .catch(() => undefined);
        try {
          controller.close();
        } catch {
          // já fechado pelo cliente
        }
      }
  }

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
