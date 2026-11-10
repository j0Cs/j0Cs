import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS, DEFAULT_PLANS, DEFAULT_PRICING_SETTINGS, planoPermiteConstruir } from "../src/catalog";
import {
  computeChargeBrlMicros,
  computeCostUsdMicros,
  quoteUsage,
  retailBrlPerMTok,
  simulatePlan,
} from "../src/pricing";

const model = (id: string) => {
  const m = DEFAULT_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(id);
  return m;
};

describe("computeCostUsdMicros", () => {
  it("cobra cada tipo de token pela sua tarifa (Opus 5.5)", () => {
    // 1M input ($4) + 1M cache read ($0.20) + 1M cache write ($5) + 1M output ($20) = $29.20
    const cost = computeCostUsdMicros(
      { inputTokens: 1e6, cacheReadTokens: 1e6, cacheWriteTokens: 1e6, outputTokens: 1e6 },
      model("claude-opus-5-5").pricing,
    );
    expect(cost).toBe(29_200_000);
  });

  it("arredonda para cima frações de micro-dólar", () => {
    // 1 token de input Haiku = $0.0000001 → 0,1 micro-dólar → 1
    const cost = computeCostUsdMicros(
      { inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
      model("claude-haiku-5-5").pricing,
    );
    expect(cost).toBe(1);
  });

  it("aplica a sobretaxa de contexto longo acima do limite (GPT-6 Astra > 272K)", () => {
    const pricing = model("gpt-6-astra").pricing;
    const short = computeCostUsdMicros({ inputTokens: 272_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, pricing);
    const long = computeCostUsdMicros({ inputTokens: 272_001, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }, pricing);
    expect(short).toBe(2_720_000); // $2.72
    expect(long).toBe(5_440_020); // $5.44 (dobro)
  });

  it("conta tokens de cache no limite de contexto longo", () => {
    const pricing = model("grok-4.7").pricing;
    const cost = computeCostUsdMicros({ inputTokens: 100_000, cacheReadTokens: 100_000, cacheWriteTokens: 0, outputTokens: 0 }, pricing);
    // 200K de prompt → tabela longa: 100K × $4 + 100K × $1 = $0.50
    expect(cost).toBe(500_000);
  });
});

describe("cobrança em reais", () => {
  const s = { ...DEFAULT_PRICING_SETTINGS, fxUsdBrl: 5, costOverheadPercent: 10 };

  it("aplica câmbio, sobrecusto e markup", () => {
    // US$ 1 → R$ 5 × 1,10 = R$ 5,50 de custo efetivo → +50% = R$ 8,25
    expect(computeChargeBrlMicros(1_000_000, s, 50)).toBe(8_250_000);
  });

  it("quoteUsage separa custo, cobrança e margem", () => {
    const q = quoteUsage(
      { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 50_000 },
      model("claude-sonnet-5-5").pricing,
      s,
      50,
    );
    expect(q.costUsdMicros).toBe(500_000); // 50K × $10/MTok = $0.50
    expect(q.effectiveCostBrlMicros).toBe(2_750_000);
    expect(q.chargeBrlMicros).toBe(4_125_000);
    expect(q.marginBrlMicros).toBe(1_375_000);
  });

  it("preço de tabela por MTok", () => {
    expect(retailBrlPerMTok(4_000_000, s, 50)).toBeCloseTo(33, 5);
  });
});

describe("simulatePlan", () => {
  it("plano Pro mantém margem positiva mesmo com 100% dos créditos usados", () => {
    const pro = DEFAULT_PLANS.find((p) => p.id === "pro")!;
    const rows = simulatePlan(pro, {
      revenueTaxPercent: 11,
      paymentFeePercent: 4,
      blendedMarkupPercent: 50,
      infraPerSeatBrlCents: 20_00,
    });
    const full = rows.find((r) => r.utilizationPercent === 100)!;
    expect(full.apiCostBrl).toBe(200);
    expect(full.netRevenueBrl).toBe(507.45);
    expect(full.grossProfitBrl).toBe(287.45);
    expect(full.grossMarginPercent).toBeGreaterThan(30);
  });

  it("planos de gestão custam menos que os de construção e fecham no positivo", () => {
    const economia = { revenueTaxPercent: 11, paymentFeePercent: 4, blendedMarkupPercent: 50, infraPerSeatBrlCents: 20_00 };
    const gestao = DEFAULT_PLANS.filter((p) => p.kind === "gestao");
    const construcao = DEFAULT_PLANS.filter((p) => p.kind === "construcao" && p.priceBrlCents > 0);
    expect(gestao.length).toBeGreaterThan(0);
    expect(Math.max(...gestao.map((p) => p.priceBrlCents))).toBeLessThan(Math.min(...construcao.map((p) => p.priceBrlCents)));
    for (const p of gestao) expect(simulatePlan(p, economia).find((r) => r.utilizationPercent === 100)!.grossProfitBrl).toBeGreaterThan(0);
  });

  it("só a linha de construção libera o agente que implementa", () => {
    expect(planoPermiteConstruir({ kind: "gestao" })).toBe(false);
    expect(planoPermiteConstruir({ kind: "construcao" })).toBe(true);
    expect(planoPermiteConstruir(undefined)).toBe(true);
  });
});

describe("catálogo", () => {
  it("ids únicos e preços positivos", () => {
    const ids = new Set(DEFAULT_MODELS.map((m) => m.id));
    expect(ids.size).toBe(DEFAULT_MODELS.length);
    for (const m of DEFAULT_MODELS) {
      expect(m.pricing.inputUsdMicrosPerMTok).toBeGreaterThan(0);
      expect(m.pricing.outputUsdMicrosPerMTok).toBeGreaterThan(m.pricing.inputUsdMicrosPerMTok);
    }
  });
});

import { bloqueioDaOrg, diasRestantesDoTeste } from "../src/acesso";

describe("bloqueio da organização", () => {
  const agora = new Date("2026-11-20T12:00:00Z");
  const dia = 86_400_000;
  const base = { status: "active" as const, planId: "pro", suspendedReason: null, trialEndsAt: null, pastDueSince: null };

  it("ativa com plano: liberada", () => {
    expect(bloqueioDaOrg(base, agora)).toBeNull();
  });
  it("sem plano", () => {
    expect(bloqueioDaOrg({ ...base, planId: null }, agora)?.code).toBe("subscription_required");
  });
  it("teste vencido e teste em andamento", () => {
    expect(bloqueioDaOrg({ ...base, planId: "trial", trialEndsAt: new Date(agora.getTime() - 1) }, agora)?.code).toBe("trial_ended");
    expect(bloqueioDaOrg({ ...base, planId: "trial", trialEndsAt: new Date(agora.getTime() + dia) }, agora)).toBeNull();
  });
  it("inadimplência: carência de 3 dias, depois bloqueia mesmo antes da varredura", () => {
    expect(bloqueioDaOrg({ ...base, pastDueSince: new Date(agora.getTime() - 2 * dia) }, agora)).toBeNull();
    expect(bloqueioDaOrg({ ...base, pastDueSince: new Date(agora.getTime() - 3 * dia) }, agora)?.code).toBe("payment_overdue");
  });
  it("suspensa por inadimplência ou à mão", () => {
    expect(bloqueioDaOrg({ ...base, status: "suspended", suspendedReason: "inadimplencia" }, agora)?.code).toBe("payment_overdue");
    expect(bloqueioDaOrg({ ...base, status: "suspended", suspendedReason: "manual" }, agora)?.code).toBe("org_inactive");
  });
  it("dias restantes do teste", () => {
    expect(diasRestantesDoTeste(new Date(agora.getTime() + 2.5 * dia), agora)).toBe(3);
    expect(diasRestantesDoTeste(new Date(agora.getTime() - dia), agora)).toBe(0);
    expect(diasRestantesDoTeste(null, agora)).toBeNull();
  });
});
