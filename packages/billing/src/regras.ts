/**
 * Regras puras da cobrança (sem Stripe nem banco), cobertas por testes unitários.
 *
 * Créditos da assinatura: cada linha de fatura de um plano vale
 *   créditos inclusos do plano × (valor da linha ÷ preço unitário).
 * Numa renovação isso dá créditos × assentos. Numa troca para cima no meio do ciclo, o Stripe cobra
 * a diferença proporcional (linha positiva do plano novo, negativa do antigo) e os créditos seguem
 * a mesma proporção: quem paga metade do ciclo de diferença recebe metade da diferença de créditos.
 */

export const PREFIXO_PRODUTO = "forja_plan_";
export const produtoDoPlano = (planId: string) => `${PREFIXO_PRODUTO}${planId}`;
export const planoDoProduto = (productId: string | null | undefined) =>
  productId?.startsWith(PREFIXO_PRODUTO) ? productId.slice(PREFIXO_PRODUTO.length) : null;
/** Um preço por plano e valor: mudar o preço no painel cria um preço novo (assinantes antigos mantêm o deles). */
export const chaveDoPreco = (planId: string, centavos: number) => `forja_plan_${planId}_brl_${centavos}_mensal`;

/** Recargas avulsas (doc 3): mesmo preço de tabela, R$ 1 de crédito por R$ 1 pago. */
export const PACOTES_DE_RECARGA_CENTAVOS = [100_00, 300_00, 1000_00] as const;
export const ehPacoteDeRecarga = (centavos: number) => (PACOTES_DE_RECARGA_CENTAVOS as readonly number[]).includes(centavos);

export const MAX_ASSENTOS = 200;
/** Validade do boleto da assinatura e do QR Code Pix da recarga. */
export const BOLETO_DIAS = 3;
export const PIX_SEGUNDOS = 60 * 60;

export const centavosParaMicros = (centavos: number) => Math.round(centavos * 10_000);

export interface LinhaDeFatura {
  /** id do produto no Stripe (forja_plan_...) */
  produto: string | null;
  /** valor da linha em centavos (negativo no crédito de tempo não usado) */
  valorCentavos: number;
  /** preço unitário do plano em centavos */
  precoUnitarioCentavos: number | null;
  quantidade: number | null;
  proracao: boolean;
}

/** Créditos (em centavos) que uma fatura paga concede; nunca negativo. */
export function creditosDaFatura(linhas: LinhaDeFatura[], creditosDoPlano: (planId: string) => number | null): number {
  let total = 0;
  for (const l of linhas) {
    const plano = planoDoProduto(l.produto);
    if (!plano || !l.precoUnitarioCentavos || l.precoUnitarioCentavos <= 0) continue;
    const inclusos = creditosDoPlano(plano);
    if (inclusos == null) continue;
    total += (inclusos * l.valorCentavos) / l.precoUnitarioCentavos;
  }
  return Math.max(0, Math.floor(total + 1e-9));
}

/** Plano que passa a valer com esta fatura: o da linha de maior valor positivo. */
export function planoDaFatura(linhas: LinhaDeFatura[]): string | null {
  let melhor: { plano: string; valor: number } | null = null;
  for (const l of linhas) {
    const plano = planoDoProduto(l.produto);
    if (!plano || l.valorCentavos <= 0) continue;
    if (!melhor || l.valorCentavos > melhor.valor) melhor = { plano, valor: l.valorCentavos };
  }
  return melhor?.plano ?? null;
}

export type StatusLocal = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

/** Status do Stripe → status local da assinatura. */
export function statusLocal(status: string): StatusLocal {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "incomplete":
      return "incomplete";
    case "past_due":
    case "unpaid":
    case "paused":
      return "past_due";
    default:
      // canceled, incomplete_expired e qualquer valor novo que o Stripe inventar
      return "canceled";
  }
}

