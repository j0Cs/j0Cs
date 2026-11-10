import { and, desc, eq, gte, inArray, schema, sql, type Db } from "@forja/db";

/** Números e listas da tela Cobrança do painel do dono (tudo do espelho local, sem chamar o Stripe). */
export async function resumoDoPainel(db: Db) {
  const p = schema.payments;
  const s = schema.subscriptions;
  const o = schema.organizations;
  const trintaDias = sql`now() - interval '30 days'`;

  const [assinaturas, porMes, falhas, recentes] = await Promise.all([
    db
      .select({ sub: s, org: o.name, orgStatus: o.status })
      .from(s)
      .innerJoin(o, eq(o.id, s.orgId))
      .where(and(eq(s.billingProvider, "stripe"), inArray(s.status, ["active", "past_due", "incomplete"])))
      .orderBy(desc(s.amountBrlCents)),
    db
      .select({
        mes: sql<string>`to_char(date_trunc('month', ${p.paidAt} at time zone 'America/Sao_Paulo'), 'YYYY-MM')`,
        assinaturas: sql<number>`coalesce(sum(${p.amountBrlCents}) filter (where ${p.kind} = 'assinatura'), 0)::int`,
        recargas: sql<number>`coalesce(sum(${p.amountBrlCents}) filter (where ${p.kind} = 'recarga'), 0)::int`,
        reembolsos: sql<number>`coalesce(sum(${p.refundedBrlCents}), 0)::int`,
        pagamentos: sql<number>`count(*)::int`,
      })
      .from(p)
      .where(and(inArray(p.status, ["paid", "refunded", "partially_refunded"]), gte(p.paidAt, sql`now() - interval '12 months'`)))
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`),
    db
      .select({ pagamento: p, org: o.name })
      .from(p)
      .innerJoin(o, eq(o.id, p.orgId))
      .where(and(inArray(p.status, ["failed", "pending"]), gte(p.createdAt, trintaDias)))
      .orderBy(desc(p.createdAt))
      .limit(50),
    db
      .select({ pagamento: p, org: o.name })
      .from(p)
      .innerJoin(o, eq(o.id, p.orgId))
      .where(inArray(p.status, ["paid", "refunded", "partially_refunded"]))
      .orderBy(desc(p.paidAt))
      .limit(30),
  ]);

  const ativas = assinaturas.filter((a) => a.sub.status === "active" || a.sub.status === "past_due");
  const mesAtual = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const doMes = porMes.find((m) => m.mes === mesAtual);
  return {
    mrrCentavos: ativas.reduce((t, a) => t + a.sub.amountBrlCents, 0),
    assinantes: ativas.length,
    emAtraso: ativas.filter((a) => a.sub.status === "past_due").length,
    receitaDoMesCentavos: doMes ? doMes.assinaturas + doMes.recargas - doMes.reembolsos : 0,
    falhas30Dias: falhas.filter((f) => f.pagamento.status === "failed").length,
    assinaturas,
    porMes,
    falhas,
    recentes,
  };
}
