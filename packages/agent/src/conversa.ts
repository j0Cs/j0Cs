import { eq, schema, type Db } from "@forja/db";

/** Mensagem da Forja na conversa de onde a tarefa saiu (aparece no chat do projeto). */
export async function avisarNaConversa(db: Db, conversationId: string | null, texto: string) {
  if (!conversationId) return;
  await db.insert(schema.messages).values({ conversationId, role: "assistant", content: texto });
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));
}
