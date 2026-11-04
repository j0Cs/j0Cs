"use server";

import { addCredits, eq, getDb, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { num } from "@/lib/admin";

export async function grantCredits(formData: FormData) {
  const reais = num(formData.get("amount"));
  const kind = String(formData.get("kind")) === "topup" ? "topup" : "adjustment";
  if (!reais) return;
  await addCredits(getDb(), {
    orgId: String(formData.get("orgId")),
    amountBrlMicros: Math.round(reais * 1_000_000),
    kind,
    description: String(formData.get("description") || (kind === "topup" ? "Recarga manual" : "Ajuste manual")),
  });
  revalidatePath("/clientes");
}

export async function setOrgStatus(formData: FormData) {
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  await getDb()
    .update(schema.organizations)
    .set({ status })
    .where(eq(schema.organizations.id, String(formData.get("orgId"))));
  revalidatePath("/clientes");
}

export async function setOrgPlan(formData: FormData) {
  await getDb()
    .update(schema.organizations)
    .set({ planId: String(formData.get("planId")) })
    .where(eq(schema.organizations.id, String(formData.get("orgId"))));
  revalidatePath("/clientes");
}