/**
 * Créditos do plano que sobraram no ciclo e expiram na renovação. O consumo gasta primeiro os
 * créditos do plano (que vencem) e depois os de recarga (que não vencem no ciclo).
 */
export function sobraDoPlano(input: { concedidosMicros: number; consumidosMicros: number; saldoMicros: number }) {
  const sobra = input.concedidosMicros - input.consumidosMicros;
  return Math.max(0, Math.min(sobra, input.saldoMicros));
}

/** Nível de aviso de saldo baixo: 20% e 5% dos créditos do plano no ciclo. */
export function nivelDeSaldoBaixo(saldoMicros: number, referenciaMicros: number): 20 | 5 | null {
  if (referenciaMicros <= 0) return null;
  if (saldoMicros <= referenciaMicros * 0.05) return 5;
  if (saldoMicros <= referenciaMicros * 0.2) return 20;
  return null;
}

/** Manda o aviso só ao cruzar um nível novo (20 → 5); volta a valer quando entram créditos. */
export const deveAvisarSaldo = (nivel: 20 | 5 | null, jaAvisado: number | null) =>
  nivel !== null && (jaAvisado === null || nivel < jaAvisado);

/** Quantidade cobrada na assinatura: planos por assento têm mínimo; os outros, 1. */
export function quantidadeDoPlano(plano: { minSeats: number | null }, assentos: number | null | undefined): number {
  if (!plano.minSeats) return 1;
  const n = Math.floor(Number(assentos ?? plano.minSeats));
  if (!Number.isFinite(n) || n < plano.minSeats) throw new RegraDeCobranca(`Este plano tem no mínimo ${plano.minSeats} assentos.`);
  if (n > MAX_ASSENTOS) throw new RegraDeCobranca(`Para mais de ${MAX_ASSENTOS} assentos, fale com a gente.`);
  return n;
}

export class RegraDeCobranca extends Error {}

/**
 * Troca de plano: para cima vale na hora (cobra a diferença proporcional); para baixo vale na
 * renovação, sem reembolso. Voltar para o plano que já está pago neste ciclo também vale na
 * renovação (só desfaz uma redução agendada, sem cobrar de novo).
 */
export function tipoDeTroca(input: {
  valorAtualCentavosMes: number;
  valorNovoCentavosMes: number;
  voltandoAoPlanoPago: boolean;
}): "para_cima" | "para_baixo" {
  if (input.voltandoAoPlanoPago) return "para_baixo";
  return input.valorNovoCentavosMes > input.valorAtualCentavosMes ? "para_cima" : "para_baixo";
}

const MOTIVOS: Record<string, string> = {
  insufficient_funds: "saldo ou limite insuficiente no cartão",
  card_declined: "o banco recusou o cartão",
  generic_decline: "o banco recusou o cartão",
  do_not_honor: "o banco recusou o cartão",
  expired_card: "o cartão está vencido",
  incorrect_cvc: "o código de segurança está incorreto",
  incorrect_number: "o número do cartão está incorreto",
  lost_card: "o cartão foi bloqueado pelo banco",
  stolen_card: "o cartão foi bloqueado pelo banco",
  processing_error: "erro no processamento; tente de novo",
  authentication_required: "o banco pediu confirmação da compra (3D Secure)",
  fraudulent: "o banco recusou o cartão",
};

/** Motivo da recusa em português (o texto do Stripe vem em inglês). */
export function motivoDaRecusa(erro: { code?: string | null; decline_code?: string | null } | null | undefined) {
  if (!erro) return null;
  return MOTIVOS[erro.decline_code ?? ""] ?? MOTIVOS[erro.code ?? ""] ?? "pagamento recusado";
}

/** Rótulo do meio de pagamento. */
export const nomeDoMetodo = (m: string | null | undefined) =>
  m === "card" ? "cartão" : m === "boleto" ? "boleto" : m === "pix" ? "Pix" : (m ?? "—");
