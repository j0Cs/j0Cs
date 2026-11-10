import { formatBrlCents, TRIAL_PLAN_ID } from "@forja/core";
import { addCreditsOnce, and, eq, gte, inArray, ne, schema, sql, type Db, type Tx } from "@forja/db";
import {
  centavosParaMicros,
  creditosDaFatura,
  motivoDaRecusa,
  planoDaFatura,
  planoDoProduto,
  statusLocal,
  sobraDoPlano,
} from "./regras";
import {
  assinaturaDaFatura,
  detalhesDoPagamento,
  idDe,
  linhasDaFatura,
  pagamentoDaFatura,
  type Stripe,
} from "./stripe";

type Org = typeof schema.organizations.$inferSelect;

/** E-mails a enviar DEPOIS que a transação do evento for gravada. */
export type Aviso =
  | { tipo: "recarga_confirmada"; orgId: string; valorCentavos: number }
  | { tipo: "pagamento_recusado"; orgId: string; valorCentavos: number; url: string | null; motivo: string | null }
  | { tipo: "conta_reativada"; orgId: string };

interface Contexto {
  /** Assinatura lida de novo no Stripe: eventos chegam fora de ordem, o estado atual não. */
  assinatura?: Stripe.Subscription | null;
  fatura?: Stripe.Invoice | null;
  pagamento?: { paymentIntentId: string | null; metodo: string | null; recusa: { code?: string | null; decline_code?: string | null } | null };
  /** Fatura de um PaymentIntent reembolsado (quando o pagamento não está gravado com o PI). */
  faturaDoReembolso?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deUnix = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

/**
 * Processa um evento do Stripe (assinatura já verificada pela rota do webhook). Idempotente: o id
 * do evento entra em stripe_events na MESMA transação dos efeitos; uma entrega repetida não faz nada
 * e uma falha no meio desfaz tudo (o Stripe tenta de novo).
 */
export async function processarEvento(db: Db, stripe: Stripe, event: Stripe.Event) {
  const ja = await db.query.stripeEvents.findFirst({ where: eq(schema.stripeEvents.id, event.id) });
  if (ja) return { processado: false, avisos: [] as Aviso[] };

  // chamadas ao Stripe ficam FORA da transação (não seguram conexão do banco)
  const contexto = await prepararContexto(db, stripe, event);
  const avisos: Aviso[] = [];
  let novo = false;
  await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(schema.stripeEvents)
      .values({ id: event.id, type: event.type, eventCreatedAt: new Date(event.created * 1000) })
      .onConflictDoNothing()
      .returning({ id: schema.stripeEvents.id });
    if (!linha) return; // outra entrega do mesmo evento chegou antes
    novo = true;
    await aplicar(tx, event, contexto, avisos);
  });
  return { processado: novo, avisos: novo ? avisos : [] };
}

async function prepararContexto(db: Db, stripe: Stripe, event: Stripe.Event): Promise<Contexto> {
  const buscarAssinatura = async (id: string | null) => {
    if (!id) return null;
    try {
      return await stripe.subscriptions.retrieve(id);
    } catch {
      return null;
    }
  };

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.pending_update_applied":
    case "customer.subscription.pending_update_expired":
      return { assinatura: (await buscarAssinatura(event.data.object.id)) ?? event.data.object };

    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      let fatura = event.data.object;
      if (fatura.lines.has_more) {
        try {
          fatura = await stripe.invoices.retrieve(fatura.id, { expand: ["lines"] });
          const todas = await stripe.invoices.listLineItems(fatura.id, { limit: 100 });
          fatura = { ...fatura, lines: todas };
        } catch {
          // segue com as linhas que vieram no evento
        }
      }
      return {
        fatura,
        assinatura: await buscarAssinatura(assinaturaDaFatura(fatura)),
        pagamento: await pagamentoDaFatura(stripe, fatura.id),
      };
    }

    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      const pi = idDe(s.payment_intent);
      return {
        assinatura: s.mode === "subscription" ? await buscarAssinatura(idDe(s.subscription)) : null,
        pagamento: pi ? { paymentIntentId: pi, ...(await detalhesDoPagamento(stripe, pi)) } : undefined,
      };
    }

    case "charge.refunded": {
      const pi = idDe(event.data.object.payment_intent);
      if (!pi) return {};
      const gravado = await db.query.payments.findFirst({ where: eq(schema.payments.paymentIntentId, pi) });
      if (gravado) return {};
      try {
        const lista = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 1 });
        return { faturaDoReembolso: idDe(lista.data[0]?.invoice ?? null) };
      } catch {
        return {};
      }
    }

    default:
      return {};
  }
}

