import Stripe from "stripe";
import type { LinhaDeFatura } from "./regras";

/**
 * Cliente do Stripe. Sem STRIPE_SECRET_KEY, a cobrança online fica desligada (as telas avisam e
 * nada quebra). A versão da API é a fixada pelo SDK (stripe@23.0.1 → 2026-09-30.endive).
 */
export const stripeConfigurado = () => Boolean(process.env.STRIPE_SECRET_KEY);

export class CobrancaIndisponivel extends Error {
  constructor() {
    super("Os pagamentos online ainda não estão ligados. Fale com o suporte para assinar.");
  }
}

let cliente: { chave: string; stripe: Stripe } | null = null;

export function getStripe(): Stripe {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) throw new CobrancaIndisponivel();
  if (cliente?.chave === chave) return cliente.stripe;
  const opcoes: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "Forja" } };
  // Simulador local para testes: só com chave de TESTE, que não move dinheiro de verdade.
  const base = process.env.STRIPE_API_BASE;
  if (base && chave.startsWith("sk_test_")) {
    const u = new URL(base);
    opcoes.host = u.hostname;
    opcoes.port = u.port || (u.protocol === "https:" ? 443 : 80);
    opcoes.protocol = u.protocol === "http:" ? "http" : "https";
  }
  cliente = { chave, stripe: new Stripe(chave, opcoes) };
  return cliente.stripe;
}

export const idDe = (x: string | { id: string } | null | undefined) => (x == null ? null : typeof x === "string" ? x : x.id);

/** Linhas da fatura no formato das regras (API endive: preço e produto ficam em `pricing`). */
export function linhasDaFatura(invoice: Stripe.Invoice): LinhaDeFatura[] {
  return invoice.lines.data.map((l) => {
    const unit = l.pricing?.unit_amount_decimal;
    return {
      produto: l.pricing?.price_details?.product ?? null,
      valorCentavos: l.amount,
      precoUnitarioCentavos: unit == null ? null : Number(unit.toString()),
      quantidade: l.quantity,
      proracao: Boolean(l.parent?.subscription_item_details?.proration ?? l.parent?.invoice_item_details?.proration),
    };
  });
}

/** Assinatura da fatura (API endive: `parent.subscription_details.subscription`). */
export const assinaturaDaFatura = (invoice: Stripe.Invoice) => idDe(invoice.parent?.subscription_details?.subscription ?? null);

/** Pagamento de uma fatura: PaymentIntent, meio usado e motivo da recusa (melhor esforço). */
export async function pagamentoDaFatura(stripe: Stripe, invoiceId: string) {
  try {
    const pagamentos = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
    const escolhido =
      pagamentos.data.find((p) => p.status === "paid") ?? pagamentos.data.find((p) => p.is_default) ?? pagamentos.data[0];
    const pi = idDe(escolhido?.payment.payment_intent ?? null);
    if (!pi) return { paymentIntentId: null, metodo: null, recusa: null };
    return { paymentIntentId: pi, ...(await detalhesDoPagamento(stripe, pi)) };
  } catch {
    return { paymentIntentId: null, metodo: null, recusa: null };
  }
}

export async function detalhesDoPagamento(stripe: Stripe, paymentIntentId: string) {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    return {
      metodo: charge?.payment_method_details?.type ?? pi.payment_method_types?.[0] ?? null,
      recusa: pi.last_payment_error ?? null,
    };
  } catch {
    return { metodo: null, recusa: null };
  }
}

export type { Stripe };
