import { bloqueioDaOrg, formatBrlCents, TRIAL_PLAN_ID } from "@forja/core";
import { and, desc, eq, inArray, isNull, schema, seatUsage, type Db } from "@forja/db";
import {
  BOLETO_DIAS,
  chaveDoPreco,
  ehPacoteDeRecarga,
  PIX_SEGUNDOS,
  planoDoProduto,
  produtoDoPlano,
  quantidadeDoPlano,
  RegraDeCobranca,
  tipoDeTroca,
} from "./regras";
import { getStripe, idDe, type Stripe } from "./stripe";

type Org = typeof schema.organizations.$inferSelect;
type Plano = typeof schema.plans.$inferSelect;

const APP = () => process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/** Assinatura do Stripe ainda viva (paga, em atraso ou esperando o 1º pagamento). */
export async function assinaturaVigente(db: Db, orgId: string) {
  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.orgId, orgId),
        eq(schema.subscriptions.billingProvider, "stripe"),
        inArray(schema.subscriptions.status, ["active", "past_due", "incomplete", "trialing"]),
      ),
    )
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);
  return sub ?? null;
}

/** Cliente do Stripe da organização (criado uma vez; corridas resolvidas pela chave de idempotência). */
export async function garantirCliente(db: Db, stripe: Stripe, org: Org, email: string) {
  if (org.billingCustomerId) return org.billingCustomerId;
  const cliente = await stripe.customers.create(
    { name: org.name, email, metadata: { org_id: org.id }, preferred_locales: ["pt-BR"] },
    { idempotencyKey: `forja-cliente-${org.id}` },
  );
  const [gravado] = await db
    .update(schema.organizations)
    .set({ billingCustomerId: cliente.id })
    .where(and(eq(schema.organizations.id, org.id), isNull(schema.organizations.billingCustomerId)))
    .returning({ id: schema.organizations.billingCustomerId });
  if (gravado?.id) return gravado.id;
  const atual = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, org.id) });
  return atual?.billingCustomerId ?? cliente.id;
}

const precos = new Map<string, string>();

/**
 * Produto (id fixo forja_plan_<plano>) e preço mensal do plano no Stripe, criados na primeira vez.
 * O preço é achado pela lookup_key com o valor: mudar o preço no painel cria um preço novo, e quem
 * já assina continua no preço antigo até trocar de plano.
 */
export async function garantirPreco(stripe: Stripe, plano: Plano) {
  const chave = chaveDoPreco(plano.id, plano.priceBrlCents);
  const emCache = precos.get(chave);
  if (emCache) return emCache;

  const produto = produtoDoPlano(plano.id);
  const nome = `${APP()} ${plano.name}`;
  try {
    const p = await stripe.products.retrieve(produto);
    if (p.name !== nome || !p.active) await stripe.products.update(produto, { name: nome, active: true });
  } catch (err) {
    if ((err as { code?: string }).code !== "resource_missing") throw err;
    await stripe.products.create(
      { id: produto, name: nome, metadata: { plano: plano.id } },
      { idempotencyKey: `forja-produto-${produto}` },
    );
  }

  const achados = await stripe.prices.list({ lookup_keys: [chave], active: true, limit: 1 });
  let id = achados.data[0]?.id;
  if (!id) {
    const preco = await stripe.prices.create(
      {
        product: produto,
        currency: "brl",
        unit_amount: plano.priceBrlCents,
        recurring: { interval: "month" },
        lookup_key: chave,
        metadata: { plano: plano.id },
      },
      { idempotencyKey: `forja-preco-${chave}` },
    );
    id = preco.id;
  }
  precos.set(chave, id);
  return id;
}

async function planoAssinavel(db: Db, planId: string) {
  const plano = await db.query.plans.findFirst({ where: and(eq(schema.plans.id, planId), eq(schema.plans.active, true)) });
  if (!plano || plano.priceBrlCents <= 0 || plano.id === TRIAL_PLAN_ID) throw new RegraDeCobranca("Este plano não está disponível.");
  return plano;
}

async function conferirAssentos(db: Db, orgId: string, plano: Plano, quantidade: number) {
  if (!plano.minSeats) return;
  const { used } = await seatUsage(db, orgId);
  if (quantidade < used) {
    throw new RegraDeCobranca(`A equipe já usa ${used} assentos (membros e convites). Escolha pelo menos ${used} ou remova pessoas antes.`);
  }
}

