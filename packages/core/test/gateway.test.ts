import { describe, expect, it } from "vitest";
import { DEFAULT_MODELS, DEFAULT_PRICING_SETTINGS } from "../src/catalog";
import { type GatewayEvent, type GatewayStore, type UsageRecord, runChat } from "../src/gateway";
import type { ProviderAdapter } from "../src/providers/types";
import type { ModelTier } from "../src/types";

function memoryStore(opts: { balance?: number; tiers?: ModelTier[]; keys?: string[] } = {}) {
  const records: UsageRecord[] = [];
  let balance = opts.balance ?? 10_000_000;
  const store: GatewayStore = {
    async getModel(id) {
      return DEFAULT_MODELS.find((m) => m.id === id) ?? null;
    },
    async getSettings() {
      return { ...DEFAULT_PRICING_SETTINGS, fxUsdBrl: 5, costOverheadPercent: 10 };
    },
    async getOrgAccess() {
      return { status: "active", balanceBrlMicros: balance, allowedTiers: opts.tiers ?? ["economico", "intermediario", "avancado", "premium"] };
    },
    async listProviderKeys() {
      return (opts.keys ?? ["k1"]).map((id) => ({ id, apiKey: `secret-${id}` }));
    },
    async recordUsage(r) {
      records.push(r);
      balance -= r.chargeBrlMicros;
      return { balanceBrlMicros: balance };
    },
  };
  return { store, records, balance: () => balance };
}

const okAdapter = (id: ProviderAdapter["id"] = "anthropic"): ProviderAdapter => ({
  id,
  async *stream(req) {
    yield { type: "text", text: "Olá, " };
    yield { type: "text", text: "mundo" };
    yield {
      type: "finish",
      servedModel: req.model,
      stopReason: "end_turn",
      refused: false,
      usageByModel: [{ model: req.model, usage: { inputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 50_000 } }],
    };
  },
});

async function collect(gen: AsyncGenerator<GatewayEvent>) {
  const out: GatewayEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const req = { orgId: "org1", modelId: "claude-sonnet-5-5", messages: [{ role: "user" as const, content: "oi" }] };

describe("runChat", () => {
  it("transmite o texto, mede o custo e debita o saldo", async () => {
    const { store, records, balance } = memoryStore();
    const events = await collect(runChat({ store, adapters: { anthropic: okAdapter() } }, req));

    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")).toBe("Olá, mundo");
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    // Sonnet 5.5: 1K × $2 + 50K × $10 = $0.502 → R$ 5 × 1,10 × 1,50 = R$ 4,1415
    expect(records[0]?.costUsdMicros).toBe(502_000);
    expect(records[0]?.chargeBrlMicros).toBe(4_141_500);
    expect(records[0]?.status).toBe("ok");
    expect(balance()).toBe(10_000_000 - 4_141_500);
  });

  it("bloqueia modelo fora do plano antes de chamar o provedor", async () => {
    const { store, records } = memoryStore({ tiers: ["economico"] });
    let called = false;
    const adapter: ProviderAdapter = { id: "anthropic", async *stream() { called = true; } };
    const events = await collect(runChat({ store, adapters: { anthropic: adapter } }, req));
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "plan_upgrade_required" })]);
    expect(called).toBe(false);
    expect(records).toHaveLength(0);
  });

  it("bloqueia sem saldo", async () => {
    const { store } = memoryStore({ balance: 100 });
    const events = await collect(runChat({ store, adapters: { anthropic: okAdapter() } }, req));
    expect(events[0]).toMatchObject({ type: "error", code: "insufficient_credits" });
  });

  it("bloqueia modelos desabilitados (alvos de fallback)", async () => {
    const { store } = memoryStore();
    const events = await collect(runChat({ store, adapters: { anthropic: okAdapter() } }, { ...req, modelId: "claude-opus-4-8" }));
    expect(events[0]).toMatchObject({ type: "error", code: "model_unavailable" });
  });

  it("tenta a próxima chave do pool se a primeira falhar antes de responder", async () => {
    const { store, records } = memoryStore({ keys: ["k1", "k2"] });
    const used: string[] = [];
    const adapter: ProviderAdapter = {
      id: "anthropic",
      async *stream(r) {
        used.push(r.apiKey);
        if (r.apiKey === "secret-k1") throw new Error("429 rate limit");
        yield* okAdapter().stream(r);
      },
    };
    const events = await collect(runChat({ store, adapters: { anthropic: adapter } }, req));
    expect(used).toEqual(["secret-k1", "secret-k2"]);
    expect(events.at(-1)?.type).toBe("done");
    expect(records).toHaveLength(1);
    expect(records[0]?.providerKeyId).toBe("k2");
  });

  it("não cobra o cliente quando o provedor cai no meio da resposta", async () => {
    const { store, records, balance } = memoryStore();
    const adapter: ProviderAdapter = {
      id: "anthropic",
      async *stream() {
        yield { type: "text", text: "x".repeat(400) };
        throw new Error("conexão caiu");
      },
    };
    const events = await collect(runChat({ store, adapters: { anthropic: adapter } }, req));
    expect(events.at(-1)).toMatchObject({ type: "error", code: "provider_error" });
    expect(records[0]?.status).toBe("error");
    expect(records[0]?.chargeBrlMicros).toBe(0);
    expect(records[0]?.usage.outputTokens).toBe(100); // estimativa: 400 caracteres / 4
    expect(records[0]?.costUsdMicros).toBe(1_000); // 100 × $10/MTok
    expect(balance()).toBe(10_000_000);
  });

  it("precifica cada tentativa pelo modelo que rodou (fallback)", async () => {
    const { store, records } = memoryStore();
    const adapter: ProviderAdapter = {
      id: "anthropic",
      async *stream() {
        yield {
          type: "finish",
          servedModel: "claude-opus-5",
          stopReason: "end_turn",
          refused: false,
          usageByModel: [
            { model: "claude-opus-5-5", usage: { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } },
            { model: "claude-opus-5", usage: { inputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } },
          ],
        };
      },
    };
    await collect(runChat({ store, adapters: { anthropic: adapter } }, { ...req, modelId: "claude-opus-5-5" }));
    // $4 (Opus 5.5) + $5 (Opus 5) = $9
    expect(records[0]?.costUsdMicros).toBe(9_000_000);
    expect(records[0]?.servedModelId).toBe("claude-opus-5");
  });
});
