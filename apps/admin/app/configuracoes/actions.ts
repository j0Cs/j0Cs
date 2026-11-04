"use server";

import { fetchPtaxUsdBrl } from "@forja/core/server";
import { getDb, getEconomics, getPricingSettings, saveEconomics, savePricingSettings } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num } from "@/lib/admin";

export async function saveSettings(formData: FormData) {
  const db = getDb();
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

/** Atualiza o câmbio com a PTAX do Banco Central + margem de segurança. */
export async function refreshFx(formData: FormData) {
  const db = getDb();
  const buffer = num(formData.get("buffer"), 3);
  try {
    const { rate } = await fetchPtaxUsdBrl();
    const current = await getPricingSettings(db);
    await savePricingSettings(db, { ...current, fxUsdBrl: Math.round(rate * (1 + buffer / 100) * 10_000) / 10_000 });
  } catch (err) {
    redirect(`/configuracoes?erro=${encodeURIComponent(err instanceof Error ? err.message : "Falha na PTAX")}`);
  }
  revalidatePath("/", "layout");
  redirect("/configuracoes?ok=ptax");
}
