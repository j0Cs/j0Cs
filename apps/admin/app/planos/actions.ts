"use server";

import { ALL_TIERS, type ModelTier } from "@forja/core";
import { eq, getDb, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { num } from "@/lib/admin";

export async function updatePlan(formData: FormData) {
  const maxProjects = String(formData.get("maxProjects") ?? "").trim();
  const tiers = formData.getAll("tiers").map(String).filter((t): t is ModelTier => ALL_TIERS.includes(t as ModelTier));
  await getDb()
    .update(schema.plans)
    .set({
      name: String(formData.get("name")),
      description: String(formData.get("description") ?? ""),
      priceBrlCents: Math.round(num(formData.get("price")) * 100),
      includedCreditsBrlCents: Math.round(num(formData.get("credits")) * 100),
      seats: Math.max(1, Math.round(num(formData.get("seats"), 1))),
      maxProjects: maxProjects ? Math.round(num(maxProjects)) : null,
      allowedTiers: tiers,
      active: formData.get("active") === "on",
    })
    .where(eq(schema.plans.id, String(formData.get("id"))));
  revalidatePath("/planos");
  revalidatePath("/");
}
