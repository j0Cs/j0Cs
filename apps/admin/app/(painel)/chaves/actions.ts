"use server";

import type { ProviderId } from "@forja/core";
import { encryptSecret, secretHint, verifyProviderKey } from "@forja/core/server";
import { eq, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb, num, requireStaff } from "@/lib/admin";

export async function addKey(formData: FormData) {
  await requireStaff();
  const providerId = String(formData.get("providerId")) as ProviderId;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || "Chave";
  if (!apiKey) redirect("/chaves?erro=Informe%20a%20chave");

  const check = await verifyProviderKey(providerId, apiKey);
  if (!check.ok) redirect(`/chaves?erro=${encodeURIComponent(`Chave recusada pelo provedor: ${check.detail}`)}`);

  await (await adminDb()).insert(schema.providerKeys).values({
    providerId,
    label,
    encryptedKey: encryptSecret(apiKey),
    keyHint: secretHint(apiKey),
    priority: Math.round(num(formData.get("priority"), 100)),
  });
  revalidatePath("/chaves");
  redirect(`/chaves?ok=${encodeURIComponent(check.detail)}`);
}

export async function toggleKey(formData: FormData) {
  await requireStaff();
  await (await adminDb())
    .update(schema.providerKeys)
    .set({ status: String(formData.get("status")) === "active" ? "active" : "disabled" })
    .where(eq(schema.providerKeys.id, String(formData.get("id"))));
  revalidatePath("/chaves");
}

export async function setPriority(formData: FormData) {
  await requireStaff();
  await (await adminDb())
    .update(schema.providerKeys)
    .set({ priority: Math.round(num(formData.get("priority"), 100)) })
    .where(eq(schema.providerKeys.id, String(formData.get("id"))));
  revalidatePath("/chaves");
}

export async function deleteKey(formData: FormData) {
  await requireStaff();
  await (await adminDb()).delete(schema.providerKeys).where(eq(schema.providerKeys.id, String(formData.get("id"))));
  revalidatePath("/chaves");
}