async function aplicar(tx: Tx, event: Stripe.Event, ctx: Contexto, avisos: Aviso[]) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
    case "customer.subscription.pending_update_applied":
    case "customer.subscription.pending_update_expired": {
      const sub = ctx.assinatura ?? event.data.object;
      const org = await orgDe(tx, sub.metadata?.org_id, idDe(sub.customer));
      if (org) await sincronizarAssinatura(tx, org, sub);
      return;
    }

    case "invoice.paid":
      return faturaPaga(tx, ctx.fatura ?? event.data.object, ctx, avisos);

    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return faturaRecusada(tx, ctx.fatura ?? event.data.object, ctx, avisos, event.type === "invoice.payment_action_required");

    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return checkoutAtualizado(tx, event.type, event.data.object, ctx, avisos);

    case "charge.refunded":
      return reembolso(tx, event.data.object, ctx);

    default:
      return; // eventos que não usamos: gravados como vistos e ignorados
  }
}

/** Organização do objeto: pelo org_id que gravamos no metadata e, na falta, pelo cliente do Stripe. */
async function orgDe(tx: Tx, orgIdDoMetadata: string | null | undefined, clienteId: string | null) {
  if (orgIdDoMetadata && UUID.test(orgIdDoMetadata)) {
    const [org] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, orgIdDoMetadata)).for("update");
    if (org && (!clienteId || !org.billingCustomerId || org.billingCustomerId === clienteId)) return org;
  }
  if (!clienteId) return null;
  const [org] = await tx
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.billingCustomerId, clienteId))
    .for("update");
  if (!org) console.warn(JSON.stringify({ level: "warn", msg: "stripe: cliente sem organização", cliente: clienteId }));
  return org ?? null;
}

async function sincronizarAssinatura(tx: Tx, org: Org, sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const planId = planoDoProduto(idDe(item?.price.product ?? null));
  if (!item || !planId) return; // não é uma assinatura de plano da Forja
  const plano = await tx.query.plans.findFirst({ where: eq(schema.plans.id, planId) });
  if (!plano) return;

  const status = statusLocal(sub.status);
  const assentos = item.quantity ?? 1;
  const valores = {
    orgId: org.id,
    planId,
    status,
    seats: assentos,
    amountBrlCents: (item.price.unit_amount ?? 0) * assentos,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at),
    currentPeriodStart: deUnix(item.current_period_start) ?? new Date(),
    currentPeriodEnd: deUnix(item.current_period_end) ?? new Date(),
  };
  await tx
    .insert(schema.subscriptions)
    .values({ ...valores, billingProvider: "stripe", externalId: sub.id })
    .onConflictDoUpdate({
      target: [schema.subscriptions.billingProvider, schema.subscriptions.externalId],
      targetWhere: sql`${schema.subscriptions.externalId} is not null`,
      set: valores,
    });

  if (!org.billingCustomerId) {
    await tx.update(schema.organizations).set({ billingCustomerId: idDe(sub.customer) }).where(eq(schema.organizations.id, org.id));
  }

  if (status === "past_due") {
    // começa a contar a carência de 3 dias na primeira recusa
    await tx
      .update(schema.organizations)
      .set({ pastDueSince: sql`coalesce(${schema.organizations.pastDueSince}, now())` })
      .where(eq(schema.organizations.id, org.id));
  } else if (status === "active" || status === "trialing") {
    await tx.update(schema.organizations).set({ pastDueSince: null }).where(eq(schema.organizations.id, org.id));
  } else if (status === "canceled" && sub.status === "canceled") {
    await assinaturaEncerrada(tx, org, sub.id);
  }
}

/** Fim da assinatura paga: sem outra assinatura viva, a organização fica sem plano (dados mantidos). */
async function assinaturaEncerrada(tx: Tx, org: Org, subId: string) {
  if (!org.planId || org.planId === TRIAL_PLAN_ID) return; // nunca chegou a pagar (ou ainda está no teste)
  const outras = await tx
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.orgId, org.id),
        eq(schema.subscriptions.billingProvider, "stripe"),
        ne(schema.subscriptions.externalId, subId),
        inArray(schema.subscriptions.status, ["active", "past_due", "trialing"]),
      ),
    );
  if (outras.length) return;
  await expirarSobraDoPlano(tx, org, `${subId}:fim`, "Créditos do plano que não foram usados (assinatura encerrada)");
  await tx
    .update(schema.organizations)
    .set({
      planId: null,
      pastDueSince: null,
      // sem plano o uso já fica bloqueado; a suspensão por inadimplência não precisa continuar
      ...(org.suspendedReason === "inadimplencia" ? { status: "active" as const, suspendedReason: null } : {}),
    })
    .where(eq(schema.organizations.id, org.id));
}

