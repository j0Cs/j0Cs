import type { ChatMessage } from "@forja/core";
import { authorize, GatewayError, runChat, type Effort } from "@forja/core/server";
import { and, asc, createGatewayStore, eq, schema } from "@forja/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Instruções base: estáveis para aproveitar o cache de prompt. */
const BASE_SYSTEM = `Você é o assistente de engenharia de uma plataforma de criação de sistemas.
Responda em português do Brasil, de forma direta. Ao propor código, entregue arquivos completos
e explique como rodar. Quando faltar informação essencial, pergunte antes de supor.`;

const HISTORY_LIMIT = 40;
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh"];

export async function POST(request: Request) {
  const { db, org, user } = await getSession();
  const body = (await request.json()) as {
    projectId?: string;
    conversationId?: string | null;
    modelId?: string;
    effort?: string;
    message?: string;
  };
  const text = body.message?.trim();
  if (!body.projectId || !body.modelId || !text) {
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
      const status = err.code === "insufficient_credits" ? 402 : err.code === "provider_unavailable" ? 503 : 403;
      return new Response(err.message, { status });
    }
    throw err;
  }

  let conversation = body.conversationId
    ? await db.query.conversations.findFirst({
        where: and(eq(schema.conversations.id, body.conversationId), eq(schema.conversations.orgId, org.id)),
      })
    : undefined;
  if (!conversation) {
    [conversation] = await db
      .insert(schema.conversations)
      .values({
        orgId: org.id,
        projectId: project.id,
        title: text.length > 60 ? `${text.slice(0, 57)}…` : text,
        modelId: body.modelId,
        createdBy: user.id,
      })
      .returning();
  }
  const conv = conversation!;

  await db.insert(schema.messages).values({ conversationId: conv.id, role: "user", content: text });

  const rows = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(asc(schema.messages.createdAt));
  const history: ChatMessage[] = rows.slice(-HISTORY_LIMIT).filter((m) => m.content.trim());
  while (history[0]?.role === "assistant") history.shift();

  const system = project.instructions ? `${BASE_SYSTEM}\n\nInstruções do projeto:\n${project.instructions}` : BASE_SYSTEM;
  const effort = EFFORTS.includes(body.effort as Effort) ? (body.effort as Effort) : undefined;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "conversation", id: conv.id });
      let answer = "";
      try {
        for await (const event of runChat(
          { store },
          {
            orgId: org.id,
            userId: user.id,
            projectId: project.id,
            conversationId: conv.id,
            modelId: body.modelId!,
            system,
            messages: history,
            effort,
            signal: request.signal,
          },
        )) {
          if (event.type === "text") answer += event.text;
          if (event.type === "done") {
            await db.insert(schema.messages).values({
              conversationId: conv.id,
              role: "assistant",
              content: answer || (event.refused ? "O modelo recusou esta solicitação." : ""),
              modelId: event.servedModel,
              usageEventId: event.usageEventId ?? null,
            });
            await db
              .update(schema.conversations)
              .set({ updatedAt: new Date(), modelId: body.modelId! })
              .where(eq(schema.conversations.id, conv.id));
          }
          send(event);
        }
      } catch (err) {
        console.error("[chat]", err);
        send({ type: "error", code: "internal", message: "Erro interno. Tente novamente." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
