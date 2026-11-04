import { and, asc, consumeRateLimit, eq, schema } from "@forja/db";
import { EMPTY_SPEC, parseSpec, SPEC_SYSTEM_PROMPT, type CallSpec } from "@/lib/call";
import { collectChat } from "@/lib/gateway";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { getApiSession } from "@/lib/session";

export const runtime = "nodejs";

/** Atualiza a "especificação viva" da chamada com um modelo econômico (cobrado normalmente). */
export async function POST(request: Request) {
  const session = await getApiSession();
  if (!session) return Response.json({ error: "Não autenticado." }, { status: 401 });
  const { db, org, user, plan } = session;
  if (!user.emailVerified) return Response.json({ error: "Confirme seu e-mail." }, { status: 403 });
  const bruto = await request.text();
  if (bruto.length > 16_000) return Response.json({ error: "Especificação grande demais." }, { status: 413 });
  const body = JSON.parse(bruto || "{}") as { conversationId?: string; spec?: unknown };
  if (!body.conversationId) return Response.json({ error: "conversationId obrigatório." }, { status: 400 });
  if (!(await consumeRateLimit(db, `spec:${user.id}`, 30, 60))) {
    return Response.json({ error: "Muitas atualizações seguidas." }, { status: 429 });
  }

  const conversa = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, body.conversationId), eq(schema.conversations.orgId, org.id)),
  });
  if (!conversa) return Response.json({ error: "Conversa não encontrada." }, { status: 404 });

  const msgs = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversa.id))
    .orderBy(asc(schema.messages.createdAt));
  const transcricao = msgs
    .slice(-40)
    .map((m) => `${m.role === "user" ? "Cliente" : "Engenheiro"}: ${m.content.slice(0, 2_000)}`)
    .join("\n");

  // nunca confia no formato vindo do navegador: normaliza (listas e tamanhos limitados)
  const anterior: CallSpec = body.spec ? parseSpec(JSON.stringify(body.spec), EMPTY_SPEC) : EMPTY_SPEC;
  const modelos = await listModelOptions(db, plan?.allowedTiers ?? []);
  const modelId = defaultModelFor(modelos, ["claude-haiku-5-5", "gpt-6-luna", "gemini-3.1-flash-lite", "claude-sonnet-5-5"]);

  const r = await collectChat(db, {
    orgId: org.id,
    userId: user.id,
    projectId: conversa.projectId,
    conversationId: conversa.id,
    modelId,
    system: SPEC_SYSTEM_PROMPT,
    effort: "low",
    messages: [
      {
        role: "user",
        content: `Especificação anterior (JSON):\n${JSON.stringify(anterior)}\n\nTranscrição da reunião:\n${transcricao}\n\nDevolva a especificação atualizada.`,
      },
    ],
  });
  if (r.error) return Response.json({ error: r.error, spec: anterior }, { status: 503 });
  return Response.json({ spec: parseSpec(r.text, anterior), chargeBrlMicros: r.chargeBrlMicros });
}
