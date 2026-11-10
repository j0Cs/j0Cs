"use server";

import { TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { addCredits, eq, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { adminDb, num, requireStaff } from "@/lib/admin";

export async function grantCredits(formData: FormData) {
  await requireStaff();
  const reais = num(formData.get("amount"));
  const kind = String(formData.get("kind")) === "topup" ? "topup" : "adjustment";
  if (!reais) return;
  await addCredits(await adminDb(), {
    orgId: String(formData.get("orgId")),
    amountBrlMicros: Math.round(reais * 1_000_000),
    kind,
    description: String(formData.get("description") || (kind === "topup" ? "Recarga manual" : "Ajuste manual")),
  });
  revalidatePath("/clientes");
}

export async function setOrgStatus(formData: FormData) {
  await requireStaff();
  const status = String(formData.get("status")) === "suspended" ? "suspended" : "active";
  await (await adminDb())
    .update(schema.organizations)
    // reativar à mão também zera a carência de inadimplência (decisão do dono)
    .set(status === "suspended" ? { status, suspendedReason: "manual" } : { status, suspendedReason: null, pastDueSince: null })
    .where(eq(schema.organizations.id, String(formData.get("orgId"))));
  revalidatePath("/clientes");
}

export async function setOrgPlan(formData: FormData) {
  await requireStaff();
  const planId = String(formData.get("planId"));
  await (await adminDb())
    .update(schema.organizations)
    // voltar para o teste dá mais 7 dias a partir de agora
    .set(planId === TRIAL_PLAN_ID ? { planId, trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) } : { planId })
    .where(eq(schema.organizations.id, String(formData.get("orgId"))));
  revalidatePath("/clientes");
}
