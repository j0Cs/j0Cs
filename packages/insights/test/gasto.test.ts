import { describe, expect, it } from "vitest";
import { gastoAnthropic, gastoOpenAI } from "../src/gasto";

function sequencia(respostas: unknown[]) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    urls.push(String(url));
    headers.push(new Headers(init?.headers));
    return new Response(JSON.stringify(respostas[urls.length - 1] ?? {}), { status: 200 });
  }) as typeof fetch;
  return { f, urls, headers };
}

const agora = new Date("2026-11-09T15:00:00Z");

describe("gasto nas APIs", () => {
  it("Anthropic: centavos em texto → micro-dólares, por dia, seguindo a paginação", async () => {
    const { f, urls, headers } = sequencia([
      { data: [{ starting_at: "2026-11-08T00:00:00Z", results: [{ currency: "USD", amount: "1234.5" }, { currency: "USD", amount: "100" }] }], has_more: true, next_page: "p2" },
      { data: [{ starting_at: "2026-11-09T00:00:00Z", results: [{ currency: "USD", amount: "50" }] }], has_more: false },
    ]);
    const dias = await gastoAnthropic("sk-ant-admin01-x", 30, agora, f);
    expect(dias).toEqual([
      { dia: "2026-11-08", usdMicros: 13_345_000 },
      { dia: "2026-11-09", usdMicros: 500_000 },
    ]);
    expect(urls[0]).toContain("/v1/organizations/cost_report?");
    expect(urls[0]).toContain("starting_at=2026-10-11T00%3A00%3A00.000Z");
    expect(urls[1]).toContain("page=p2");
    expect(headers[0]!.get("x-api-key")).toBe("sk-ant-admin01-x");
  });

  it("OpenAI: dólares → micro-dólares, ignorando outra moeda", async () => {
    const { f, urls } = sequencia([
      {
        data: [
          { start_time: Date.UTC(2026, 10, 8) / 1000, results: [{ amount: { value: 1.25, currency: "usd" } }, { amount: { value: 9, currency: "eur" } }] },
          { start_time: Date.UTC(2026, 10, 9) / 1000, results: [] },
        ],
        has_more: false,
      },
    ]);
    expect(await gastoOpenAI("k", 7, agora, f)).toEqual([{ dia: "2026-11-08", usdMicros: 1_250_000 }]);
    expect(urls[0]).toContain("/v1/organization/costs?start_time=");
  });

  it("chave recusada vira erro claro", async () => {
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(gastoOpenAI("k", 7, agora, f)).rejects.toThrow(/recusada/);
  });
});
