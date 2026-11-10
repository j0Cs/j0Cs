import { describe, expect, it } from "vitest";
import { criarDivisorDeFrases, paraFala } from "../src/voice";

describe("criarDivisorDeFrases", () => {
  it("libera cada frase assim que ela termina, mesmo chegando em pedaços", () => {
    const d = criarDivisorDeFrases();
    expect(d.push("Olá, Maria! Vamos pen")).toEqual(["Olá, Maria!"]);
    expect(d.push("sar no seu sistema. Quem vai ")).toEqual(["Vamos pensar no seu sistema."]);
    expect(d.push("usar no dia a dia?")).toEqual([]);
    expect(d.flush()).toEqual(["Quem vai usar no dia a dia?"]);
  });

  it("não corta em números decimais, valores e abreviações", () => {
    const d = criarDivisorDeFrases();
    const out = [
      ...d.push("O plano custa R$ 1.000,50 por mês e o Dr. Silva aprovou a versão 2.5 ontem. "),
      ...d.push("Próximo passo?"),
      ...d.flush(),
    ];
    expect(out).toEqual(["O plano custa R$ 1.000,50 por mês e o Dr. Silva aprovou a versão 2.5 ontem.", "Próximo passo?"]);
  });

  it("junta frases muito curtas com a seguinte", () => {
    const d = criarDivisorDeFrases({ minimo: 12 });
    expect(d.push("Sim. Isso faz todo sentido para a clínica. ")).toEqual(["Sim. Isso faz todo sentido para a clínica."]);
  });
});

describe("paraFala", () => {
  it("remove markdown, código, links e emojis", () => {
    expect(paraFala("**Ótimo!** Veja `npm i` em [docs](https://x.dev) 🚀\n- item")).toBe("Ótimo! Veja npm i em docs item");
    expect(paraFala("Antes ```ts\nconst a = 1\n``` depois")).toBe("Antes depois");
  });
});

import { VOICE_PRODUCTS, voiceCostUsdMicros } from "../src/voice";

describe("voiceCostUsdMicros", () => {
  it("cobra por segundo a US$ 0,05/min", () => {
    const p = VOICE_PRODUCTS["gpt-live-1"]!;
    expect(voiceCostUsdMicros(60, p)).toBe(50_000);
    expect(voiceCostUsdMicros(1, p)).toBe(834); // 833,3 → arredonda para cima
    expect(voiceCostUsdMicros(-5, p)).toBe(0);
  });
});
