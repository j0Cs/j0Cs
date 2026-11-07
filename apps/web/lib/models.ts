import { retailBrlPerMTok, type ModelTier } from "@forja/core";
import { asc, eq, getPricingSettings, schema, toCatalogModel, type Db } from "@forja/db";

export interface ModelOption {
  id: string;
  displayName: string;
  providerId: string;
  tier: ModelTier;
  description: string;
  allowed: boolean;
  inputBrlPerMTok: number;
  outputBrlPerMTok: number;
  cacheReadBrlPerMTok: number;
}

/** Modelos habilitados, marcando quais o plano do cliente libera, com preço de tabela em R$. */
export async function listModelOptions(db: Db, allowedTiers: ModelTier[]): Promise<ModelOption[]> {
  const [rows, settings] = await Promise.all([
    db.select().from(schema.models).where(eq(schema.models.enabled, true)).orderBy(asc(schema.models.sortOrder)),
    getPricingSettings(db),
  ]);
  return rows.map(toCatalogModel).map((m) => ({
    id: m.id,
    displayName: m.displayName,
    providerId: m.providerId,
    tier: m.tier,
    description: m.description,
    allowed: allowedTiers.includes(m.tier),
    inputBrlPerMTok: retailBrlPerMTok(m.pricing.inputUsdMicrosPerMTok, settings, m.markupPercent),
    outputBrlPerMTok: retailBrlPerMTok(m.pricing.outputUsdMicrosPerMTok, settings, m.markupPercent),
    cacheReadBrlPerMTok: retailBrlPerMTok(m.pricing.cacheReadUsdMicrosPerMTok, settings, m.markupPercent),
  }));
}

/** Melhor modelo padrão liberado no plano (o teste grátis só tem os econômicos). */
export function defaultModelFor(models: ModelOption[], preferidos = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) {
  for (const id of preferidos) if (models.some((m) => m.id === id && m.allowed)) return id;
  return models.find((m) => m.allowed)?.id ?? preferidos[0]!;
}
