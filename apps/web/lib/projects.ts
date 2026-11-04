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
): Promise<{ id: string; criado: boolean } | { erro: string }> {
  if (projetoId && projetoId !== "nova") {
    const existente = await db.query.projects.findFirst({
      where: and(eq(schema.projects.id, projetoId), eq(schema.projects.orgId, ctx.orgId), isNull(schema.projects.archivedAt)),
    });
    if (existente) return { id: existente.id, criado: false };
  }
  const r = await criarProjetoNoLimite(db, ctx, { orgId: ctx.orgId, name: titulo(nomeSugerido), createdBy: ctx.userId });
  return "erro" in r ? { erro: `${r.erro} Escolha um projeto existente ou arquive um.` } : { id: r.id, criado: true };
}

/**
 * Cria um projeto respeitando o limite do plano, com trava por organização: requisições
 * simultâneas (duas abas, um script) não furam o limite. Use em TODO lugar que cria projeto.
 */
export async function criarProjetoNoLimite(
  db: Db,
  ctx: { orgId: string; maxProjects: number | null | undefined },
  valores: typeof schema.projects.$inferInsert,
): Promise<{ id: string } | { erro: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.orgId}))`);
    if (ctx.maxProjects != null) {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.projects)
        .where(and(eq(schema.projects.orgId, ctx.orgId), isNull(schema.projects.archivedAt)));
      if ((row?.n ?? 0) >= ctx.maxProjects) return { erro: `Seu plano permite ${ctx.maxProjects} projetos ativos.` };
    }
    const [novo] = await tx.insert(schema.projects).values({ ...valores, orgId: ctx.orgId }).returning({ id: schema.projects.id });
    return { id: novo!.id };
  });
}