/** Créditos do plano que sobraram no ciclo viram expiração no extrato (doc 3: vencem no fim do ciclo). */
async function expirarSobraDoPlano(tx: Tx, org: Org, referencia: string, descricao: string) {
  const desde = org.planCreditsSince ?? org.createdAt;
  const [r] = await tx
    .select({
      // créditos do plano no ciclo, menos o que foi estornado num reembolso da assinatura
      concedidos: sql<string>`coalesce(sum(case when ${schema.creditLedger.kind} = 'plan_grant' or (${schema.creditLedger.kind} = 'refund' and ${schema.creditLedger.referenceId} like 'plano:%') then ${schema.creditLedger.amountBrlMicros} else 0 end), 0)`,
      // o consumo gasta primeiro os créditos do plano (a expiração do início do ciclo não conta)
      consumidos: sql<string>`coalesce(sum(case when ${schema.creditLedger.kind} = 'usage' then -${schema.creditLedger.amountBrlMicros} else 0 end), 0)`,
    })
    .from(schema.creditLedger)
    .where(and(eq(schema.creditLedger.orgId, org.id), gte(schema.creditLedger.createdAt, desde)));
  const [atual] = await tx
    .select({ saldo: schema.organizations.creditBalanceBrlMicros })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, org.id));
  const sobra = sobraDoPlano({
    concedidosMicros: Number(r?.concedidos ?? 0),
    consumidosMicros: Number(r?.consumidos ?? 0),
    saldoMicros: atual?.saldo ?? 0,
  });
  if (sobra > 0) {
    await addCreditsOnce(tx, { orgId: org.id, amountBrlMicros: -sobra, kind: "expiry", referenceId: referencia, description: descricao });
  }
}

async function faturaPaga(tx: Tx, inv: Stripe.Invoice, ctx: Contexto, avisos: Aviso[]) {
  const subId = assinaturaDaFatura(inv);
  if (!subId) return; // fatura avulsa: não é da assinatura
  const sub = ctx.assinatura ?? null;
  const org = await orgDe(tx, sub?.metadata?.org_id ?? inv.parent?.subscription_details?.metadata?.org_id, idDe(inv.customer));
  if (!org) return;
  if (sub) await sincronizarAssinatura(tx, org, sub);

  const planos = await tx.select().from(schema.plans);
  const linhas = linhasDaFatura(inv);
  const creditosCentavos = creditosDaFatura(linhas, (id) => planos.find((p) => p.id === id)?.includedCreditsBrlCents ?? null);
  const planoNovo = planoDaFatura(linhas);
  const nomeDoPlano = planos.find((p) => p.id === planoNovo)?.name ?? "do plano";
  const novoCiclo = inv.billing_reason === "subscription_create" || inv.billing_reason === "subscription_cycle";
  // outro evento da MESMA fatura (o Stripe manda mais de um tipo, e reentrega): créditos e início
  // do ciclo já foram feitos; refazer moveria o início do ciclo para depois dos créditos
  const jaPaga = await tx.query.payments.findFirst({
    where: and(eq(schema.payments.externalId, inv.id), inArray(schema.payments.status, ["paid", "refunded", "partially_refunded"])),
  });

  if (novoCiclo && !jaPaga) {
    await expirarSobraDoPlano(
      tx,
      org,
      inv.id,
      org.planId === TRIAL_PLAN_ID ? "Créditos do teste grátis que não foram usados" : "Créditos do ciclo anterior que não foram usados",
    );
    await tx.update(schema.organizations).set({ planCreditsSince: sql`now()` }).where(eq(schema.organizations.id, org.id));
  }
  const creditosMicros = centavosParaMicros(creditosCentavos);
  if (creditosMicros > 0 && !jaPaga) {
    await addCreditsOnce(tx, {
      orgId: org.id,
      amountBrlMicros: creditosMicros,
      kind: "plan_grant",
      referenceId: inv.id,
      description: novoCiclo ? `Créditos do plano ${nomeDoPlano}` : `Créditos proporcionais da troca para o plano ${nomeDoPlano}`,
    });
  }

  // o plano em vigor só muda pela fatura mais recente da assinatura (uma fatura antiga atrasada não volta o plano)
  const ehAUltima = !sub || idDe(sub.latest_invoice) === inv.id;
  const reativar = org.status === "suspended" && org.suspendedReason === "inadimplencia";
  await tx
    .update(schema.organizations)
    .set({
      pastDueSince: null,
      ...(planoNovo && ehAUltima && planos.some((p) => p.id === planoNovo) ? { planId: planoNovo } : {}),
      ...(reativar ? { status: "active" as const, suspendedReason: null } : {}),
    })
    .where(eq(schema.organizations.id, org.id));
  // assinou: o teste grátis termina aqui
  await tx
    .update(schema.subscriptions)
    .set({ status: "canceled" })
    .where(
      and(
        eq(schema.subscriptions.orgId, org.id),
        eq(schema.subscriptions.planId, TRIAL_PLAN_ID),
        eq(schema.subscriptions.status, "trialing"),
      ),
    );

  const pagoEm = deUnix(inv.status_transitions?.paid_at) ?? new Date();
  const descricao =
    inv.billing_reason === "subscription_update" ? `Troca para o plano ${nomeDoPlano} (diferença proporcional)` : `Assinatura ${nomeDoPlano}`;
  await tx
    .insert(schema.payments)
    .values({
      orgId: org.id,
      kind: "assinatura",
      externalId: inv.id,
      paymentIntentId: ctx.pagamento?.paymentIntentId ?? null,
      amountBrlCents: inv.amount_paid,
      creditsBrlMicros: creditosMicros,
      status: "paid",
      method: ctx.pagamento?.metodo ?? null,
      description: descricao,
      hostedUrl: inv.hosted_invoice_url ?? null,
      paidAt: pagoEm,
    })
    .onConflictDoUpdate({
      target: schema.payments.externalId,
      set: {
        // um reembolso já registrado não volta para "pago"
        status: sql`case when ${schema.payments.status} in ('refunded', 'partially_refunded') then ${schema.payments.status} else 'paid' end`,
        amountBrlCents: inv.amount_paid,
        creditsBrlMicros: creditosMicros,
        paymentIntentId: sql`coalesce(${ctx.pagamento?.paymentIntentId ?? null}, ${schema.payments.paymentIntentId})`,
        method: sql`coalesce(${ctx.pagamento?.metodo ?? null}, ${schema.payments.method})`,
        description: descricao,
        hostedUrl: inv.hosted_invoice_url ?? null,
        paidAt: pagoEm,
        failureMessage: null,
      },
    });
  if (reativar) avisos.push({ tipo: "conta_reativada", orgId: org.id });
}

