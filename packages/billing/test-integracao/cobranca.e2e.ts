/**
 * Teste de integração da cobrança: Postgres local de verdade + Stripe simulado + o SDK oficial.
 * Cobre o "Pronto quando" da Sprint 2: assina o Pro, recebe créditos, recarrega por Pix, troca de
 * plano, tem uma renovação recusada (aviso → suspensão → reativação), reduz o plano, recebe um
 * reembolso e cancela; mais entregas repetidas e fora de ordem dos webhooks.
 *
 *   pnpm --filter @forja/billing test:integracao
 *
 * Cria e apaga o banco forja_teste_cobranca no MESMO servidor do DATABASE_URL, que precisa ser local.
 */
import { spawnSync } from "node:child_process";
import pg from "pg";
import { iniciarStripeSimulado } from "./stripe-simulado";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Defina DATABASE_URL (Postgres local).");
const u = new URL(base);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("O teste de integração só roda em Postgres local.");
const NOME = "forja_teste_cobranca";
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${NOME} with (force)`);
await admin.query(`create database ${NOME}`);
await admin.end();
u.pathname = `/${NOME}`;
const urlTeste = u.toString();

const sim = await iniciarStripeSimulado(12111);
process.env.DATABASE_URL = urlTeste;
process.env.DATABASE_URL_DIRECT = "";
process.env.STRIPE_SECRET_KEY = "sk_test_simulado";
process.env.STRIPE_API_BASE = sim.url;
process.env.WEB_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";

const mig = spawnSync("pnpm", ["--filter", "@forja/db", "migrate"], { env: process.env, encoding: "utf8" });
if (mig.status !== 0) throw new Error(`migração falhou:\n${mig.stdout}\n${mig.stderr}`);

const emails: string[] = [];
const logOriginal = console.log;
console.log = (...a: unknown[]) => {
  const t = a.map(String).join(" ");
  if (t.includes("[e-mail de desenvolvimento]")) emails.push(t);
  else logOriginal(...a);
};

const { DEFAULT_PLANS, bloqueioDaOrg } = await import("@forja/core");
const { authorize, GatewayError } = await import("@forja/core/server");
const db_ = await import("@forja/db");
const { createGatewayStore, createOrganizationForUser, eq, getDb, schema, closeDb } = db_;
const b = await import("../src/index");
const db = getDb();

let falhas = 0;
const ok = (cond: boolean, msg: string) => {
  logOriginal(`${cond ? "✔" : "✘"} ${msg}`);
  if (!cond) falhas++;
};

// ---------------------------------------------------------------- preparação
for (const p of DEFAULT_PLANS) await db.insert(schema.plans).values({ ...p, minSeats: p.minSeats ?? null }).onConflictDoNothing();
await db.insert(schema.models).values({
  id: "modelo-premium",
  providerId: "anthropic",
  displayName: "Premium",
  tier: "premium",
  description: "",
  enabled: true,
  markupPercent: 50,
  pricing: { inputUsdMicrosPerMTok: 1, cacheReadUsdMicrosPerMTok: 1, cacheWriteUsdMicrosPerMTok: 1, outputUsdMicrosPerMTok: 1 },
} as never).onConflictDoNothing();

const [dono] = await db.insert(schema.users).values({ name: "Ana Dona", email: "ana@empresa.test", emailVerified: true }).returning();
const org0 = await createOrganizationForUser(db, { userId: dono!.id, name: "Empresa Teste" });
const lerOrg = async () => (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, org0.id) }))!;
const saldo = async () => (await lerOrg()).creditBalanceBrlMicros;
const extrato = async () =>
  db.select().from(schema.creditLedger).where(eq(schema.creditLedger.orgId, org0.id)).orderBy(schema.creditLedger.createdAt);
const R = (reais: number) => reais * 1_000_000;

let n = 0;
const evento = (type: string, object: unknown, id = `evt_teste_${++n}`) =>
  ({ id, object: "event", type, created: Math.floor(Date.now() / 1000), data: { object: structuredClone(object) }, livemode: false }) as never;
const entregar = async (ev: never) => {
  const r = await b.processarEvento(db, b.getStripe(), ev);
  if (r.avisos.length) await b.enviarAvisos(db, r.avisos);
  return r;
};

ok((await saldo()) === R(10), "teste grátis começa com R$ 10");
ok(Boolean((await lerOrg()).trialEndsAt), "fim do teste gravado na organização");

// ---------------------------------------------------------------- 1. assina o Pro
const urlCheckout = await b.criarCheckoutAssinatura(db, { org: await lerOrg(), email: dono!.email, planId: "pro", baseUrl: "http://localhost:3000" });
ok(urlCheckout === "https://checkout.simulado/pagar", "checkout da assinatura criado");
const sessao = [...sim.estado.sessoes.values()].at(-1)!;
ok(
  JSON.stringify(sessao.allowed_payment_method_types) === JSON.stringify(["card", "boleto"]) && sessao.mode === "subscription",
  "assinatura no cartão ou boleto",
);
ok(sessao.metadata.org_id === org0.id && sessao.subscription_data.metadata.org_id === org0.id, "org_id no checkout e na assinatura");
ok(sim.estado.produtos.has("forja_plan_pro") && [...sim.estado.precos.values()].some((p) => p.lookup_key === "forja_plan_pro_brl_44700_mensal"), "produto e preço do Pro criados no Stripe");
ok(Boolean((await lerOrg()).billingCustomerId), "cliente do Stripe gravado");

const { assinatura: sub, fatura: f1 } = sim.pagarAssinatura(sessao.id);
await entregar(evento("checkout.session.completed", sessao));
await entregar(evento("customer.subscription.created", sub));
const evPago = evento("invoice.paid", f1);
const r1 = await entregar(evPago);
ok(r1.processado, "invoice.paid processado");
let org = await lerOrg();
ok(org.planId === "pro", "plano Pro em vigor depois do pagamento");
ok((await saldo()) === R(300), "créditos do Pro (R$ 300) e o que sobrou do teste expirou");
const ex1 = await extrato();
ok(ex1.some((l) => l.kind === "expiry" && l.amountBrlMicros === -R(10)), "extrato: créditos do teste expirados");
const trial = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.planId, "trial") });
ok(trial?.status === "canceled", "assinatura de teste encerrada");
const pag1 = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, f1.id) });
ok(pag1?.status === "paid" && pag1.method === "card" && pag1.amountBrlCents === 447_00 && Boolean(pag1.paymentIntentId), "pagamento gravado (cartão, R$ 447)");

// premium liberado no gateway
const store = createGatewayStore(db);
let autorizado = true;
try {
  await authorize(store, { orgId: org0.id, modelId: "modelo-premium", messages: [] });
} catch (e) {
  autorizado = !(e instanceof GatewayError && e.code !== "provider_unavailable");
}
ok(autorizado, "modelo premium autorizado no Pro (só falta a chave do provedor)");

// ---------------------------------------------------------------- 2. webhooks repetidos
const repetido = await entregar(evPago);
ok(!repetido.processado && (await saldo()) === R(300), "mesmo evento de novo: ignorado");
await entregar(evento("invoice.paid", f1));
ok((await saldo()) === R(300), "outro evento da mesma fatura: créditos não duplicam");

// ---------------------------------------------------------------- 3. consumo e saldo baixo
// o consumo real vem do gateway (recordUsage): um lançamento de uso e o saldo descontado
await db.insert(schema.creditLedger).values({ orgId: org0.id, amountBrlMicros: -R(250), kind: "usage", description: "uso simulado" });
await db
  .update(schema.organizations)
  .set({ creditBalanceBrlMicros: db_.sql`${schema.organizations.creditBalanceBrlMicros} - ${R(250)}` })
  .where(eq(schema.organizations.id, org0.id));
const antes = emails.length;
await b.verificarSaldoBaixo(db, org0.id);
await b.verificarSaldoBaixo(db, org0.id);
ok(emails.length === antes + 1 && (await lerOrg()).lowBalanceNotified === 20, "saldo em 16%: um aviso de 20%, sem repetir");

// ---------------------------------------------------------------- 4. recarga por Pix
await b.criarCheckoutRecarga(db, { org: await lerOrg(), email: dono!.email, valorCentavos: 300_00, baseUrl: "http://localhost:3000" });
const sRec = [...sim.estado.sessoes.values()].at(-1)!;
ok(JSON.stringify(sRec.allowed_payment_method_types) === JSON.stringify(["pix", "card"]) && sRec.mode === "payment", "recarga por Pix ou cartão");
let recusou = false;
try {
  await b.criarCheckoutRecarga(db, { org: await lerOrg(), email: dono!.email, valorCentavos: 123_00, baseUrl: "x" });
} catch (e) {
  recusou = e instanceof b.RegraDeCobranca;
}
ok(recusou, "valor fora dos pacotes recusado");
const piRec = sim.pagarRecarga(sRec.id, "pix");
await entregar(evento("checkout.session.completed", { ...sRec, payment_status: "unpaid" }));
const pend = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, sRec.id) });
ok(pend?.status === "pending" && (await saldo()) === R(50), "Pix gerado: pagamento pendente, sem crédito ainda");
await entregar(evento("checkout.session.async_payment_succeeded", { ...sRec, payment_status: "paid" }));
ok((await saldo()) === R(350), "Pix pago: R$ 300 entram na hora");
const pagRec = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, sRec.id) });
ok(pagRec?.status === "paid" && pagRec.method === "pix" && pagRec.paymentIntentId === piRec.id, "recarga gravada como Pix");
ok((await lerOrg()).lowBalanceNotified === null, "aviso de saldo rearmado depois da recarga");
await entregar(evento("checkout.session.completed", { ...sRec, payment_status: "paid" }));
ok((await saldo()) === R(350), "evento atrasado da mesma recarga não credita de novo");

// ---------------------------------------------------------------- 5. troca para o Max no meio do ciclo
const troca = await b.trocarPlano(db, { org: await lerOrg(), planId: "max" });
ok(troca.tipo === "para_cima", "troca para cima vale na hora");
const subAtual = sim.estado.assinaturas.get(sub.id)!;
const fTroca = sim.estado.faturas.get(subAtual.latest_invoice)!;
const chamadaTroca = sim.estado.chamadas.filter((c) => c.metodo === "POST" && c.caminho === `/v1/subscriptions/${sub.id}`).at(-1)!;
ok(chamadaTroca.corpo.proration_behavior === "always_invoice" && chamadaTroca.corpo.payment_behavior === "pending_if_incomplete", "cobra a diferença na hora, só muda se pagar");
await entregar(evento("customer.subscription.updated", subAtual));
await entregar(evento("invoice.paid", fTroca));
org = await lerOrg();
// 720 × 0,5 − 300 × 0,5 = 210
ok(org.planId === "max" && (await saldo()) === R(560), "Max em vigor e R$ 210 de créditos proporcionais");

// ---------------------------------------------------------------- 6. renovação recusada
const fRecusada = sim.renovar(sub.id, false);
const emailsAntes = emails.length;
await entregar(evento("customer.subscription.updated", sim.estado.assinaturas.get(sub.id)));
await entregar(evento("invoice.payment_failed", fRecusada));
org = await lerOrg();
const pagFalho = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, fRecusada.id) });
ok(pagFalho?.status === "failed" && pagFalho.failureMessage === "saldo ou limite insuficiente no cartão", "recusa gravada com o motivo em português");
ok(Boolean(org.pastDueSince) && emails.length === emailsAntes + 1, "carência começou e o dono recebeu o aviso");
ok(bloqueioDaOrg(org) === null, "dentro da carência o uso continua");
const rotina1 = await b.rotinaDiariaDeCobranca(db);
ok(rotina1.suspensas === 0, "rotina diária não suspende antes de 3 dias");
await db
  .update(schema.organizations)
  .set({ pastDueSince: new Date(Date.now() - 4 * 86_400_000) })
  .where(eq(schema.organizations.id, org0.id));
const rotina2 = await b.rotinaDiariaDeCobranca(db);
org = await lerOrg();
ok(rotina2.suspensas === 1 && org.status === "suspended" && org.suspendedReason === "inadimplencia", "depois de 3 dias: suspensa por inadimplência");
let codigo = "";
try {
  await authorize(store, { orgId: org0.id, modelId: "modelo-premium", messages: [] });
} catch (e) {
  codigo = e instanceof GatewayError ? e.code : "outro";
}
ok(codigo === "payment_overdue", "gateway bloqueia com a mensagem de pagamento pendente");
let recargaBloqueada = false;
try {
  await b.criarCheckoutRecarga(db, { org, email: dono!.email, valorCentavos: 100_00, baseUrl: "x" });
} catch (e) {
  recargaBloqueada = e instanceof b.RegraDeCobranca;
}
ok(recargaBloqueada, "suspensa não recarrega (precisa pagar a assinatura)");

// ---------------------------------------------------------------- 7. paga e reativa
const fPaga = sim.pagarFatura(fRecusada.id);
await entregar(evento("customer.subscription.updated", sim.estado.assinaturas.get(sub.id)));
await entregar(evento("invoice.paid", fPaga));
org = await lerOrg();
ok(org.status === "active" && org.suspendedReason === null && org.pastDueSince === null, "pagamento entrou: reativada na hora");
// ciclo anterior: concedidos 300 + 210 = 510; consumidos 250 → sobra 260 expira; ficam os R$ 300 da recarga + 720 do Max
const saldoRenovado = await saldo();
if (saldoRenovado !== R(1020)) {
  for (const l of await extrato()) logOriginal(`   ${l.createdAt.toISOString()} ${l.kind} ${l.amountBrlMicros / 1e6} ${l.referenceId ?? ""} ${l.description}`);
  logOriginal(`   planCreditsSince=${(await lerOrg()).planCreditsSince?.toISOString()}`);
}
ok(saldoRenovado === R(1020), `renovação: sobra do plano expirou, recarga ficou e entraram R$ 720 do Max (saldo R$ ${saldoRenovado / 1e6})`);
ok((await db.query.payments.findFirst({ where: eq(schema.payments.externalId, fRecusada.id) }))?.status === "paid", "fatura recusada agora aparece como paga");

// ---------------------------------------------------------------- 8. fatura antiga fora de ordem
await entregar(evento("invoice.paid", fTroca));
ok((await lerOrg()).planId === "max" && (await saldo()) === R(1020), "fatura antiga reentregue: não muda plano nem credita");

// ---------------------------------------------------------------- 9. redução para o Starter (vale na renovação)
const reducao = await b.trocarPlano(db, { org: await lerOrg(), planId: "starter" });
const chamadaReducao = sim.estado.chamadas.filter((c) => c.metodo === "POST" && c.caminho === `/v1/subscriptions/${sub.id}`).at(-1)!;
ok(reducao.tipo === "para_baixo" && chamadaReducao.corpo.proration_behavior === "none", "redução sem cobrança nem reembolso");
await entregar(evento("customer.subscription.updated", sim.estado.assinaturas.get(sub.id)));
const subLocal = await b.assinaturaVigente(db, org0.id);
ok((await lerOrg()).planId === "max" && subLocal?.planId === "starter", "Max continua até a renovação; Starter agendado");
const desfaz = await b.trocarPlano(db, { org: await lerOrg(), planId: "max" });
const chamadaDesfaz = sim.estado.chamadas.filter((c) => c.metodo === "POST" && c.caminho === `/v1/subscriptions/${sub.id}`).at(-1)!;
ok(desfaz.tipo === "para_baixo" && chamadaDesfaz.corpo.proration_behavior === "none", "voltar ao plano já pago não cobra de novo");
await entregar(evento("customer.subscription.updated", sim.estado.assinaturas.get(sub.id)));

// ---------------------------------------------------------------- 10. reembolso parcial da recarga
await entregar(evento("charge.refunded", { id: "ch_rec", object: "charge", payment_intent: piRec.id, amount: 300_00, amount_refunded: 150_00 }));
const pagReemb = await db.query.payments.findFirst({ where: eq(schema.payments.externalId, sRec.id) });
ok(pagReemb?.status === "partially_refunded" && pagReemb.refundedBrlCents === 150_00 && (await saldo()) === R(870), "reembolso de metade: R$ 150 estornados");
await entregar(evento("charge.refunded", { id: "ch_rec", object: "charge", payment_intent: piRec.id, amount: 300_00, amount_refunded: 150_00 }));
ok((await saldo()) === R(870), "mesmo reembolso reentregue: não estorna de novo");

// ---------------------------------------------------------------- 11. portal e cancelamento
const urlPortal = await b.criarSessaoDoPortal({ org: await lerOrg(), baseUrl: "http://localhost:3000" });
ok(urlPortal === "https://portal.simulado/", "portal do cliente aberto");
const subFinal = sim.estado.assinaturas.get(sub.id)!;
subFinal.cancel_at_period_end = true;
await entregar(evento("customer.subscription.updated", subFinal));
ok((await b.assinaturaVigente(db, org0.id))?.cancelAtPeriodEnd === true, "cancelamento agendado aparece");
subFinal.status = "canceled";
await entregar(evento("customer.subscription.deleted", subFinal));
org = await lerOrg();
ok(org.planId === null && bloqueioDaOrg(org)?.code === "subscription_required", "assinatura encerrada: sem plano, uso bloqueado, dados mantidos");
// sobram os R$ 150 da recarga (o plano expirou)
ok((await saldo()) === R(150), "créditos do plano expiraram; os da recarga ficaram guardados");

// ---------------------------------------------------------------- 12. teste grátis vencido
const [outro] = await db.insert(schema.users).values({ name: "Beto", email: "beto@empresa.test", emailVerified: true }).returning();
const org2 = await createOrganizationForUser(db, { userId: outro!.id, name: "Outra Empresa" });
await db.update(schema.organizations).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(schema.organizations.id, org2.id));
await db.update(schema.subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(schema.subscriptions.orgId, org2.id));
const o2 = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, org2.id) }))!;
ok(bloqueioDaOrg(o2)?.code === "trial_ended", "teste vencido bloqueia na hora, sem esperar a rotina");
const emailsAntesTeste = emails.length;
const rotina3 = await b.rotinaDiariaDeCobranca(db);
ok(rotina3.testesEncerrados === 1 && rotina3.avisosDeFimDoTeste === 1 && emails.length === emailsAntesTeste + 1, "rotina encerra o teste e avisa uma vez");
const rotina4 = await b.rotinaDiariaDeCobranca(db);
ok(rotina4.testesEncerrados === 0, "rotina de novo: nada a fazer");

// ---------------------------------------------------------------- 13. Equipe por assento
let minimo = false;
try {
  await b.criarCheckoutAssinatura(db, { org: o2, email: outro!.email, planId: "equipe", assentos: 2, baseUrl: "x" });
} catch (e) {
  minimo = e instanceof b.RegraDeCobranca;
}
ok(minimo, "Equipe com menos de 3 assentos recusado");
await b.criarCheckoutAssinatura(db, { org: o2, email: outro!.email, planId: "equipe", assentos: 5, baseUrl: "x" });
const sEq = [...sim.estado.sessoes.values()].at(-1)!;
ok(Number(sEq.line_items[0].quantity) === 5, "Equipe com 5 assentos no checkout");
const { assinatura: subEq, fatura: fEq } = sim.pagarAssinatura(sEq.id);
await entregar(evento("customer.subscription.created", subEq));
await entregar(evento("invoice.paid", fEq));
const o2b = (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, org2.id) }))!;
ok(o2b.planId === "equipe" && o2b.creditBalanceBrlMicros === R(5 * 260), "Equipe: R$ 260 × 5 assentos num saldo único");
const vagas = await db_.seatUsage(db, org2.id);
ok(vagas.limit === 5, "limite de assentos da equipe = 5");

// ---------------------------------------------------------------- 14. painel do dono
const painel = await b.resumoDoPainel(db);
ok(painel.assinantes === 1 && painel.mrrCentavos === 5 * 397_00, "painel: 1 assinatura ativa, MRR da Equipe");
ok(painel.porMes[0]!.recargas === 300_00 && painel.porMes[0]!.reembolsos === 150_00, "painel: recargas e reembolsos do mês");

// ---------------------------------------------------------------- 15. convite de fundador (beta fechado)
const cupomId = await b.criarCupomDeFundador({ nome: "Fundador · Agência", descontoCentavos: 150_00, meses: 6 });
ok(cupomId.startsWith("cupom"), "cupom de fundador criado no Stripe");
const semErro = async (fn: () => Promise<unknown>) => fn().then(() => "sem erro", (e: Error) => e.message);
ok(/pelo menos R\$ 1/.test(await semErro(() => b.criarCupomDeFundador({ nome: "x", descontoCentavos: 0, meses: 6 }))), "cupom sem desconto é recusado");
await db.insert(schema.betaInvites).values([
  { code: "FUNDADOR01", label: "Agência", trialDays: 30, creditsBrlCents: 50_00, stripeCouponId: cupomId, offer: "Pro por R$ 297 nos 6 primeiros meses", maxUses: 1 },
  { code: "VENCIDO001", label: "Antigo", trialDays: 30, creditsBrlCents: 50_00, maxUses: 5, expiresAt: new Date(Date.now() - 86_400_000) },
]);
ok((await db_.getBetaInvite(db, " fundador-01 "))?.label === "Agência" && (await db_.getBetaInvite(db, "VENCIDO001")) === null && (await db_.getBetaInvite(db, "NAOEXISTE1")) === null, "convite válido é achado (mesmo com espaços e hífen); vencido e inexistente não");
const [uFu, uFa] = await db.insert(schema.users).values([{ name: "Fu", email: "fu@teste.local", emailVerified: true }, { name: "Fa", email: "fa@teste.local", emailVerified: true }]).returning();
const [oA, oB] = await Promise.all([
  createOrganizationForUser(db, { userId: uFu!.id, name: "Fundadora A", convite: "FUNDADOR01" }),
  createOrganizationForUser(db, { userId: uFa!.id, name: "Fundadora B", convite: "FUNDADOR01" }),
]);
const comConvite = [oA, oB].filter((o) => o.betaInviteId);
const semConvite = [oA, oB].find((o) => !o.betaInviteId)!;
ok(comConvite.length === 1, "convite de 1 uso: dois cadastros ao mesmo tempo, só um leva");
const fund = comConvite[0]!;
const dias = (o: typeof fund) => Math.round((o.trialEndsAt!.getTime() - o.createdAt.getTime()) / 86_400_000);
const saldoDe = async (id: string) => (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, id) }))!.creditBalanceBrlMicros;
ok(dias(fund) === 30 && (await saldoDe(fund.id)) === 50_000_000, "fundador: 30 dias de teste e R$ 50 em créditos");
ok(dias(semConvite) === 7 && (await saldoDe(semConvite.id)) === 10_000_000, "quem ficou sem o convite recebe o teste normal (7 dias, R$ 10)");
const oV = await createOrganizationForUser(db, { userId: uFu!.id, name: "Com vencido", convite: "VENCIDO001" });
ok(oV.betaInviteId === null && dias(oV) === 7, "convite vencido não dá benefício");
await b.criarCheckoutAssinatura(db, { org: fund, email: "fu@teste.local", planId: "pro", baseUrl: "x" });
const sFund = JSON.stringify([...sim.estado.sessoes.values()].at(-1));
ok(sFund.includes(cupomId) && !sFund.includes("allow_promotion_codes"), "checkout do fundador já sai com o cupom (sem campo de código)");
await b.criarCheckoutAssinatura(db, { org: semConvite, email: "fa@teste.local", planId: "pro", baseUrl: "x" });
const sNormal = JSON.stringify([...sim.estado.sessoes.values()].at(-1));
ok(!sNormal.includes(cupomId) && sNormal.includes("allow_promotion_codes"), "checkout normal não leva o cupom e aceita código promocional");

// métricas do beta
const { metricasDoBeta } = await import("../../ops/src/metricas");
await db.insert(schema.usageEvents).values([
  { orgId: fund.id, modelId: "claude-sonnet-5-5", servedModelId: "claude-sonnet-5-5", providerId: "anthropic", inputTokens: 1000, cacheReadTokens: 3000, outputTokens: 500, costUsdMicros: 20_000, chargeBrlMicros: 200_000, pricingSnapshot: {}, status: "ok" },
  { orgId: fund.id, modelId: "claude-sonnet-5-5", servedModelId: "claude-sonnet-5-5", providerId: "anthropic", costUsdMicros: 0, chargeBrlMicros: 0, pricingSnapshot: {}, status: "error" },
]);
const mb = await metricasDoBeta(db, 30);
const cFund = mb.clientes.find((c) => c.orgId === fund.id);
ok(mb.funil.cadastros >= 5 && mb.funil.primeiraResposta >= 1 && mb.funil.respostaEm10Min >= 1 && mb.funil.assinantes >= 1, "funil: cadastros, primeira resposta (em 10 min) e assinantes contados");
ok(cFund?.requisicoes === 1 && cFund.chargeBrlMicros === 200_000 && cFund.convite === "Agência", "uso por cliente: só respostas certas contam, com a marca de fundador");
ok(mb.cache.lido >= 3000 && mb.modelos.some((x) => x.modelId === "claude-sonnet-5-5"), "cache e modelos mais usados");

logOriginal(`\n${falhas ? `✘ ${falhas} falha(s)` : "✔ tudo certo"} · e-mails gerados: ${emails.length}`);
await closeDb();
await sim.fechar();
const limpar = new pg.Client({ connectionString: base });
await limpar.connect();
await limpar.query(`drop database if exists ${NOME} with (force)`);
await limpar.end();
process.exit(falhas ? 1 : 0);
