"use server";

import { and, consumeRateLimit, eq, schema } from "@forja/db";
import { criarFonte, revogarFonte } from "@forja/insights";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";

const FERRAMENTAS = ["claude_code", "codex", "gemini_cli"] as const;

/**
 * Cria a fonte de telemetria para o app desktop gravar na configuração da ferramenta. O token volta
 * uma vez só; se a pessoa cancelar a confirmação no app, a fonte é revogada (descartarFonteAction).
 */
export async function criarFonteDoDesktopAction(tool: string, label: string): Promise<{ id?: string; token?: string; erro?: string }> {
  const { db, org, user } = await getSession();
  const ferramenta = FERRAMENTAS.find((f) => f === tool);
  if (!ferramenta) return { erro: "Ferramenta desconhecida." };
  if (!(await consumeRateLimit(db, `assistentes:fonte:${org.id}`, 30, 3600))) return { erro: "Muitas fontes criadas na última hora." };
  try {
    const { fonte, token } = await criarFonte(db, { orgId: org.id, userId: user.id, tool: ferramenta, label });
    revalidatePath("/assistentes");
    return { id: fonte.id, token };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui criar a fonte." };
  }
}

export async function descartarFonteAction(id: string) {
  const { db, org, user } = await getSession();
  const fonte = await db.query.aiTelemetrySources.findFirst({
    where: and(eq(schema.aiTelemetrySources.id, id), eq(schema.aiTelemetrySources.orgId, org.id), eq(schema.aiTelemetrySources.createdBy, user.id)),
  });
  if (!fonte) return;
  await revogarFonte(db, org.id, id);
  revalidatePath("/assistentes");
}
