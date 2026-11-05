import { describe, expect, it } from "vitest";
import {
  chaveDoPreco,
  creditosDaFatura,
  deveAvisarSaldo,
  ehPacoteDeRecarga,
  motivoDaRecusa,
  nivelDeSaldoBaixo,
  planoDaFatura,
  planoDoProduto,
  produtoDoPlano,
  quantidadeDoPlano,
  RegraDeCobranca,
  sobraDoPlano,
  statusLocal,
  tipoDeTroca,
  type LinhaDeFatura,
} from "../src/regras";

const inclusos: Record<string, number> = { starter: 80_00, pro: 300_00, max: 720_00, equipe: 260_00 };
const creditos = (id: string) => inclusos[id] ?? null;
const linha = (plano: string, valor: number, unit: number, qtd = 1, proracao = false): LinhaDeFatura => ({
  produto: produtoDoPlano(plano),
  valorCentavos: valor,
  precoUnitarioCentavos: unit,
  quantidade: qtd,
  proracao,
});

describe("créditos por fatura", () => {
  it("renovação do Pro: créditos cheios", () => {
    expect(creditosDaFatura([linha("pro", 447_00, 447_00)], creditos)).toBe(300_00);
  });

  it("Equipe com 5 assentos: créditos × assentos", () => {
    expect(creditosDaFatura([linha("equipe", 5 * 397_00, 397_00, 5)], creditos)).toBe(5 * 260_00);
  });

  it("troca Starter → Pro na metade do ciclo: metade da diferença de créditos", () => {
    const linhas = [linha("starter", -73_50, 147_00, 1, true), linha("pro", 223_50, 447_00, 1, true)];
    // 300 × 0,5 − 80 × 0,5 = 110
    expect(creditosDaFatura(linhas, creditos)).toBe(110_00);
    expect(planoDaFatura(linhas)).toBe("pro");
  });

  it("mais 2 assentos no Equipe com 1/3 do ciclo restante", () => {
    // Stripe cobra 2 × 397 × 1/3 numa linha de proração para a quantidade nova (simplificado)
    const valor = Math.round((2 * 397_00) / 3);
    expect(creditosDaFatura([linha("equipe", valor, 397_00, 2, true)], creditos)).toBe(Math.floor((260_00 * valor) / 397_00));
  });

  it("cupom de 100% não tira créditos: a conta usa o valor antes do desconto", () => {
    expect(creditosDaFatura([linha("pro", 447_00, 447_00)], creditos)).toBe(300_00);
  });

  it("ignora linhas que não são de plano, planos desconhecidos e preço zero", () => {
    const linhas: LinhaDeFatura[] = [
      { produto: "prod_outro", valorCentavos: 10_000, precoUnitarioCentavos: 10_000, quantidade: 1, proracao: false },
      linha("inexistente", 100_00, 100_00),
      linha("pro", 0, 0),
    ];
    expect(creditosDaFatura(linhas, creditos)).toBe(0);
    // o plano desconhecido é descartado por quem chama (só muda para plano que existe no banco)
    expect(planoDaFatura(linhas)).toBe("inexistente");
    expect(planoDaFatura([linhas[0]!, linhas[2]!])).toBeNull();
  });

  it("nunca negativo (só crédito de tempo não usado)", () => {
    expect(creditosDaFatura([linha("pro", -100_00, 447_00, 1, true)], creditos)).toBe(0);
  });
});

describe("produtos e preços", () => {
  it("produto ↔ plano", () => {
    expect(produtoDoPlano("pro")).toBe("forja_plan_pro");
    expect(planoDoProduto("forja_plan_equipe")).toBe("equipe");
    expect(planoDoProduto("prod_123")).toBeNull();
    expect(planoDoProduto(null)).toBeNull();
  });

  it("chave do preço muda com o valor", () => {
    expect(chaveDoPreco("pro", 447_00)).not.toBe(chaveDoPreco("pro", 497_00));
  });

  it("pacotes de recarga", () => {
    expect(ehPacoteDeRecarga(100_00)).toBe(true);
    expect(ehPacoteDeRecarga(1000_00)).toBe(true);
    expect(ehPacoteDeRecarga(50_00)).toBe(false);
  });
});

