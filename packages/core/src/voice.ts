/**
 * Utilitários de voz (puros, sem dependência de navegador).
 *
 * O agente responde em streaming; para começar a falar antes de a resposta
 * terminar, o texto é cortado em frases completas assim que elas chegam.
 */

const ABREVIACOES = new Set(["sr", "sra", "dr", "dra", "prof", "ex", "etc", "obs", "p", "pág", "vs", "aprox", "nº", "n"]);

/** Remove o que não deve ser lido em voz alta (markdown, URLs, emojis, código). */
export function paraFala(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>~|]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DivisorDeFrases {
  /** Recebe um pedaço do streaming e devolve as frases que ficaram completas. */
  push(pedaco: string): string[];
  /** Devolve o que sobrou no fim da resposta. */
  flush(): string[];
}

export function criarDivisorDeFrases(opts: { minimo?: number } = {}): DivisorDeFrases {
  const minimo = opts.minimo ?? 8;
  let buffer = "";

  const extrair = (final: boolean): string[] => {
    const frases: string[] = [];
    let inicio = 0;
    for (let i = 0; i < buffer.length; i++) {
      const c = buffer[i]!;
      const quebra = c === "\n";
      const pontuacao = c === "." || c === "!" || c === "?" || c === ";" || c === ":";
      if (!quebra && !pontuacao) continue;
      const proximo = buffer[i + 1];
      // precisa ver o próximo caractere para saber se a frase acabou (exceto no fim)
      if (proximo === undefined && !final) break;
      if (pontuacao && proximo !== undefined && !/\s/.test(proximo)) continue; // 3.5, R$1.000, e.g.
      if (c === ".") {
        const palavra = buffer.slice(inicio, i).split(/\s+/).at(-1)?.toLowerCase() ?? "";
        if (ABREVIACOES.has(palavra) || /^\d+$/.test(palavra)) continue;
      }
      const frase = paraFala(buffer.slice(inicio, i + 1));
      if (frase.length >= minimo || (quebra && frase.length > 0)) {
        frases.push(frase);
        inicio = i + 1;
      }
    }
    buffer = buffer.slice(inicio);
    return frases;
  };

  return {
    push(pedaco) {
      buffer += pedaco;
      return extrair(false);
    },
    flush() {
      const frases = extrair(true);
      const resto = paraFala(buffer);
      buffer = "";
      return resto ? [...frases, resto] : frases;
    },
  };
}

// ---------------------------------------------------------------------------
// Voz em nuvem (cobrança por tempo de sessão)
// ---------------------------------------------------------------------------

export interface VoiceProduct {
  id: string;
  providerId: "openai";
  displayName: string;
  /** Custo do provedor por minuto, em micro-dólares (US$ 0,05 = 50_000). */
  usdMicrosPerMinute: number;
  markupPercent: number;
  /** Voz em português usada por padrão. */
  voice: string;
}

/** GPT-Live (OpenAI): conversa full-duplex, cobrada por segundo, silêncio incluído (verificado em 04/11/2026). */
export const VOICE_PRODUCTS: Record<string, VoiceProduct> = {
  "gpt-live-1": {
    id: "gpt-live-1",
    providerId: "openai",
    displayName: "Voz natural (OpenAI GPT-Live)",
    usdMicrosPerMinute: 50_000,
    markupPercent: 50,
    voice: "bossa",
  },
};

/** Custo em micro-dólares de N segundos de voz (arredonda para cima). */
export function voiceCostUsdMicros(seconds: number, product: VoiceProduct): number {
  return Math.ceil((Math.max(0, seconds) * product.usdMicrosPerMinute) / 60);
}