async function faturaRecusada(tx: Tx, inv: Stripe.Invoice, ctx: Contexto, avisos: Aviso[], pedeConfirmacao: boolean) {
  const subId = assinaturaDaFatura(inv);
  if (!subId) return;
  const sub = ctx.assinatura ?? null;
  const org = await orgDe(tx, sub?.metadata?.org_id ?? inv.parent?.subscription_details?.metadata?.org_id, idDe(inv.customer));
  if (!org) return;
  if (sub) await sincronizarAssinatura(tx, org, sub);

  const motivo = pedeConfirmacao ? "o banco pediu confirmação da compra (3D Secure)" : motivoDaRecusa(ctx.pagamento?.recusa);
  await tx
    .insert(schema.payments)
    .values({
      orgId: org.id,
      kind: "assinatura",
      externalId: inv.id,
      paymentIntentId: ctx.pagamento?.paymentIntentId ?? null,
      amountBrlCents: inv.amount_due,
      status: pedeConfirmacao ? "pending" : "failed",
      method: ctx.pagamento?.metodo ?? null,
      description: "Assinatura (cobrança recusada)",
      hostedUrl: inv.hosted_invoice_url ?? null,
      failureMessage: motivo,
      failedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.payments.externalId,
      // uma recusa atrasada não desfaz um pagamento que já entrou
      where: sql`${schema.payments.status} not in ('paid', 'refunded', 'partially_refunded')`,
      set: {
        status: pedeConfirmacao ? "pending" : "failed",
        amountBrlCents: inv.amount_due,
        hostedUrl: inv.hosted_invoice_url ?? null,
        failureMessage: motivo,
        failedAt: new Date(),
      },
    });

  // só renovações avisam: a 1ª cobrança acontece no checkout (a pessoa vê na hora) e a troca de
  // plano recusada não muda nada (o plano antigo continua)
  if (inv.billing_reason === "subscription_cycle") {
    avisos.push({ tipo: "pagamento_recusado", orgId: org.id, valorCentavos: inv.amount_due, url: inv.hosted_invoice_url ?? null, motivo });
  }
}

