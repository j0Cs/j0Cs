import { createServer, type IncomingMessage, type Server } from "node:http";

/**
 * Stripe simulado (só o que a cobrança usa), com estado em memória, para o teste de integração.
 * O SDK oficial fala com ele via STRIPE_API_BASE (aceito só com chave sk_test_). Os eventos do
 * webhook são montados pelo próprio teste a partir deste estado.
 */
type Obj = Record<string, any>;

export interface Simulado {
  url: string;
  estado: {
    clientes: Map<string, Obj>;
    produtos: Map<string, Obj>;
    precos: Map<string, Obj>;
    sessoes: Map<string, Obj>;
    assinaturas: Map<string, Obj>;
    faturas: Map<string, Obj>;
    intencoes: Map<string, Obj>;
    reembolsos: Obj[];
    chamadas: { metodo: string; caminho: string; corpo: Obj }[];
  };
  /** Paga o checkout de assinatura: cria assinatura ativa, 1ª fatura paga e o PaymentIntent. */
  pagarAssinatura(sessaoId: string, metodo?: "card" | "boleto"): { assinatura: Obj; fatura: Obj };
  /** Nova fatura de renovação para a assinatura (paga ou recusada). */
  renovar(subId: string, paga: boolean): Obj;
  pagarFatura(faturaId: string): Obj;
  /** PaymentIntent de uma recarga (Pix ou cartão). */
  pagarRecarga(sessaoId: string, metodo: "pix" | "card"): Obj;
  fechar(): Promise<void>;
}

/** form-urlencoded com colchetes (a[b][0][c]=v) → objeto. */
function parse(texto: string): Obj {
  const raiz: Obj = {};
  for (const [k, v] of new URLSearchParams(texto)) {
    const partes = k.replace(/\]/g, "").split("[");
    let atual: Obj = raiz;
    partes.forEach((p, i) => {
      const ultimo = i === partes.length - 1;
      const proximoEhIndice = !ultimo && /^\d+$/.test(partes[i + 1]!);
      if (ultimo) atual[p] = v;
      else atual = atual[p] ??= proximoEhIndice ? [] : {};
    });
  }
  return raiz;
}

const corpoDe = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => ok(b));
  });

let seq = 0;
const novoId = (prefixo: string) => `${prefixo}_sim${(++seq).toString().padStart(4, "0")}`;
const agora = () => Math.floor(Date.now() / 1000);
const MES = 30 * 24 * 3600;

