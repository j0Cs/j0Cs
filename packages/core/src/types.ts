/**
 * Tipos compartilhados do núcleo da plataforma.
 *
 * Convenções de unidades (sempre inteiros, para não perder centavos com float):
 * - Preços de modelo: micro-dólares por 1 milhão de tokens (US$ 4,00/MTok = 4_000_000).
 * - Custo de provedor: micro-dólares (US$ 0,0042 = 4_200).
 * - Dinheiro do cliente (créditos, cobranças): micro-reais (R$ 1,00 = 1_000_000).
 *   1 crédito exibido = R$ 1,00. Planos e preços públicos ficam em centavos.
 */

export type ProviderId = "anthropic" | "openai" | "google" | "xai";

/** Faixas comerciais de modelos — controlam acesso por plano e markup padrão. */
export type ModelTier = "economico" | "intermediario" | "avancado" | "premium";

export const MODEL_TIERS: readonly ModelTier[] = [
  "economico",
  "intermediario",
  "avancado",
  "premium",
] as const;

export interface TokenPrices {
  /** Input sem cache. */
  inputUsdMicrosPerMTok: number;
  /** Leitura de cache (prompt caching). */
  cacheReadUsdMicrosPerMTok: number;
  /** Escrita de cache (Anthropic cobra ~1,25x do input; outros provedores não cobram à parte). */
  cacheWriteUsdMicrosPerMTok: number;
  /** Output (inclui tokens de raciocínio/thinking). */
  outputUsdMicrosPerMTok: number;
}

export interface ModelPricing extends TokenPrices {
  /**
   * Alguns provedores cobram mais quando o prompt passa de um limite
   * (OpenAI > 272K, xAI >= 200K, Haiku 5.5 > 100K). Quando o total de tokens de
   * entrada do request passa o limite, TODOS os tokens usam a tabela `longContext`.
   */
  longContext?: TokenPrices & { thresholdTokens: number };
}

export interface CatalogModel {
  id: string;
  providerId: ProviderId;
  displayName: string;
  tier: ModelTier;
  description: string;
  contextWindow: number | null;
  pricing: ModelPricing;
  /** Markup sobre o custo efetivo, em pontos percentuais (50 = +50%). */
  markupPercent: number;
  enabled: boolean;
  sortOrder: number;
}

/** Uso normalizado entre provedores. Os campos NÃO se sobrepõem. */
export interface NormalizedUsage {
  /** Tokens de entrada cobrados a preço cheio (sem cache). */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Tokens de saída, incluindo raciocínio. */
  outputTokens: number;
}

export const EMPTY_USAGE: NormalizedUsage = {
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
};

/** Parâmetros globais de precificação, editáveis no painel do dono. */
export interface PricingSettings {
  /** Cotação USD→BRL usada para converter custo (ex.: 5.40). */
  fxUsdBrl: number;
  /**
   * Sobrecusto sobre o custo do provedor, em %: IOF do cartão internacional,
   * spread cambial e reserva para tributos de importação de serviços.
   * Valide o número real com a contabilidade.
   */
  costOverheadPercent: number;
  /** Saldo mínimo (micro-reais) para iniciar uma chamada. */
  minBalanceBrlMicros: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlanDefinition {
  id: string;
  name: string;
  priceBrlCents: number;
  /** Créditos incluídos por ciclo, em centavos de real. */
  includedCreditsBrlCents: number;
  seats: number;
  maxProjects: number | null;
  allowedTiers: ModelTier[];
  description: string;
  sortOrder: number;
}
