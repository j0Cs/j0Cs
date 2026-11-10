"use server";

import { getEconomics, getPricingSettings, saveEconomics, savePricingSettings } from "@forja/db";
import { atualizarCambio } from "@forja/ops";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb, num, requireStaff } from "@/lib/admin";

export async function saveSettings(formData: FormData) {
  await requireStaff();
  const db = await adminDb();
  const current = await getPricingSettings(db);
  await savePricingSettings(db, {
    fxUsdBrl: num(formData.get("fxUsdBrl"), current.fxUsdBrl),
    costOverheadPercent: num(formData.get("costOverheadPercent"), current.costOverheadPercent),
    minBalanceBrlMicros: Math.round(num(formData.get("minBalance"), current.minBalanceBrlMicros / 1e6) * 1e6),
  });
  const eco = await getEconomics(db);
  await saveEconomics(db, {
    revenueTaxPercent: num(formData.get("revenueTaxPercent"), eco.revenueTaxPercent),
    paymentFeePercent: num(formData.get("paymentFeePercent"), eco.paymentFeePercent),
    blendedMarkupPercent: num(formData.get("blendedMarkupPercent"), eco.blendedMarkupPercent),
    infraPerSeatBrlCents: Math.round(num(formData.get("infraPerSeat"), eco.infraPerSeatBrlCents / 100) * 100),
  });
  revalidatePath("/", "layout");
  redirect("/configuracoes?ok=1");
}

/**
 * Atualiza o câmbio com a PTAX do Banco Central + folga. A folga escolhida fica gravada e é a mesma
 * que a rotina diária usa daqui em diante.
 */
export async function refreshFx(formData: FormData) {
  await requireStaff();
  const db = await adminDb();
  const folga = Math.min(Math.max(num(formData.get("buffer"), 3), 0), 30);
  try {
    await atualizarCambio(db, { folgaPercent: folga });
  } catch (err) {
    redirect(`/configuracoes?erro=${encodeURIComponent(err instanceof Error ? err.message : "Falha na PTAX")}`);
  }
  revalidatePath("/", "layout");
  redirect("/configuracoes?ok=ptax");
}