/** Checkout da assinatura (cartão ou boleto). Devolve a URL do Stripe. */
export async function criarCheckoutAssinatura(
  db: Db,
  input: { org: Org; email: string; planId: string; assentos?: number | null; baseUrl: string },
) {
  const stripe = getStripe();
  const plano = await planoAssinavel(db, input.planId);
  const vigente = await assinaturaVigente(db, input.org.id);
  if (vigente) {
    const recente = Date.now() - vigente.createdAt.getTime() < (BOLETO_DIAS + 1) * 24 * 60 * 60 * 1000;
    if (vigente.status !== "incomplete") throw new RegraDeCobranca("Você já tem uma assinatura. Para mudar, use “Mudar para este plano”.");
    if (recente) {
      throw new RegraDeCobranca(
        "Já existe uma assinatura esperando o pagamento (boleto). Pague o boleto em “Pagamentos e faturas” ou espere ele vencer para assinar de novo.",
      );
    }
  }
  const quantidade = quantidadeDoPlano(plano, input.assentos);
  await conferirAssentos(db, input.org.id, plano, quantidade);

  const cliente = await garantirCliente(db, stripe, input.org, input.email);
  const preco = await garantirPreco(stripe, plano);
  // convite de fundador: o cupom entra sozinho (o Stripe não aceita cupom fixo e campo de código juntos)
  const convite = input.org.betaInviteId
    ? await db.query.betaInvites.findFirst({ where: eq(schema.betaInvites.id, input.org.betaInviteId) })
    : null;
  const cupom = convite && !convite.revokedAt ? convite.stripeCouponId : null;
  const sessao = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: cliente,
    client_reference_id: input.org.id,
    locale: "pt-BR",
    line_items: [{ price: preco, quantity: quantidade }],
    allowed_payment_method_types: ["card", "boleto"],
    payment_method_options: { boleto: { expires_after_days: BOLETO_DIAS } },
    ...(cupom ? { discounts: [{ coupon: cupom }] } : { allow_promotion_codes: true }),
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    metadata: { org_id: input.org.id, tipo: "assinatura", plano: plano.id },
    subscription_data: { metadata: { org_id: input.org.id, plano: plano.id } },
    success_url: `${input.baseUrl}/plano?pagamento=assinatura`,
    cancel_url: `${input.baseUrl}/plano`,
  });
  if (!sessao.url) throw new Error("O Stripe não devolveu o endereço do checkout.");
  return sessao.url;
}

/**
 * Cria no Stripe o cupom de uma oferta de fundador: desconto fixo em reais por alguns meses
 * (ex.: R$ 150 de desconto por 6 meses faz o Pro de R$ 447 sair por R$ 297).
 */
export async function criarCupomDeFundador(input: { nome: string; descontoCentavos: number; meses: number }) {
  if (!Number.isInteger(input.descontoCentavos) || input.descontoCentavos < 100) throw new RegraDeCobranca("Informe o desconto em reais (pelo menos R$ 1).");
  if (!Number.isInteger(input.meses) || input.meses < 1 || input.meses > 24) throw new RegraDeCobranca("Informe por quantos meses vale o desconto (1 a 24).");
  const cupom = await getStripe().coupons.create({
    name: input.nome.slice(0, 40),
    amount_off: input.descontoCentavos,
    currency: "brl",
    duration: "repeating",
    duration_in_months: input.meses,
  });
  return cupom.id;
}

/** Checkout de recarga avulsa (Pix ou cartão). Só para quem já assina. */
export async function criarCheckoutRecarga(db: Db, input: { org: Org; email: string; valorCentavos: number; baseUrl: string }) {
  if (!ehPacoteDeRecarga(input.valorCentavos)) throw new RegraDeCobranca("Escolha um dos pacotes de recarga.");
  const bloqueio = bloqueioDaOrg(input.org);
  if (bloqueio) throw new RegraDeCobranca(bloqueio.message);
  if (!input.org.planId || input.org.planId === TRIAL_PLAN_ID) {
    throw new RegraDeCobranca("As recargas são para assinantes. Assine um plano primeiro.");
  }
  const stripe = getStripe();
  const cliente = await garantirCliente(db, stripe, input.org, input.email);
  const sessao = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: cliente,
    client_reference_id: input.org.id,
    locale: "pt-BR",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "brl",
          unit_amount: input.valorCentavos,
          product_data: { name: `Recarga de créditos ${APP()} (${formatBrlCents(input.valorCentavos)})` },
        },
      },
    ],
    allowed_payment_method_types: ["pix", "card"],
    payment_method_options: { pix: { expires_after_seconds: PIX_SEGUNDOS } },
    metadata: { org_id: input.org.id, tipo: "recarga", valor_centavos: String(input.valorCentavos) },
    payment_intent_data: { metadata: { org_id: input.org.id, tipo: "recarga" }, description: "Recarga de créditos" },
    success_url: `${input.baseUrl}/plano?pagamento=recarga`,
    cancel_url: `${input.baseUrl}/plano`,
  });
  if (!sessao.url) throw new Error("O Stripe não devolveu o endereço do checkout.");
  return sessao.url;
}

