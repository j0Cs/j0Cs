"use server";

import { conciliarCustos, diaUtc, enviarAlertaDeTeste, resolverAlerta, verificarAlertas, enviarAlertasPendentes } from "@forja/ops";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminDb, requireStaff } from "@/lib/admin";

const voltar = (q: Record<string, string>): never => redirect(`/alertas?${new URLSearchParams(q)}`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolverAlertaAction(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) voltar({ erro: "Alerta não encontrado." });
  const db = await adminDb();
  await resolverAlerta(db, id);
  revalidatePath("/alertas");
  voltar({ ok: "Alerta marcado como resolvido. Se o problema voltar, um alerta novo é aberto." });
}

/** "Pronto quando" da Sprint 4: confirma que o e-mail de alerta chega à equipe. */
export async function enviarAlertaDeTesteAction() {
  const user = await requireStaff();
  const db = await adminDb();
  let enviados = 0;
  try {
    enviados = await enviarAlertaDeTeste(db, user.email);
  } catch (err) {
    voltar({ erro: `O envio falhou: ${err instanceof Error ? err.message : String(err)}` });
  }
  if (!enviados) voltar({ erro: "Nenhum e-mail saiu. Confira a configuração de e-mail (doc 6) e se há alguém da equipe cadastrado." });
  voltar({ ok: `Alerta de teste enviado para ${enviados} pessoa(s) da equipe.` });
}

/** Roda as verificações agora, sem esperar a rotina diária. */
export async function verificarAgoraAction() {
  await requireStaff();
  const db = await adminDb();
  const novos = await verificarAlertas(db);
  const emails = await enviarAlertasPendentes(db);
  voltar({ ok: novos.length ? `${novos.length} alerta(s) novo(s)${emails ? `, e-mail enviado` : ""}.` : "Nenhum problema novo encontrado." });
}

export async function conciliarAgoraAction(formData: FormData) {
  await requireStaff();
  const db = await adminDb();
  const dia = String(formData.get("dia") || diaUtc(new Date(), 2));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) voltar({ erro: "Data inválida." });
  const r = await conciliarCustos(db, dia);
  await enviarAlertasPendentes(db);
  voltar({ ok: `Conciliação de ${dia}: ${r.map((x) => `${x.providerId} ${x.status}`).join(", ")}.` });
}
