import { describe, expect, it } from "vitest";
import { buscarCustoAnthropic, buscarCustoOpenAI } from "../src/provedores";
import { cambioComFolga, cambioVencido, chaveFalhando, conciliacao, diaUtc, provedorComErro, semanaIso } from "../src/regras";

describe("câmbio", () => {
  it("aplica a folga e arredonda em 4 casas", () => {
    expect(cambioComFolga(5.4321, 3)).toBe(5.5951);
    expect(cambioComFolga(5, 0)).toBe(5);
  });
  it("vence depois de 3 dias sem atualizar (fim de semana com feriado cabe)", () => {
    const agora = new Date("2026-11-09T12:00:00Z");
    expect(cambioVencido(null, agora)).toBe(true);
    expect(cambioVencido(new Date("2026-11-06T12:00:01Z"), agora)).toBe(false);
    expect(cambioVencido(new Date("2026-11-06T11:59:59Z"), agora)).toBe(true);
  });
});

describe("erros de provedor e de chave", () => {
  it("provedor: mais de 2% com volume mínimo de 50 chamadas", () => {
    expect(provedorComErro(49, 10)).toBe(false);
    expect(provedorComErro(100, 2)).toBe(false);
    expect(provedorComErro(100, 3)).toBe(true);
  });
  it("chave: 5 erros ou mais e pelo menos 20%", () => {
    expect(chaveFalhando(10, 4)).toBe(false);
    expect(chaveFalhando(100, 5)).toBe(false);
    expect(chaveFalhando(25, 5)).toBe(true);
  });
});

describe("conciliação", () => {
  const US = 1_000_000;
  it("sem relatório não alerta", () => {
    expect(conciliacao(10 * US, null)).toEqual({ status: "sem_relatorio", diffPercent: null });
  });
  it("bate até 2%", () => {
    expect(conciliacao(98 * US, 100 * US)).toEqual({ status: "ok", diffPercent: 2 });
    expect(conciliacao(0, 0)).toEqual({ status: "ok", diffPercent: 0 });
  });
  it("acima de 2% diverge, para mais ou para menos", () => {
    expect(conciliacao(97 * US, 100 * US).status).toBe("divergente");
    expect(conciliacao(103 * US, 100 * US)).toEqual({ status: "divergente", diffPercent: -3 });
  });
  it("centavos não viram alerta", () => {
    expect(conciliacao(0.5 * US, 0.8 * US).status).toBe("ok");
  });
  it("relatório zerado com uso registrado: −100%, sem estourar o inteiro do banco", () => {
    expect(conciliacao(5 * US, 0)).toEqual({ status: "divergente", diffPercent: -100 });
    expect(Math.abs(conciliacao(1, 10_000 * US).diffPercent!)).toBeLessThanOrEqual(9999);
  });
});

describe("datas", () => {
  it("semana ISO", () => {
    expect(semanaIso(new Date("2026-01-01T12:00:00Z"))).toBe("2026-S01");
    expect(semanaIso(new Date("2026-11-09T12:00:00Z"))).toBe("2026-S46");
    expect(semanaIso(new Date("2027-01-01T12:00:00Z"))).toBe("2026-S53");
  });
  it("D-2 em UTC", () => {
    expect(diaUtc(new Date("2026-11-09T02:00:00Z"), 2)).toBe("2026-11-07");
  });
});

describe("relatórios dos provedores", () => {
  const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

  it("Anthropic: centavos em texto, filtra o workspace e pagina", async () => {
    const urls: string[] = [];
    const fetchFalso = (async (url: string, init?: RequestInit) => {
      urls.push(url);
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("admin");
      if (!url.includes("page=")) {
        return resposta({
          data: [{ results: [{ amount: "1234.5", currency: "USD", workspace_id: "wrk_forja" }, { amount: "999", currency: "USD", workspace_id: "wrk_outro" }] }],
          has_more: true,
          next_page: "p2",
        });
      }
      return resposta({ data: [{ results: [{ amount: "100", currency: "USD", workspace_id: "wrk_forja" }] }], has_more: false });
    }) as typeof fetch;
    const micros = await buscarCustoAnthropic("admin", "2026-11-07", "wrk_forja", fetchFalso);
    expect(micros).toBe(13_345_000); // (1234,5 + 100) centavos = US$ 13,345
    expect(urls[0]).toContain("starting_at=2026-11-07T00%3A00%3A00Z");
    expect(urls[0]).toContain("ending_at=2026-11-08T00%3A00%3A00Z");
    expect(urls[1]).toContain("page=p2");
  });

  it("OpenAI: dólares, ignora outra moeda", async () => {
    const fetchFalso = (async (url: string) => {
      expect(url).toContain("project_ids=proj_forja");
      return resposta({ data: [{ results: [{ amount: { value: 12.5, currency: "usd" } }, { amount: { value: 7, currency: "eur" } }] }], has_more: false });
    }) as typeof fetch;
    expect(await buscarCustoOpenAI("admin", "2026-11-07", "proj_forja", fetchFalso)).toBe(12_500_000);
  });

  it("erro do provedor vira exceção legível", async () => {
    const fetchFalso = (async () => new Response("nope", { status: 401 })) as typeof fetch;
    await expect(buscarCustoOpenAI("x", "2026-11-07", null, fetchFalso)).rejects.toThrow("OpenAI respondeu 401");
  });
});

describe("chaves do backup (age)", () => {
  it("bech32 confere com o vetor do BIP 173", async () => {
    const { bech32 } = await import("../src/backup");
    expect(bech32("a", new Uint8Array())).toBe("a12uel5l");
  });

  it("par de chaves no formato do age; a pública corresponde à privada (age-keygen -y)", async () => {
    const { gerarChavesAge } = await import("../src/backup");
    const { publica, privada } = gerarChavesAge();
    expect(publica).toMatch(/^age1[02-9ac-hj-np-z]{58}$/);
    expect(privada).toMatch(/^AGE-SECRET-KEY-1[02-9AC-HJ-NP-Z]{58}$/);
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("age-keygen", ["-y"], { input: `${privada}\n`, encoding: "utf8" });
    if (r.error) return; // age não instalado nesta máquina
    expect(r.stdout.trim()).toBe(publica);
  });

  it("situação do backup", async () => {
    const { situacaoDoBackup } = await import("../src/backup");
    const agora = new Date("2026-11-09T12:00:00Z");
    expect(situacaoDoBackup(null, agora).tipo).toBe("nao_configurado");
    const base = { detalhe: "", execucao: null, tamanhoBytes: null, tabelas: null };
    expect(situacaoDoBackup({ ...base, em: new Date("2026-11-09T06:50:00Z"), ok: true }, agora).tipo).toBe("ok");
    expect(situacaoDoBackup({ ...base, em: new Date("2026-11-07T23:00:00Z"), ok: true }, agora).tipo).toBe("atrasado");
    expect(situacaoDoBackup({ ...base, em: new Date("2026-11-09T06:50:00Z"), ok: false }, agora).tipo).toBe("falhou");
  });
});