async function checkoutAtualizado(tx: Tx, tipo: string, s: Stripe.Checkout.Session, ctx: Contexto, avisos: Aviso[]) {
  const org = await orgDe(tx, s.metadata?.org_id ?? s.client_reference_id, idDe(s.customer));
  if (!org) return;

  if (s.mode === "subscription") {
    if (ctx.assinatura) await sincronizarAssinatura(tx, org, ctx.assinatura);
    return;
  }
  if (s.mode !== "payment" || s.metadata?.tipo !== "recarga") return;

  const valor = s.amount_total ?? 0;
  if (s.currency !== "brl" || valor <= 0) return;
  const base = {
    orgId: org.id,
    kind: "recarga",
    externalId: s.id,
    paymentIntentId: ctx.pagamento?.paymentIntentId ?? idDe(s.payment_intent),
    amountBrlCents: valor,
    method: ctx.pagamento?.metodo ?? null,
    description: `Recarga de ${formatBrlCents(valor)}`,
  };

  const pago =
    (tipo === "checkout.session.completed" && s.payment_status === "paid") || tipo === "checkout.session.async_payment_succeeded";
  if (pago) {
    const creditos = centavosParaMicros(valor);
    const { lancado } = await addCreditsOnce(tx, {
      orgId: org.id,
      amountBrlMicros: creditos,
      kind: "topup",
      referenceId: s.id,
      description: `Recarga de ${formatBrlCents(valor)}`,
    });
    await tx
      .insert(schema.payments)
      .values({ ...base, creditsBrlMicros: creditos, status: "paid", paidAt: new Date() })
      .onConflictDoUpdate({
        target: schema.payments.externalId,
        where: sql`${schema.payments.status} not in ('paid', 'refunded', 'partially_refunded')`,
        set: { status: "paid", creditsBrlMicros: creditos, paidAt: new Date(), paymentIntentId: base.paymentIntentId, method: base.method, failureMessage: null },
      });
    if (lancado) avisos.push({ tipo: "recarga_confirmada", orgId: org.id, valorCentavos: valor });
    return;
  }

  const falhou = tipo === "checkout.session.async_payment_failed" || tipo === "checkout.session.expired";
  await tx
    .insert(schema.payments)
    .values({
      ...base,
      status: falhou ? "failed" : "pending",
      failureMessage: falhou ? (tipo === "checkout.session.expired" ? "o Pix expirou sem pagamento" : "pagamento não confirmado") : null,
      failedAt: falhou ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: schema.payments.externalId,
      where: sql`${schema.payments.status} = 'pending'`,
      set: {
        status: falhou ? "failed" : "pending",
        failureMessage: falhou ? "pagamento não confirmado" : null,
        failedAt: falhou ? new Date() : null,
      },
    });
}

/** Reembolso (total ou parcial): estorna os créditos na mesma proporção, sem deixar o saldo negativo. */
async function reembolso(tx: Tx, charge: Stripe.Charge, ctx: Contexto) {
  const pi = idDe(charge.payment_intent);
  const [pagamento] = pi
    ? await tx.select().from(schema.payments).where(eq(schema.payments.paymentIntentId, pi)).for("update")
    : [];
  const alvo =
    pagamento ??
    (ctx.faturaDoReembolso
      ? (await tx.select().from(schema.payments).where(eq(schema.payments.externalId, ctx.faturaDoReembolso)).for("update"))[0]
      : undefined);
  if (!alvo) {
    console.warn(JSON.stringify({ level: "warn", msg: "stripe: reembolso sem pagamento conhecido", charge: charge.id }));
    return;
  }
  const total = charge.amount_refunded;
  const delta = total - alvo.refundedBrlCents;
  if (delta <= 0) return;

  const [org] = await tx.select().from(schema.organizations).where(eq(schema.organizations.id, alvo.orgId)).for("update");
  const proporcional = alvo.amountBrlCents > 0 ? Math.floor((alvo.creditsBrlMicros * Math.min(delta, alvo.amountBrlCents)) / alvo.amountBrlCents) : 0;
  const estorno = Math.min(proporcional, Math.max(0, org?.creditBalanceBrlMicros ?? 0));
  if (estorno > 0) {
    await addCreditsOnce(tx, {
      orgId: alvo.orgId,
      amountBrlMicros: -estorno,
      kind: "refund",
      // o prefixo separa estorno de créditos do plano (conta na expiração do ciclo) e de recarga
      referenceId: `${alvo.kind === "assinatura" ? "plano" : "recarga"}:${charge.id}:${total}`,
      description: `Reembolso de ${formatBrlCents(delta)}: créditos estornados`,
    });
  }
  await tx
    .update(schema.payments)
    .set({
      refundedBrlCents: total,
      status: total >= alvo.amountBrlCents ? "refunded" : "partially_refunded",
      paymentIntentId: alvo.paymentIntentId ?? pi,
    })
    .where(eq(schema.payments.id, alvo.id));
}