/** Portal do cliente (cartão, faturas, boleto em aberto, cancelamento). */
export async function criarSessaoDoPortal(input: { org: Org; baseUrl: string }) {
  if (!input.org.billingCustomerId) throw new RegraDeCobranca("Ainda não há pagamentos nesta conta.");
  const sessao = await getStripe().billingPortal.sessions.create({
    customer: input.org.billingCustomerId,
    return_url: `${input.baseUrl}/plano`,
    locale: "pt-BR",
  });
  return sessao.url;
}

/**
 * Troca de plano ou de assentos. Para cima: vale na hora e cobra a diferença proporcional (os
 * créditos proporcionais entram quando a fatura for paga). Para baixo: vale na renovação.
 */
export async function trocarPlano(db: Db, input: { org: Org; planId: string; assentos?: number | null }) {
  const vigente = await assinaturaVigente(db, input.org.id);
  if (!vigente?.externalId || vigente.status !== "active") {
    throw new RegraDeCobranca(
      vigente?.status === "past_due"
        ? "Regularize o pagamento em aberto antes de mudar de plano."
        : "Você ainda não tem uma assinatura ativa. Escolha um plano para assinar.",
    );
  }
  const plano = await planoAssinavel(db, input.planId);
  const quantidade = quantidadeDoPlano(plano, input.assentos);
  await conferirAssentos(db, input.org.id, plano, quantidade);

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(vigente.externalId);
  const item = sub.items.data[0];
  if (!item) throw new Error("Assinatura sem item no Stripe.");
  const preco = await garantirPreco(stripe, plano);
  if (item.price.id === preco && (item.quantity ?? 1) === quantidade) {
    return { tipo: "igual" as const, mensagem: "Esse já é o seu plano." };
  }

  const valorAtual = (item.price.unit_amount ?? 0) * (item.quantity ?? 1);
  const valorNovo = plano.priceBrlCents * quantidade;
  const planoPago = input.org.planId;
  // desfazer uma redução agendada (o plano pago neste ciclo continua) não cobra de novo
  const voltandoAoPlanoPago = planoPago === plano.id && planoDoProduto(idDe(item.price.product)) !== plano.id;
  const tipo = tipoDeTroca({ valorAtualCentavosMes: valorAtual, valorNovoCentavosMes: valorNovo, voltandoAoPlanoPago });
  const minuto = Math.floor(Date.now() / 60_000);

  if (tipo === "para_cima") {
    const atualizada = await stripe.subscriptions.update(
      sub.id,
      {
        items: [{ id: item.id, price: preco, quantity: quantidade }],
        proration_behavior: "always_invoice",
        // sem pagamento, nada muda: o plano antigo continua
        payment_behavior: "pending_if_incomplete",
        expand: ["latest_invoice"],
      },
      { idempotencyKey: `forja-troca-${sub.id}-${preco}-${quantidade}-${minuto}` },
    );
    const fatura = typeof atualizada.latest_invoice === "object" ? atualizada.latest_invoice : null;
    if (atualizada.pending_update) {
      return {
        tipo: "pendente" as const,
        mensagem: "Falta confirmar o pagamento da diferença. A troca vale assim que ele entrar.",
        url: fatura?.hosted_invoice_url ?? null,
      };
    }
    return { tipo: "para_cima" as const, mensagem: `Pronto: você está no plano ${plano.name}. Os créditos da diferença entram em instantes.` };
  }

  await stripe.subscriptions.update(
    sub.id,
    { items: [{ id: item.id, price: preco, quantity: quantidade }], proration_behavior: "none" },
    { idempotencyKey: `forja-troca-${sub.id}-${preco}-${quantidade}-${minuto}` },
  );
  const quando = vigente.currentPeriodEnd.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    tipo: "para_baixo" as const,
    mensagem: voltandoAoPlanoPago
      ? `Pronto: você continua no plano ${plano.name}.`
      : `Combinado: o plano ${plano.name} começa na renovação, em ${quando}. Até lá, nada muda.`,
  };
}

/** Resumo para a tela Plano e cobrança. */
export async function resumoDaCobranca(db: Db, orgId: string) {
  const [vigente, pagamentos] = await Promise.all([
    assinaturaVigente(db, orgId),
    db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orgId, orgId))
      .orderBy(desc(schema.payments.createdAt))
      .limit(12),
  ]);
  const ultimaPaga = pagamentos.find((p) => p.kind === "assinatura" && p.status === "paid");
  const pendente = pagamentos.find(
    (p) =>
      p.kind === "assinatura" &&
      (p.status === "failed" || p.status === "pending") &&
      (!ultimaPaga || p.createdAt > ultimaPaga.createdAt),
  );
  return { assinatura: vigente, pagamentos, pendente: pendente ?? null };
}
