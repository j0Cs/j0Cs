import { usd, type PlanEconomicsAssumptions } from "./pricing";
import type { CatalogModel, ModelTier, PlanDefinition, PricingSettings, TokenPrices } from "./types";

/**
 * Catálogo inicial de modelos (seed). Preços em US$/MTok conferidos nas páginas
 * oficiais em 04/11/2026 — o dono edita tudo no painel; o seed é só o ponto de partida.
 *
 * Fontes: platform.claude.com (Anthropic), developers.openai.com/api/docs/pricing,
 * aistudio.google.com/docs/pricing, docs.x.ai/docs/models.
 *
 * Observações:
 * - Gemini 4 Argon dobra de preço em 01/12/2026 e Gemini 3.8 Flash em 01/01/2027;
 *   já usamos os preços novos, porque o lançamento é em janeiro.
 * - Leitura de cache do Haiku 5.5 é estimada (10% do input) — confirmar.
 */

const p = (input: number, cacheRead: number, cacheWrite: number, output: number): TokenPrices => ({
  inputUsdMicrosPerMTok: usd(input),
  cacheReadUsdMicrosPerMTok: usd(cacheRead),
  cacheWriteUsdMicrosPerMTok: usd(cacheWrite),
  outputUsdMicrosPerMTok: usd(output),
});

/** Markup padrão por faixa: barato pode ter % maior; caro precisa de % menor para ser competitivo. */
export const DEFAULT_MARKUP_BY_TIER: Record<ModelTier, number> = {
  economico: 100,
  intermediario: 50,
  avancado: 50,
  premium: 35,
};

type SeedModel = Omit<CatalogModel, "markupPercent" | "enabled"> &
  Partial<Pick<CatalogModel, "markupPercent" | "enabled">>;

