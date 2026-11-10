import { CARENCIA_INADIMPLENCIA_DIAS, TRIAL_PLAN_ID } from "@forja/core";
import { and, eq, inArray, lt, schema, sql, type Db } from "@forja/db";
import { avisarFimDoTeste, avisarSuspensao } from "./avisos";

/**
 * Rotina diária (Vercel Cron, compatível com o Hobby). O bloqueio em si já vale na hora pela
 * regra de acesso (bloqueioDaOrg); aqui fica o registro e o e-mail, uma vez por organização.
 */
export async function rotinaDiariaDeCobranca(db: Db) {
  // 1) inadimplência: 3 dias depois da primeira recusa, suspende (o pagamento reativa sozinho)
  const suspensas = await db
    .update(schema.organizations)
    .set({ status: "suspended", suspendedReason: "inadimplencia" })
    .where(
      and(
        eq(schema.organizations.status, "active"),
        lt(schema.organizations.pastDueSince, sql`now() - make_interval(days => ${CARENCIA_INADIMPLENCIA_DIAS})`),
      ),
    )
    .returning({ id: schema.organizations.id });

  // 2) teste grátis vencido: encerra a assinatura de teste e avisa quem não assinou
  const testes = await db
    .update(schema.subscriptions)
    .set({ status: "canceled" })
    .where(
      and(
        eq(schema.subscriptions.planId, TRIAL_PLAN_ID),
        eq(schema.subscriptions.status, "trialing"),
        lt(schema.subscriptions.currentPeriodEnd, sql`now()`),
      ),
    )
    .returning({ orgId: schema.subscriptions.orgId });
  const aindaNoTeste = testes.length
    ? await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations)
        .where(
          and(
            inArray(
              schema.organizations.id,
              testes.map((t) => t.orgId),
            ),
            eq(schema.organizations.planId, TRIAL_PLAN_ID),
          ),
        )
    : [];

  for (const o of suspensas) await avisarSuspensao(db, o.id);
  for (const o of aindaNoTeste) await avisarFimDoTeste(db, o.id);
  return { suspensas: suspensas.length, testesEncerrados: testes.length, avisosDeFimDoTeste: aindaNoTeste.length };
}
