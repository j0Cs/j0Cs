import type {
  ModelPricing,
  NormalizedUsage,
  PlanDefinition,
  PricingSettings,
  TokenPrices,
} from "./types";

const PER_MTOK = 1_000_000;

/** Arredonda para cima ignorando ruído de ponto flutuante (ex.: 22000000.000000004). */
const ceilClean = (x: number) => Math.ceil(Math.round(x * 1000) / 1000);

/** US$ por MTok → micro-dólares por MTok. */
export const usd = (dollarsPerMTok: number): number => Math.round(dollarsPerMTok * 1_000_000);

/** Escolhe a tabela de preços considerando sobretaxa de contexto longo. */
export function pricesFor(pricing: ModelPricing, usage: NormalizedUsage): TokenPrices {
  const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (pricing.longContext && promptTokens > pricing.longContext.thresholdTokens) {
    return pricing.longContext;
  }
  return pricing;
}

/**
 * Custo do provedor em micro-dólares. Arredonda para cima: em caso de dúvida,
 * a plataforma registra o custo maior (nunca subestima o que vai pagar).
 */
export function computeCostUsdMicros(usage: NormalizedUsage, pricing: ModelPricing): number {
  const p = pricesFor(pricing, usage);
  const total =
    usage.inputTokens * p.inputUsdMicrosPerMTok +
    usage.cacheReadTokens * p.cacheReadUsdMicrosPerMTok +
    usage.cacheWriteTokens * p.cacheWriteUsdMicrosPerMTok +
    usage.outputTokens * p.outputUsdMicrosPerMTok;
  return Math.ceil(total / PER_MTOK);
}

/** Custo efetivo em micro-reais: câmbio + IOF/spread/tributos. */
export function effectiveCostBrlMicros(costUsdMicros: number, settings: PricingSettings): number {
  return ceilClean(costUsdMicros * settings.fxUsdBrl * (1 + settings.costOverheadPercent / 100));
}

/** Valor debitado do cliente em micro-reais: custo efetivo + markup do modelo. */
export function computeChargeBrlMicros(
  costUsdMicros: number,
  settings: PricingSettings,
  markupPercent: number,
): number {
  return ceilClean(effectiveCostBrlMicros(costUsdMicros, settings) * (1 + markupPercent / 100));
}

/** Preço de tabela ao cliente, em R$ por 1 milhão de tokens (para exibir no catálogo). */
export function retailBrlPerMTok(
  usdMicrosPerMTok: number,
  settings: PricingSettings,
  markupPercent: number,
): number {
  return computeChargeBrlMicros(usdMicrosPerMTok, settings, markupPercent) / 1_000_000;
}

export interface UsageQuote {
  costUsdMicros: number;
  effectiveCostBrlMicros: number;
  chargeBrlMicros: number;
  marginBrlMicros: number;
}

export function quoteUsage(
  usage: NormalizedUsage,
  pricing: ModelPricing,
  settings: PricingSettings,
  markupPercent: number,
): UsageQuote {
  const costUsdMicros = computeCostUsdMicros(usage, pricing);
  const effective = effectiveCostBrlMicros(costUsdMicros, settings);
  const charge = computeChargeBrlMicros(costUsdMicros, settings, markupPercent);
  return {
    costUsdMicros,
    effectiveCostBrlMicros: effective,
    chargeBrlMicros: charge,
    marginBrlMicros: charge - effective,
  };
}

// ---------------------------------------------------------------------------
// Simulador de margem de planos (usado no painel do dono e na documentação)
// ---------------------------------------------------------------------------

export interface PlanEconomicsAssumptions {
  /** Impostos sobre faturamento (Simples/Presumido), em %. */
  revenueTaxPercent: number;
  /** Taxas do gateway de pagamento (cartão/Pix/boleto), em %. */
  paymentFeePercent: number;
  /** Markup médio ponderado aplicado no consumo, em %. */
  blendedMarkupPercent: number;
  /** Infra por assento ativo/mês (hospedagem, banco, sandboxes, e-mail), em centavos. */
  infraPerSeatBrlCents: number;
}

export interface PlanEconomicsRow {
  utilizationPercent: number;
  netRevenueBrl: number;
  apiCostBrl: number;
  infraBrl: number;
  grossProfitBrl: number;
  grossMarginPercent: number;
}

/**
 * Margem de um plano para diferentes níveis de uso dos créditos incluídos.
 * O custo de API sai do markup: R$ X de crédito consumido custam X / (1 + markup).
 */
export function simulatePlan(
  plan: Pick<PlanDefinition, "priceBrlCents" | "includedCreditsBrlCents" | "seats">,
  a: PlanEconomicsAssumptions,
  utilizations: number[] = [30, 60, 100],
): PlanEconomicsRow[] {
  const price = plan.priceBrlCents / 100;
  const credits = plan.includedCreditsBrlCents / 100;
  const net = price * (1 - (a.revenueTaxPercent + a.paymentFeePercent) / 100);
  const infra = (a.infraPerSeatBrlCents / 100) * plan.seats;
  return utilizations.map((u) => {
    const apiCost = (credits * (u / 100)) / (1 + a.blendedMarkupPercent / 100);
    const profit = net - apiCost - infra;
    return {
      utilizationPercent: u,
      netRevenueBrl: round2(net),
      apiCostBrl: round2(apiCost),
      infraBrl: round2(infra),
      grossProfitBrl: round2(profit),
      grossMarginPercent: round2((profit / price) * 100),
    };
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Formatação (pt-BR)
// ---------------------------------------------------------------------------

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlPrecise = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const int = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatBrl = (reais: number) => brl.format(reais);
export const formatBrlMicros = (micros: number) =>
  Math.abs(micros) < 10_000 && micros !== 0 ? brlPrecise.format(micros / 1e6) : brl.format(micros / 1e6);
export const formatBrlCents = (cents: number) => brl.format(cents / 100);
export const formatUsdMicros = (micros: number) => usdFmt.format(micros / 1e6);
export const formatInt = (n: number) => int.format(n);
export const formatPercent = (n: number) => `${pct.format(n)}%`;
export const plural = (n: number, one: string, many: string) => `${int.format(n)} ${n === 1 ? one : many}`;
export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);