const SEED: SeedModel[] = [
  // ---------------- Anthropic (Claude) ----------------
  {
    id: "claude-fable-5-1",
    providerId: "anthropic",
    displayName: "Claude Fable 5.1",
    tier: "premium",
    description: "O Claude mais capaz: raciocínio profundo e tarefas agênticas longas.",
    contextWindow: 1_000_000,
    pricing: p(10, 0.25, 12.5, 50),
    sortOrder: 10,
  },
  {
    id: "claude-opus-5-5",
    providerId: "anthropic",
    displayName: "Claude Opus 5.5",
    tier: "avancado",
    description: "Padrão recomendado para engenharia de software e agentes.",
    contextWindow: 1_000_000,
    pricing: p(4, 0.2, 5, 20),
    sortOrder: 20,
  },
  {
    id: "claude-sonnet-5-5",
    providerId: "anthropic",
    displayName: "Claude Sonnet 5.5",
    tier: "intermediario",
    description: "Rápido e capaz para o dia a dia de código.",
    contextWindow: 1_000_000,
    pricing: p(2, 0.2, 2.5, 10),
    sortOrder: 30,
  },
  {
    id: "claude-haiku-5-5",
    providerId: "anthropic",
    displayName: "Claude Haiku 5.5",
    tier: "economico",
    description: "Muito barato: classificação, resumos, subtarefas.",
    contextWindow: 1_000_000,
    pricing: {
      ...p(0.1, 0.01, 0.125, 0.5),
      longContext: { thresholdTokens: 100_000, ...p(0.5, 0.05, 0.625, 2.5) },
    },
    sortOrder: 40,
  },
  // Alvos de fallback no servidor da Anthropic: não aparecem para o cliente,
  // existem só para precificar corretamente quando a API troca de modelo.
  {
    id: "claude-opus-5",
    providerId: "anthropic",
    displayName: "Claude Opus 5 (fallback)",
    tier: "avancado",
    description: "Usado apenas como fallback automático.",
    contextWindow: 1_000_000,
    pricing: p(5, 0.5, 6.25, 25),
    sortOrder: 900,
    enabled: false,
  },
  {
    id: "claude-opus-4-8",
    providerId: "anthropic",
    displayName: "Claude Opus 4.8 (fallback)",
    tier: "avancado",
    description: "Usado apenas como fallback automático.",
    contextWindow: 1_000_000,
    pricing: p(5, 0.5, 6.25, 25),
    sortOrder: 901,
    enabled: false,
  },
  {
    id: "claude-sonnet-5",
    providerId: "anthropic",
    displayName: "Claude Sonnet 5 (fallback)",
    tier: "intermediario",
    description: "Usado apenas como fallback automático.",
    contextWindow: 1_000_000,
    pricing: p(2, 0.2, 2.5, 10),
    sortOrder: 902,
    enabled: false,
  },
  // ---------------- OpenAI ----------------
  {
    id: "gpt-6-astra",
    providerId: "openai",
    displayName: "GPT-6 Astra",
    tier: "premium",
    description: "Topo de linha da OpenAI.",
    contextWindow: null,
    pricing: {
      ...p(10, 1, 10, 50),
      longContext: { thresholdTokens: 272_000, ...p(20, 2, 20, 75) },
    },
    sortOrder: 110,
  },
  {
    id: "gpt-6.1-sol",
    providerId: "openai",
    displayName: "GPT-6.1 Sol",
    tier: "intermediario",
    description: "Equilíbrio entre custo e qualidade da OpenAI.",
    contextWindow: null,
    pricing: {
      ...p(2, 0.1, 2, 10),
      longContext: { thresholdTokens: 272_000, ...p(4, 0.2, 4, 15) },
    },
    sortOrder: 120,
  },
  {
    id: "gpt-6.1-terra",
    providerId: "openai",
    displayName: "GPT-6.1 Terra",
    tier: "intermediario",
    description: "Versão mais barata da linha 6.1.",
    contextWindow: null,
    pricing: {
      ...p(1, 0.05, 1, 5),
      longContext: { thresholdTokens: 272_000, ...p(2, 0.1, 2, 7.5) },
    },
    sortOrder: 130,
  },
  {
    id: "gpt-6-luna",
    providerId: "openai",
    displayName: "GPT-6 Luna",
    tier: "economico",
    description: "Modelo leve e barato da OpenAI.",
    contextWindow: null,
    pricing: {
      ...p(0.1, 0.01, 0.1, 0.5),
      longContext: { thresholdTokens: 272_000, ...p(0.2, 0.02, 0.2, 0.75) },
    },
    sortOrder: 140,
  },
  // ---------------- Google (Gemini) ----------------
  {
    id: "gemini-4-argon",
    providerId: "google",
    displayName: "Gemini 4 Argon",
    tier: "avancado",
    description: "Modelo mais capaz do Google (preço a partir de 01/12/2026).",
    contextWindow: null,
    pricing: p(4, 0.2, 4, 20),
    sortOrder: 210,
  },
  {
    id: "gemini-3.8-flash",
    providerId: "google",
    displayName: "Gemini 3.8 Flash",
    tier: "intermediario",
    description: "Rápido, multimodal (preço a partir de 01/01/2027).",
    contextWindow: null,
    pricing: p(1.5, 0.15, 1.5, 7.5),
    sortOrder: 220,
  },
  {
    id: "gemini-3.1-flash-lite",
    providerId: "google",
    displayName: "Gemini 3.1 Flash-Lite",
    tier: "economico",
    description: "Opção mais econômica do Google.",
    contextWindow: null,
    pricing: p(0.25, 0.025, 0.25, 1.5),
    sortOrder: 230,
  },
  // ---------------- xAI (Grok) ----------------
  {
    id: "grok-4.7",
    providerId: "xai",
    displayName: "Grok 4.7",
    tier: "intermediario",
    description: "Modelo principal da xAI.",
    contextWindow: null,
    pricing: {
      ...p(2, 0.5, 2, 6),
      longContext: { thresholdTokens: 199_999, ...p(4, 1, 4, 12) },
    },
    sortOrder: 310,
  },
  {
    id: "grok-build-0.1",
    providerId: "xai",
    displayName: "Grok Build 0.1",
    tier: "intermediario",
    description: "Modelo da xAI focado em código.",
    contextWindow: null,
    pricing: {
      ...p(1, 0.2, 1, 2),
      longContext: { thresholdTokens: 199_999, ...p(2, 0.4, 2, 4) },
    },
    sortOrder: 320,
  },
];

