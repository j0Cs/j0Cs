import { and, eq, isNull, schema, sql, type Db } from "@forja/db";

const titulo = (texto: string) => {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > 48 ? `${t.slice(0, 45)}…` : t || "Nova ideia";
};

/**
 * Usa o projeto escolhido (se for da organização) ou cria um novo, respeitando o
 * limite de projetos do plano. Não redireciona: quem chama decide o que fazer com o erro.
 */
export async function garantirProjeto(
  db: Db,
  ctx: { orgId: string; userId: string; maxProjects: number | null | undefined },
  projetoId: string,
  nomeSugerido: string,
): Promise<{ id: string } | { erro: string }> {
  if (projetoId && projetoId !== "nova") {
    const existente = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projetoId), eq(schema.projects.orgId, ctx.orgId), isNull(schema.projects.archivedAt)),
    });
    if (existente) return { id: existente.id };
  }
  if (ctx.maxProjects != null) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, ctx.orgId), isNull(schema.projects.archivedAt)));
    if ((row?.n ?? 0) >= ctx.maxProjects) {
      return { erro: `Seu plano permite ${ctx.maxProjects} projetos ativos. Escolha um projeto existente ou arquive um.` };
    }
  }
  const [novo] = await db
    .insert(schema.projects)
    .values({ orgId: ctx.orgId, name: titulo(nomeSugerido), createdBy: ctx.userId })
    .returning({ id: schema.projects.id });
  return { id: novo!.id };
}
