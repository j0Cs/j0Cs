import {
  DEFAULT_ECONOMICS,
  DEFAULT_PRICING_SETTINGS,
  type CatalogModel,
  type PlanEconomicsAssumptions,
  type PricingSettings,
} from "@forja/core";
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { models, settings } from "./schema";

export const PRICING_SETTINGS_KEY = "pricing";
export const ECONOMICS_SETTINGS_KEY = "economics";

export function toCatalogModel(row: typeof models.$inferSelect): CatalogModel {
  return {
    id: row.id,
    providerId: row.providerId,
    displayName: row.displayName,
    tier: row.tier,
    description: row.description,
    contextWindow: row.contextWindow,
    pricing: row.pricing,
    markupPercent: row.markupPercent,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

export async function getPricingSettings(db: Db): Promise<PricingSettings> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, PRICING_SETTINGS_KEY) });
  return { ...DEFAULT_PRICING_SETTINGS, ...((row?.value as Partial<PricingSettings> | undefined) ?? {}) };
}

export async function savePricingSettings(db: Db, value: PricingSettings) {
  await db
    .insert(settings)
    .values({ key: PRICING_SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function getEconomics(db: Db): Promise<PlanEconomicsAssumptions> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, ECONOMICS_SETTINGS_KEY) });
  return { ...DEFAULT_ECONOMICS, ...((row?.value as Partial<PlanEconomicsAssumptions> | undefined) ?? {}) };
}

export async function saveEconomics(db: Db, value: PlanEconomicsAssumptions) {
  await db
    .insert(settings)
    .values({ key: ECONOMICS_SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
