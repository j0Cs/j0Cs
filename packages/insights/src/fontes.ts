/**
 * Fontes de telemetria (uma por ferramenta) e o uso recebido. O token de envio aparece uma vez só;
 * no banco fica o SHA-256.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNull, lt, schema, sql, type Db } from "@forja/db";
import { FERRAMENTAS, normalizar, type Ferramenta } from "./ferramentas";
import type { RegistroOtlp } from "./otlp";
import { recomendar, type UsoAgregado } from "./recomendacoes";

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");
const PREFIXO = "fj_otlp_";

export const ehFerramenta = (v: string): v is Ferramenta => Object.hasOwn(FERRAMENTAS, v);

export async function criarFonte(db: Db, p: { orgId: string; userId: string; tool: Ferramenta; label?: string }) {
  const ativas = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.aiTelemetrySources)
    .where(and(eq(schema.aiTelemetrySources.orgId, p.orgId), isNull(schema.aiTelemetrySources.revokedAt)));
  if ((ativas[0]?.n ?? 0) >= 50) throw new Error("Limite de 50 fontes ativas por organização.");
  const token = `${PREFIXO}${randomBytes(24).toString("base64url")}`;
  const [fonte] = await db
    .insert(schema.aiTelemetrySources)
    .values({
      orgId: p.orgId,
      createdBy: p.userId,
      tool: p.tool,
      label: (p.label ?? "").trim().slice(0, 80) || FERRAMENTAS[p.tool].nome,
      tokenHash: hashDoToken(token),
      tokenHint: token.slice(-4),
    })
    .returning();
  return { fonte: fonte!, token };
}

export async function revogarFonte(db: Db, orgId: string, id: string) {
  await db
    .update(schema.aiTelemetrySources)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.aiTelemetrySources.id, id), eq(schema.aiTelemetrySources.orgId, orgId), isNull(schema.aiTelemetrySources.revokedAt)));
}

/** Fonte ativa dona deste token (ou null). */
export async function fonteDoToken(db: Db, token: string) {
  if (!token.startsWith(PREFIXO) || token.length > 100) return null;
  const fonte = await db.query.aiTelemetrySources.findFirst({
    where: and(eq(schema.aiTelemetrySources.tokenHash, hashDoToken(token)), isNull(schema.aiTelemetrySources.revokedAt)),
  });
  return fonte ?? null;
}

/** Grava as requisições do lote (repetidas não contam de novo). */
export async function ingerir(db: Db, fonte: typeof schema.aiTelemetrySources.$inferSelect, registros: RegistroOtlp[], agora = Date.now()) {
  const tool = fonte.tool as Ferramenta;
  const usos = registros.map((r) => normalizar(tool, r, agora)).filter((u): u is NonNullable<typeof u> => Boolean(u));
  let gravados = 0;
  for (let i = 0; i < usos.length; i += 500) {
    const lote = usos.slice(i, i + 500);
    const r = await db
      .insert(schema.aiUsageEvents)
      .values(lote.map((u) => ({ ...u, orgId: fonte.orgId, sourceId: fonte.id, tool })))
      .onConflictDoNothing()
      .returning({ id: schema.aiUsageEvents.id });
    gravados += r.length;
  }
  await db.update(schema.aiTelemetrySources).set({ lastSeenAt: new Date(agora) }).where(eq(schema.aiTelemetrySources.id, fonte.id));
  return { recebidos: registros.length, requisicoes: usos.length, gravados };
}

/** Uso dos últimos `dias` dias: por ferramenta e modelo, por dia, por pessoa, e as recomendações. */
export async function resumoDeUso(db: Db, orgId: string, dias = 30, agora = new Date()) {
  const desde = new Date(agora.getTime() - dias * 86_400_000);
  const filtro = and(eq(schema.aiUsageEvents.orgId, orgId), gte(schema.aiUsageEvents.occurredAt, desde));
  const e = schema.aiUsageEvents;
  const porModelo = await db
    .select({
      tool: e.tool,
      model: e.model,
      requisicoes: sql<number>`count(*)::int`,
      inputTokens: sql<string>`coalesce(sum(${e.inputTokens}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${e.outputTokens}), 0)`,
      cacheReadTokens: sql<string>`coalesce(sum(${e.cacheReadTokens}), 0)`,
      cacheWriteTokens: sql<string>`coalesce(sum(${e.cacheWriteTokens}), 0)`,
      reasoningTokens: sql<string>`coalesce(sum(${e.reasoningTokens}), 0)`,
      costUsdMicros: sql<string>`coalesce(sum(${e.costUsdMicros}), 0)`,
      subagente: sql<number>`count(*) filter (where ${e.querySource} = 'subagent')::int`,
    })
    .from(e)
    .where(filtro)
    .groupBy(e.tool, e.model)
    .orderBy(desc(sql`count(*)`));
  const usos: UsoAgregado[] = porModelo.map((r) => ({
    tool: r.tool as Ferramenta,
    model: r.model,
    requisicoes: r.requisicoes,
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    cacheReadTokens: Number(r.cacheReadTokens),
    cacheWriteTokens: Number(r.cacheWriteTokens),
    reasoningTokens: Number(r.reasoningTokens),
    costUsdMicros: Number(r.costUsdMicros),
    subagente: r.subagente,
  }));
  const porDia = await db
    .select({
      dia: sql<string>`to_char(${e.occurredAt} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
      tokens: sql<string>`coalesce(sum(${e.inputTokens} + ${e.outputTokens} + ${e.cacheReadTokens} + ${e.cacheWriteTokens}), 0)`,
      costUsdMicros: sql<string>`coalesce(sum(${e.costUsdMicros}), 0)`,
      requisicoes: sql<number>`count(*)::int`,
    })
    .from(e)
    .where(filtro)
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const porPessoa = await db
    .select({
      actor: e.actor,
      requisicoes: sql<number>`count(*)::int`,
      tokens: sql<string>`coalesce(sum(${e.inputTokens} + ${e.outputTokens} + ${e.cacheReadTokens} + ${e.cacheWriteTokens}), 0)`,
      costUsdMicros: sql<string>`coalesce(sum(${e.costUsdMicros}), 0)`,
    })
    .from(e)
    .where(filtro)
    .groupBy(e.actor)
    .orderBy(desc(sql`count(*)`))
    .limit(20);
  return {
    usos,
    porDia: porDia.map((d) => ({ dia: d.dia, tokens: Number(d.tokens), costUsdMicros: Number(d.costUsdMicros), requisicoes: d.requisicoes })),
    porPessoa: porPessoa.map((p) => ({ actor: p.actor, requisicoes: p.requisicoes, tokens: Number(p.tokens), costUsdMicros: Number(p.costUsdMicros) })),
    recomendacoes: recomendar(usos),
  };
}

/** Retenção: uso com mais de 180 dias sai (rotina diária). */
export async function limparUsoAntigo(db: Db, agora = new Date()) {
  const limite = new Date(agora.getTime() - 180 * 86_400_000);
  const r = await db.delete(schema.aiUsageEvents).where(lt(schema.aiUsageEvents.occurredAt, limite)).returning({ id: schema.aiUsageEvents.id });
  return r.length;
}