export async function iniciarStripeSimulado(porta = 12111): Promise<Simulado> {
  const estado: Simulado["estado"] = {
    clientes: new Map(),
    produtos: new Map(),
    precos: new Map(),
    sessoes: new Map(),
    assinaturas: new Map(),
    faturas: new Map(),
    intencoes: new Map(),
    reembolsos: [],
    chamadas: [],
  };

  const lista = (data: Obj[]) => ({ object: "list", data, has_more: false, url: "/v1/x" });
  const erro404 = (msg: string) => ({ status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: msg } } });

  function itemDa(sub: Obj, precoId: string, quantidade: number, inicio: number, fim: number) {
    return {
      object: "list",
      data: [
        {
          id: sub.items?.data?.[0]?.id ?? novoId("si"),
          object: "subscription_item",
          price: estado.precos.get(precoId),
          quantity: quantidade,
          current_period_start: inicio,
          current_period_end: fim,
        },
      ],
      has_more: false,
    };
  }

  function novaIntencao(metodo: string, valor: number, sucesso = true) {
    const pi: Obj = {
      id: novoId("pi"),
      object: "payment_intent",
      amount: valor,
      payment_method_types: [metodo],
      status: sucesso ? "succeeded" : "requires_payment_method",
      latest_charge: { id: novoId("ch"), object: "charge", payment_method_details: { type: metodo } },
      last_payment_error: sucesso ? null : { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." },
    };
    estado.intencoes.set(pi.id, pi);
    return pi;
  }

  function novaFatura(sub: Obj, motivo: string, linhas: Obj[], paga: boolean, metodo = "card") {
    const total = linhas.reduce((t, l) => t + l.amount, 0);
    const pi = novaIntencao(metodo, total, paga);
    const fatura: Obj = {
      id: novoId("in"),
      object: "invoice",
      customer: sub.customer,
      billing_reason: motivo,
      status: paga ? "paid" : "open",
      amount_due: total,
      amount_paid: paga ? total : 0,
      hosted_invoice_url: `https://pagar.simulado/fatura`,
      parent: { type: "subscription_details", subscription_details: { subscription: sub.id, metadata: sub.metadata } },
      lines: { object: "list", data: linhas, has_more: false },
      status_transitions: { paid_at: paga ? agora() : null },
      _pi: pi.id,
    };
    estado.faturas.set(fatura.id, fatura);
    sub.latest_invoice = fatura.id;
    return fatura;
  }

  const linhaDoPlano = (preco: Obj, valor: number, quantidade: number, proracao: boolean) => ({
    id: novoId("il"),
    object: "line_item",
    amount: valor,
    quantity: quantidade,
    pricing: { type: "price_details", price_details: { price: preco.id, product: preco.product }, unit_amount_decimal: String(preco.unit_amount) },
    parent: { type: "subscription_item_details", subscription_item_details: { proration: proracao, subscription_item: "si" } },
  });

  function rotear(metodo: string, caminho: string, q: Obj, corpo: Obj): { status?: number; body: Obj } {
    let m: RegExpMatchArray | null;
    if (metodo === "POST" && caminho === "/v1/customers") {
      const c = { id: novoId("cus"), object: "customer", ...corpo };
      estado.clientes.set(c.id, c);
      return { body: c };
    }
    if ((m = caminho.match(/^\/v1\/products\/([^/]+)$/))) {
      const p = estado.produtos.get(m[1]!);
      if (!p) return erro404("No such product");
      if (metodo === "POST") Object.assign(p, corpo, { active: corpo.active !== "false" });
      return { body: p };
    }
    if (metodo === "POST" && caminho === "/v1/products") {
      const p: Obj = { object: "product", active: true, ...corpo };
      estado.produtos.set(p.id, p);
      return { body: p };
    }
    if (metodo === "GET" && caminho === "/v1/prices") {
      const chaves: string[] = Object.values(q.lookup_keys ?? {});
      return { body: lista([...estado.precos.values()].filter((p) => chaves.includes(p.lookup_key) && p.active)) };
    }
    if (metodo === "POST" && caminho === "/v1/prices") {
      const p = { id: novoId("price"), object: "price", active: true, ...corpo, unit_amount: Number(corpo.unit_amount) };
      estado.precos.set(p.id, p);
      return { body: p };
    }
    if (metodo === "POST" && caminho === "/v1/checkout/sessions") {
      const s = { id: novoId("cs"), object: "checkout.session", url: "https://checkout.simulado/pagar", status: "open", ...corpo };
      estado.sessoes.set(s.id, s);
      return { body: s };
    }
    if (metodo === "POST" && caminho === "/v1/coupons") {
      return { body: { id: novoId("cupom"), object: "coupon", ...corpo } };
    }
    if (metodo === "POST" && caminho === "/v1/billing_portal/sessions") {
      return { body: { id: novoId("bps"), object: "billing_portal.session", url: "https://portal.simulado/", ...corpo } };
    }
    if ((m = caminho.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
      const sub = estado.assinaturas.get(m[1]!);
      if (!sub) return erro404("No such subscription");
      if (metodo === "POST") {
        const atual = sub.items.data[0];
        const novoPreco = estado.precos.get(corpo.items[0].price)!;
        const qtd = Number(corpo.items[0].quantity ?? 1);
        if (corpo.proration_behavior === "always_invoice") {
          // metade do ciclo restante, para a conta do teste ficar redonda
          const credito = -Math.round((atual.price.unit_amount * atual.quantity) / 2);
          const debito = Math.round((novoPreco.unit_amount * qtd) / 2);
          novaFatura(sub, "subscription_update", [linhaDoPlano(atual.price, credito, atual.quantity, true), linhaDoPlano(novoPreco, debito, qtd, true)], true);
        }
        sub.items = itemDa(sub, novoPreco.id, qtd, atual.current_period_start, atual.current_period_end);
        sub.pending_update = null;
        const resposta = { ...sub };
        if (String(corpo["expand"]?.[0] ?? "") === "latest_invoice") resposta.latest_invoice = estado.faturas.get(sub.latest_invoice);
        return { body: resposta };
      }
      return { body: sub };
    }
    if (metodo === "GET" && caminho === "/v1/invoice_payments") {
      const f = estado.faturas.get(q.invoice);
      if (!f) return { body: lista([]) };
      return {
        body: lista([
          {
            id: novoId("inpay"),
            object: "invoice_payment",
            invoice: f.id,
            is_default: true,
            status: f.status === "paid" ? "paid" : "open",
            payment: { type: "payment_intent", payment_intent: f._pi },
          },
        ]),
      };
    }
    if ((m = caminho.match(/^\/v1\/payment_intents\/([^/]+)$/))) {
      const pi = estado.intencoes.get(m[1]!);
      return pi ? { body: pi } : erro404("No such payment_intent");
    }
    if (metodo === "POST" && caminho === "/v1/refunds") {
      const r = { id: novoId("re"), object: "refund", ...corpo, amount: Number(corpo.amount), status: "succeeded" };
      estado.reembolsos.push(r);
      return { body: r };
    }
    return { status: 400, body: { error: { type: "invalid_request_error", message: `simulado: ${metodo} ${caminho} não implementado` } } };
  }

  const servidor: Server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const texto = await corpoDe(req);
    const corpo = parse(texto);
    const q = parse(u.searchParams.toString());
    estado.chamadas.push({ metodo: req.method ?? "GET", caminho: u.pathname, corpo: req.method === "GET" ? q : corpo });
    const r = rotear(req.method ?? "GET", u.pathname, q, corpo);
    res.writeHead(r.status ?? 200, { "content-type": "application/json", "request-id": novoId("req") });
    res.end(JSON.stringify(r.body));
  });
  await new Promise<void>((ok) => servidor.listen(porta, "127.0.0.1", ok));

  return {
    url: `http://127.0.0.1:${porta}`,
    estado,
    pagarAssinatura(sessaoId, metodo = "card") {
      const s = estado.sessoes.get(sessaoId)!;
      const preco = estado.precos.get(s.line_items[0].price)!;
      const qtd = Number(s.line_items[0].quantity);
      const inicio = agora();
      const sub: Obj = {
        id: novoId("sub"),
        object: "subscription",
        customer: s.customer,
        status: "active",
        metadata: s.subscription_data?.metadata ?? {},
        cancel_at_period_end: false,
        cancel_at: null,
        pending_update: null,
      };
      sub.items = itemDa(sub, preco.id, qtd, inicio, inicio + MES);
      estado.assinaturas.set(sub.id, sub);
      const fatura = novaFatura(sub, "subscription_create", [linhaDoPlano(preco, preco.unit_amount * qtd, qtd, false)], true, metodo);
      Object.assign(s, { status: "complete", payment_status: "paid", subscription: sub.id, mode: "subscription" });
      return { assinatura: sub, fatura };
    },
    renovar(subId, paga) {
      const sub = estado.assinaturas.get(subId)!;
      const item = sub.items.data[0];
      const inicio = item.current_period_end;
      sub.items = itemDa(sub, item.price.id, item.quantity, inicio, inicio + MES);
      if (!paga) sub.status = "past_due";
      return novaFatura(sub, "subscription_cycle", [linhaDoPlano(item.price, item.price.unit_amount * item.quantity, item.quantity, false)], paga);
    },
    pagarFatura(faturaId) {
      const f = estado.faturas.get(faturaId)!;
      Object.assign(f, { status: "paid", amount_paid: f.amount_due, status_transitions: { paid_at: agora() } });
      const pi = estado.intencoes.get(f._pi)!;
      Object.assign(pi, { status: "succeeded", last_payment_error: null });
      const sub = estado.assinaturas.get(f.parent.subscription_details.subscription)!;
      sub.status = "active";
      return f;
    },
    pagarRecarga(sessaoId, metodo) {
      const s = estado.sessoes.get(sessaoId)!;
      const valor = Number(s.line_items[0].price_data.unit_amount);
      const pi = novaIntencao(metodo, valor);
      Object.assign(s, { payment_intent: pi.id, amount_total: valor, currency: "brl", mode: "payment" });
      return pi;
    },
    fechar: () => new Promise<void>((ok) => servidor.close(() => ok())),
  };
}
