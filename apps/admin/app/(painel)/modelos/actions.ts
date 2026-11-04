"use server";

import { ALL_TIERS, DEFAULT_MARKUP_BY_TIER, usd, type ModelTier, type ProviderId } from "@forja/core";
import { eq, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { adminDb, num, requireStaff } from "@/lib/admin";

const tierOf = (v: FormDataEntryValue | null): ModelTier =>
  ALL_TIERS.includes(String(v) as ModelTier) ? (String(v) as ModelTier) : "intermediario";

export async function updateModel(formData: FormData) {
  await requireStaff();
  const db = await adminDb();
  const id = String(formData.get("id"));
  const current = await db.query.models.findFirst({ where: eq(schema.models.id, id) });
  if (!current) return;
  await db
    .update(schema.models)
    .set({
      displayName: String(formData.get("displayName") || current.displayName),
      tier: tierOf(formData.get("tier")),
      markupPercent: Math.round(num(formData.get("markupPercent"), current.markupPercent)),
      enabled: formData.get("enabled") === "on",
      pricing: {
        ...current.pricing,
        inputUsdMicrosPerMTok: usd(num(formData.get("input"))),
        cacheReadUsdMicrosPerMTok: usd(num(formData.get("cacheRead"))),
        cacheWriteUsdMicrosPerMTok: usd(num(formData.get("cacheWrite"))),
        outputUsdMicrosPerMTok: usd(num(formData.get("output"))),
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.models.id, id));
  revalidatePath("/modelos");
}

export async function createModel(formData: FormData) {
  await requireStaff();
  const tier = tierOf(formData.get("tier"));
  const input = num(formData.get("input"));
  await (await adminDb())
    .insert(schema.models)
    .values({
      id: String(formData.get("id")).trim(),
      providerId: String(formData.get("providerId")) as ProviderId,
      displayName: String(formData.get("displayName")).trim(),
      tier,
      description: String(formData.get("description") ?? ""),
      markupPercent: DEFAULT_MARKUP_BY_TIER[tier],
      enabled: false,
      sortOrder: 500,
      pricing: {
        inputUsdMicrosPerMTok: usd(input),
        cacheReadUsdMicrosPerMTok: usd(num(formData.get("cacheRead"), input)),
        cacheWriteUsdMicrosPerMTok: usd(num(formData.get("cacheWrite"), input)),
        outputUsdMicrosPerMTok: usd(num(formData.get("output"))),
      },
    })
    .onConflictDoNothing();
  revalidatePath("/modelos");
}
