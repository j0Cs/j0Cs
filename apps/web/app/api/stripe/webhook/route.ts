import { enviarAvisos, getStripe, processarEvento } from "@forja/billing";
import { getDb } from "@forja/db";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Webhook do Stripe. Eventos usados (cadastre estes no Stripe → Developers → Webhooks):
 * checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted, invoice.paid,
 * invoice.payment_failed, invoice.payment_action_required, charge.refunded.
 *
 * 2xx = processado (ou já visto); 400 = assinatura inválida (o Stripe não insiste); 500 = falhou no
 * meio, nada foi gravado, e o Stripe tenta de novo.
 */
export async function POST(request: Request) {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo || !process.env.STRIPE_SECRET_KEY) return new Response("Pagamentos não configurados.", { status: 503 });

  const assinatura = request.headers.get("stripe-signature");
  if (!assinatura) return new Response("Sem assinatura.", { status: 400 });
  const corpo = await request.text();
  const stripe = getStripe();
  let evento;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, assinatura, segredo);
  } catch {
    return new Response("Assinatura inválida.", { status: 400 });
  }

  const db = getDb();
  try {
    const { processado, avisos } = await processarEvento(db, stripe, evento);
    if (avisos.length) {
      waitUntil(
        enviarAvisos(db, avisos).catch((err) =>
          console.error(JSON.stringify({ level: "error", msg: "avisos do webhook falharam", evento: evento.id, err: String(err) })),
        ),
      );
    }
    return Response.json({ recebido: true, processado });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "webhook do Stripe falhou", evento: evento.id, tipo: evento.type, err: String(err) }));
    return new Response("Falha ao processar.", { status: 500 });
  }
}
