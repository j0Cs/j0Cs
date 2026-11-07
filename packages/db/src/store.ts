import { bloqueioDaOrg, PROVIDERS, type ModelTier } from "@forja/core";
import { decryptSecret, type GatewayStore, type ProviderKeyCandidate } from "@forja/core/server";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db, Tx } from "./client";
import { getPricingSettings, toCatalogModel } from "./mappers";
import { chavesDoSupabase } from "./segredos-supabase";
import { creditLedger, models, organizations, plans, providerKeys, usageEvents } from "./schema";

/** Implementação do GatewayStore sobre Postgres. */
export function createGatewayStore(db: Db): GatewayStore {
  return {
    async getModel(id) {
      const row = await db.query.models.findFirst({ where: eq(models.id, id) });
      return row ? toCatalogModel(row) : null;
    },

    getSettings: () => getPricingSettings(db),

    async getOrgAccess(orgId) {
      const [row] = await db
        .select({
          status: organizations.status,
          suspendedReason: organizations.suspendedReason,
          planId: organizations.planId,
          trialEndsAt: organizations.trialEndsAt,
          pastDueSince: organizations.pastDueSince,
          balance: organizations.creditBalanceBrlMicros,
          allowedTiers: plans.allowedTiers,
        })
        .from(organizations)
        .leftJoin(plans, eq(plans.id, organizations.planId))
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!row) return null;
      return {
        status: row.status,
        balanceBrlMicros: row.balance,
        allowedTiers: (row.allowedTiers ?? []) as ModelTier[],
        bloqueio: bloqueioDaOrg(row),
      };
    },

    async listProviderKeys(providerId, orgId) {
      const rows = await db
        .select()
        .from(providerKeys)
        .where(and(eq(providerKeys.providerId, providerId), eq(providerKeys.status, "active")))
        .orderBy(asc(providerKeys.priority), asc(providerKeys.createdAt));

      const byok = rows.filter((r) => r.orgId === orgId);
      const platform = rows.filter((r) => r.orgId === null);
      const candidates: ProviderKeyCandidate[] = [
        ...byok.map((r) => ({ id: r.id, apiKey: decryptSecret(r.encryptedKey), byok: true })),
        // chaves da plataforma: Secrets do Supabase (CLAUDE_KEY, OPENAI_KEY, GEMINI_API, GROK_API)
        ...(await chavesDoSupabase(providerId)).map((c) => ({ id: c.id, apiKey: c.secret })),
        ...platform.map((r) => ({ id: r.id, apiKey: decryptSecret(r.encryptedKey) })),
      ];

      // Em desenvolvimento, aceita a chave do .env para testar sem cadastrar no painel.
      const envKey = process.env[PROVIDERS[providerId].envKey];
      if (candidates.length === 0 && envKey && process.env.NODE_ENV !== "production") {
        candidates.push({ id: null, apiKey: envKey });
      }
      return candidates;
    },

    async recordUsage(r) {
      return db.transaction(async (tx) => {
        const [event] = await tx
          .insert(usageEvents)
          .values({
            orgId: r.orgId,
            userId: r.userId,
            projectId: r.projectId,
            conversationId: r.conversationId,
            modelId: r.modelId,
            servedModelId: r.servedModelId,
            providerId: r.providerId,
            providerKeyId: r.providerKeyId,
            inputTokens: r.usage.inputTokens,
            cacheReadTokens: r.usage.cacheReadTokens,
            cacheWriteTokens: r.usage.cacheWriteTokens,
            outputTokens: r.usage.outputTokens,
            costUsdMicros: r.costUsdMicros,
            chargeBrlMicros: r.chargeBrlMicros,
            pricingSnapshot: r.pricingSnapshot,
            latencyMs: r.latencyMs,
            status: r.status,
            errorMessage: r.errorMessage ?? null,
          })
          .returning({ id: usageEvents.id });

        if (r.providerKeyId) {
          await tx.update(providerKeys).set({ lastUsedAt: new Date() }).where(eq(providerKeys.id, r.providerKeyId));
        }

        if (r.chargeBrlMicros > 0) {
          await tx.insert(creditLedger).values({
            orgId: r.orgId,
            amountBrlMicros: -r.chargeBrlMicros,
            kind: "usage",
            referenceId: event!.id,
            description: `Uso: ${r.modelId}`,
          });
        }

        const [org] = await tx
          .update(organizations)
          .set({ creditBalanceBrlMicros: sql`${organizations.creditBalanceBrlMicros} - ${r.chargeBrlMicros}` })
          .where(eq(organizations.id, r.orgId))
          .returning({ balance: organizations.creditBalanceBrlMicros });

        return { balanceBrlMicros: org?.balance ?? 0, usageEventId: event!.id };
      });
    },
  };
}

/** Lança créditos no extrato e atualiza o saldo (recarga, bônus, ajuste, estorno). */
export async function addCredits(
  db: Db | Tx,
  input: {
    orgId: string;
    amountBrlMicros: number;
    kind: "plan_grant" | "topup" | "adjustment" | "refund" | "expiry";
    description: string;
    referenceId?: string;
    createdBy?: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.insert(creditLedger).values({
      orgId: input.orgId,
      amountBrlMicros: input.amountBrlMicros,
      kind: input.kind,
      description: input.description,
      referenceId: input.referenceId ?? null,
      createdBy: input.createdBy ?? null,
    });
    const [org] = await tx
      .update(organizations)
      .set({
        creditBalanceBrlMicros: sql`${organizations.creditBalanceBrlMicros} + ${input.amountBrlMicros}`,
        // entrou crédito: o aviso de saldo baixo pode ser enviado de novo
        ...(input.amountBrlMicros > 0 ? { lowBalanceNotified: null } : {}),
      })
      .where(eq(organizations.id, input.orgId))
      .returning({ balance: organizations.creditBalanceBrlMicros });
    return org?.balance ?? 0;
  });
}


/**
 * Lança créditos UMA vez por referência (fatura, recarga, reembolso, expiração): repetir com a
 * mesma referência não duplica (índice único credit_ledger_referencia_unica). Devolve se lançou.
 */
export async function addCreditsOnce(
  db: Db | Tx,
  input: {
    orgId: string;
    amountBrlMicros: number;
    kind: "plan_grant" | "topup" | "refund" | "expiry";
    description: string;
    referenceId: string;
  },
): Promise<{ lancado: boolean; saldo: number }> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(creditLedger)
      .values({
        orgId: input.orgId,
        amountBrlMicros: input.amountBrlMicros,
        kind: input.kind,
        description: input.description,
        referenceId: input.referenceId,
      })
      .onConflictDoNothing()
      .returning({ id: creditLedger.id });
    if (!linha) {
      const [org] = await tx
        .select({ balance: organizations.creditBalanceBrlMicros })
        .from(organizations)
        .where(eq(organizations.id, input.orgId));
      return { lancado: false, saldo: org?.balance ?? 0 };
    }
    const [org] = await tx
      .update(organizations)
      .set({
        creditBalanceBrlMicros: sql`${organizations.creditBalanceBrlMicros} + ${input.amountBrlMicros}`,
        ...(input.amountBrlMicros > 0 ? { lowBalanceNotified: null } : {}),
      })
      .where(eq(organizations.id, input.orgId))
      .returning({ balance: organizations.creditBalanceBrlMicros });
    return { lancado: true, saldo: org?.balance ?? 0 };
  });
}
