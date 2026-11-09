"use server";

import { webUrl } from "@forja/auth";
import { and, consumeRateLimit, eq, schema } from "@forja/db";
import { configuracao, criarFonte, ehFerramenta, revogarFonte, type Configuracao } from "@forja/insights";
import { revalidatePath } from "next/cache";
import { canManage, getSession } from "@/lib/session";

/** Gera a fonte e devolve a configuração com o token (mostrado uma vez só). */
export async function criarFonteAction(tool: string, label: string): Promise<{ erro?: string; config?: Configuracao }> {
  const { db, org, user } = await getSession();
  if (!ehFerramenta(tool)) return { erro: "Ferramenta desconhecida." };
  if (!(await consumeRateLimit(db, `assistentes:fonte:${org.id}`, 30, 3600))) return { erro: "Muitas fontes criadas na última hora." };
  try {
    const { token } = await criarFonte(db, { orgId: org.id, userId: user.id, tool, label });
    revalidatePath("/assistentes");
    return { config: configuracao(tool, webUrl(), token) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui criar a fonte." };
  }
}

/** Revoga: quem criou ou um dono/administrador. O token para de funcionar na hora. */
export async function revogarFonteAction(f: FormData) {
  const { db, org, user, role } = await getSession();
  const id = String(f.get("id") ?? "");
  const fonte = await db.query.aiTelemetrySources.findFirst({
    where: and(eq(schema.aiTelemetrySources.id, id), eq(schema.aiTelemetrySources.orgId, org.id)),
  });
  if (!fonte || (fonte.createdBy !== user.id && !canManage(role))) return;
  await revogarFonte(db, org.id, id);
  revalidatePath("/assistentes");
}
