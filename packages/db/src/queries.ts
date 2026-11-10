import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "./client";
import { models, organizations, plans, subscriptions, usageEvents } from "./schema";

export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

const sumInt = (col: unknown) => sql<number>`coalesce(sum(${col}), 0)::bigint`.mapWith(Number);
const countInt = () => sql<number>`count(*)::int`.mapWith(Number);

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export async function orgUsageByModel(db: Db, orgId: string, since: Date) {
  return db
    .select({
      modelId: usageEvents.modelId,
      displayName: models.displayName,
      requests: countInt(),
      inputTokens: sumInt(usageEvents.inputTokens),
      cacheReadTokens: sumInt(usageEvents.cacheReadTokens),
      cacheWriteTokens: sumInt(usageEvents.cacheWriteTokens),
      outputTokens: sumInt(usageEvents.outputTokens),
      chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros),
    })
    .from(usageEvents)
    .leftJoin(models, eq(models.id, usageEvents.modelId))
    .where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.createdAt, since)))
    .groupBy(usageEvents.modelId, models.displayName)
    .orderBy(desc(sumInt(usageEvents.chargeBrlMicros)));
}

export async function orgDailySpend(db: Db, orgId: string, since: Date) {
  const day = sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`;
  return db
    .select({ day, chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros), requests: countInt() })
    .from(usageEvents)
    .where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.createdAt, since)))
    .groupBy(day)
    .orderBy(day);
}

export async function orgRecentUsage(db: Db, orgId: string, limit = 20) {
  return db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.orgId, orgId))
    .orderBy(desc(usageEvents.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Dono da plataforma
// ---------------------------------------------------------------------------

export async function platformOverview(db: Db, since: Date) {
  const [usage] = await db
    .select({
      requests: countInt(),
      costUsdMicros: sumInt(usageEvents.costUsdMicros),
      chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros),
      errors: sql<number>`count(*) filter (where ${usageEvents.status} = 'error')::int`.mapWith(Number),
      activeOrgs: sql<number>`count(distinct ${usageEvents.orgId})::int`.mapWith(Number),
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since));

  const [mrr] = await db
    .select({
      mrrBrlCents: sql<number>`coalesce(sum(${plans.priceBrlCents} * ${subscriptions.seats}), 0)::bigint`.mapWith(Number),
      subscriptions: countInt(),
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.status, "active"));

  const [orgs] = await db.select({ total: countInt() }).from(organizations);

  return {
    requests: usage?.requests ?? 0,
    costUsdMicros: usage?.costUsdMicros ?? 0,
    chargeBrlMicros: usage?.chargeBrlMicros ?? 0,
    errors: usage?.errors ?? 0,
    activeOrgs: usage?.activeOrgs ?? 0,
    mrrBrlCents: mrr?.mrrBrlCents ?? 0,
    activeSubscriptions: mrr?.subscriptions ?? 0,
    totalOrgs: orgs?.total ?? 0,
  };
}

export async function platformCostByProvider(db: Db, since: Date) {
  return db
    .select({
      providerId: usageEvents.providerId,
      requests: countInt(),
      costUsdMicros: sumInt(usageEvents.costUsdMicros),
      chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros),
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since))
    .groupBy(usageEvents.providerId)
    .orderBy(desc(sumInt(usageEvents.costUsdMicros)));
}

export async function platformCostByModel(db: Db, since: Date) {
  return db
    .select({
      modelId: usageEvents.modelId,
      requests: countInt(),
      inputTokens: sumInt(usageEvents.inputTokens),
      cacheReadTokens: sumInt(usageEvents.cacheReadTokens),
      outputTokens: sumInt(usageEvents.outputTokens),
      costUsdMicros: sumInt(usageEvents.costUsdMicros),
      chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros),
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since))
    .groupBy(usageEvents.modelId)
    .orderBy(desc(sumInt(usageEvents.costUsdMicros)));
}

export async function platformOrgs(db: Db, since: Date) {
  const usage = db
    .select({
      orgId: usageEvents.orgId,
      costUsdMicros: sumInt(usageEvents.costUsdMicros).as("cost_usd_micros"),
      chargeBrlMicros: sumInt(usageEvents.chargeBrlMicros).as("charge_brl_micros"),
      requests: countInt().as("requests"),
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since))
    .groupBy(usageEvents.orgId)
    .as("u");

  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      planName: plans.name,
      planPriceBrlCents: plans.priceBrlCents,
      balanceBrlMicros: organizations.creditBalanceBrlMicros,
      costUsdMicros: sql<number>`coalesce(${usage.costUsdMicros}, 0)`.mapWith(Number),
      chargeBrlMicros: sql<number>`coalesce(${usage.chargeBrlMicros}, 0)`.mapWith(Number),
      requests: sql<number>`coalesce(${usage.requests}, 0)`.mapWith(Number),
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .leftJoin(plans, eq(plans.id, organizations.planId))
    .leftJoin(usage, eq(usage.orgId, organizations.id))
    .orderBy(desc(sql`coalesce(${usage.costUsdMicros}, 0)`));
}
