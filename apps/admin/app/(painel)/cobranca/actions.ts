"use server";

import { getStripe, stripeConfigurado } from "@forja/billing";
import { eq, schema } from "@forja/db";
import { redirect } from "next/navigation";
import { adminDb, num, requireStaff } from "@/lib/admin";

const voltar = (q: Record<string, string>): never => redirect(`/cobranca?${new URLSearchParams(q)}`);

/**
 * Reembolso pelo Stripe (cartão ou Pix). O estorno dos créditos acontece no webhook charge.refunded,
 * na mesma proporção do valor devolvido. Boleto não tem reembolso pelo Stripe: devolva por fora.
 */
export async function reembolsarAction(formData: FormData) {
  await requireStaff();
  if (!stripeConfigurado()) voltar({ erro: "Stripe não configurado." });
  const db = await adminDb();
  const pagamento = await db.query.payments.findFirst({ where: eq(schema.payments.id, String(formData.get("id"))) });
  if (!pagamento) voltar({ erro: "Pagamento não encontrado." });
  const p = pagamento!;
  if (!p.paymentIntentId) voltar({ erro: "Esse pagamento não tem a referência do Stripe. Reembolse pelo painel do Stripe." });
  if (p.method === "boleto") voltar({ erro: "Boleto não tem reembolso pelo Stripe: devolva por transferência e registre um ajuste no cliente." });
  if (p.status !== "paid" && p.status !== "partially_refunded") voltar({ erro: "Só pagamentos pagos podem ser reembolsados." });

  const restante = p.amountBrlCents - p.refundedBrlCents;
  const pedido = Math.round(num(formData.get("valor")) * 100);
  const valor = pedido > 0 ? Math.min(pedido, restante) : restante;
  if (valor <= 0) voltar({ erro: "Nada a reembolsar." });

  try {
    await getStripe().refunds.create(
      { payment_intent: p.paymentIntentId!, amount: valor, reason: "requested_by_customer", metadata: { forja_pagamento: p.id } },
      { idempotencyKey: `forja-reembolso-${p.id}-${p.refundedBrlCents}-${valor}` },
    );
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "reembolso falhou", pagamento: p.id, err: String(err) }));
    voltar({ erro: `O Stripe recusou o reembolso: ${(err as Error).message}` });
  }
  voltar({ ok: `Reembolso de R$ ${(valor / 100).toFixed(2).replace(".", ",")} pedido. Os créditos são estornados quando o Stripe confirmar.` });
}