export const DEFAULT_MODELS: CatalogModel[] = SEED.map((m) => ({
  ...m,
  markupPercent: m.markupPercent ?? DEFAULT_MARKUP_BY_TIER[m.tier],
  enabled: m.enabled ?? true,
}));

export const PROVIDERS: Record<
  CatalogModel["providerId"],
  { name: string; envKey: string; consoleUrl: string }
> = {
  anthropic: { name: "Anthropic (Claude)", envKey: "ANTHROPIC_API_KEY", consoleUrl: "https://platform.claude.com" },
  openai: { name: "OpenAI (GPT)", envKey: "OPENAI_API_KEY", consoleUrl: "https://platform.openai.com" },
  google: { name: "Google (Gemini)", envKey: "GEMINI_API_KEY", consoleUrl: "https://aistudio.google.com" },
  xai: { name: "xAI (Grok)", envKey: "XAI_API_KEY", consoleUrl: "https://console.x.ai" },
};

export const ALL_TIERS: ModelTier[] = ["economico", "intermediario", "avancado", "premium"];

export const TIER_LABELS: Record<ModelTier, string> = {
  economico: "Econômico",
  intermediario: "Intermediário",
  avancado: "Avançado",
  premium: "Premium",
};

/** Planos sugeridos (ver docs/03-precificacao-e-unit-economics.md). */
export const TRIAL_PLAN_ID = "trial";
export const TRIAL_DAYS = 7;

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    id: TRIAL_PLAN_ID,
    name: "Teste grátis",
    priceBrlCents: 0,
    includedCreditsBrlCents: 10_00,
    seats: 1,
    maxProjects: 2,
    allowedTiers: ["economico"],
    description: "7 dias com R$ 10 em créditos e modelos econômicos. Modelos premium liberam após o pagamento.",
    sortOrder: 0,
  },
  {
    id: "starter",
    name: "Starter",
    priceBrlCents: 147_00,
    includedCreditsBrlCents: 80_00,
    seats: 1,
    maxProjects: 5,
    allowedTiers: ["economico", "intermediario"],
    description: "Para começar: modelos rápidos e econômicos, 5 projetos.",
    sortOrder: 1,
  },
  {
    id: "pro",
    name: "Pro",
    priceBrlCents: 447_00,
    includedCreditsBrlCents: 300_00,
    seats: 1,
    maxProjects: null,
    allowedTiers: ALL_TIERS,
    description: "Todos os modelos, incluindo Opus, Fable e Astra. Projetos ilimitados.",
    sortOrder: 2,
  },
  {
    id: "max",
    name: "Max",
    priceBrlCents: 997_00,
    includedCreditsBrlCents: 720_00,
    seats: 1,
    maxProjects: null,
    allowedTiers: ALL_TIERS,
    description: "Para quem usa agentes o dia inteiro.",
    sortOrder: 3,
  },
  {
    id: "equipe",
    name: "Equipe (por assento)",
    priceBrlCents: 397_00,
    includedCreditsBrlCents: 260_00,
    seats: 1,
    maxProjects: null,
    allowedTiers: ALL_TIERS,
    description: "Mínimo 3 assentos; créditos somados num saldo único da empresa.",
    sortOrder: 4,
  },
];

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  fxUsdBrl: 5.4,
  costOverheadPercent: 15,
  minBalanceBrlMicros: 500_000, // R$ 0,50
};

/** Premissas do simulador de margem (editáveis em Câmbio e taxas). Validar com a contabilidade. */
export const DEFAULT_ECONOMICS: PlanEconomicsAssumptions = {
  revenueTaxPercent: 11,
  paymentFeePercent: 5,
  blendedMarkupPercent: 50,
  infraPerSeatBrlCents: 20_00,
};