describe("status e assentos", () => {
  it("mapeia o status do Stripe", () => {
    expect(statusLocal("active")).toBe("active");
    expect(statusLocal("unpaid")).toBe("past_due");
    expect(statusLocal("incomplete")).toBe("incomplete");
    expect(statusLocal("incomplete_expired")).toBe("canceled");
    expect(statusLocal("algo_novo")).toBe("canceled");
  });

  it("quantidade: fixa em 1 ou com mínimo por assento", () => {
    expect(quantidadeDoPlano({ minSeats: null }, 10)).toBe(1);
    expect(quantidadeDoPlano({ minSeats: 3 }, undefined)).toBe(3);
    expect(quantidadeDoPlano({ minSeats: 3 }, 7)).toBe(7);
    expect(() => quantidadeDoPlano({ minSeats: 3 }, 2)).toThrow(RegraDeCobranca);
    expect(() => quantidadeDoPlano({ minSeats: 3 }, 500)).toThrow(RegraDeCobranca);
  });

  it("troca para cima, para baixo e desfazer redução", () => {
    expect(tipoDeTroca({ valorAtualCentavosMes: 147_00, valorNovoCentavosMes: 447_00, voltandoAoPlanoPago: false })).toBe("para_cima");
    expect(tipoDeTroca({ valorAtualCentavosMes: 447_00, valorNovoCentavosMes: 147_00, voltandoAoPlanoPago: false })).toBe("para_baixo");
    expect(tipoDeTroca({ valorAtualCentavosMes: 147_00, valorNovoCentavosMes: 447_00, voltandoAoPlanoPago: true })).toBe("para_baixo");
  });
});

describe("saldo", () => {
  it("sobra do plano: limitada ao saldo e nunca negativa", () => {
    expect(sobraDoPlano({ concedidosMicros: 300e6, consumidosMicros: 100e6, saldoMicros: 500e6 })).toBe(200e6);
    // gastou tudo do plano e parte da recarga: nada do plano sobrou
    expect(sobraDoPlano({ concedidosMicros: 300e6, consumidosMicros: 350e6, saldoMicros: 50e6 })).toBe(0);
    expect(sobraDoPlano({ concedidosMicros: 300e6, consumidosMicros: 0, saldoMicros: 120e6 })).toBe(120e6);
  });

  it("níveis de aviso de saldo baixo", () => {
    const ref = 300e6;
    expect(nivelDeSaldoBaixo(100e6, ref)).toBeNull();
    expect(nivelDeSaldoBaixo(60e6, ref)).toBe(20);
    expect(nivelDeSaldoBaixo(15e6, ref)).toBe(5);
    expect(nivelDeSaldoBaixo(-1, ref)).toBe(5);
    expect(nivelDeSaldoBaixo(0, 0)).toBeNull();
  });

  it("um aviso por nível", () => {
    expect(deveAvisarSaldo(20, null)).toBe(true);
    expect(deveAvisarSaldo(20, 20)).toBe(false);
    expect(deveAvisarSaldo(5, 20)).toBe(true);
    expect(deveAvisarSaldo(20, 5)).toBe(false);
    expect(deveAvisarSaldo(null, null)).toBe(false);
  });

  it("motivo da recusa em português", () => {
    expect(motivoDaRecusa({ code: "card_declined", decline_code: "insufficient_funds" })).toBe("saldo ou limite insuficiente no cartão");
    expect(motivoDaRecusa({ code: "expired_card" })).toBe("o cartão está vencido");
    expect(motivoDaRecusa({ code: "x" })).toBe("pagamento recusado");
    expect(motivoDaRecusa(null)).toBeNull();
  });
});
