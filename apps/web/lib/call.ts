import { ASSISTANT_NAME, PERSONA_HEFESTO } from "./persona";

/** Instruções do agente na chamada de voz (tudo é lido em voz alta). */
export function callSystemPrompt(nome: string) {
  return `Você é ${ASSISTANT_NAME}, engenheiro-chefe da plataforma Forja, numa chamada de voz com ${nome}.
Você já cumprimentou a pessoa e perguntou o que ela quer construir.

${PERSONA_HEFESTO}

Objetivo da conversa: entender o sistema, site ou aplicativo que a pessoa quer e chegar a uma especificação clara:
para quem é, problema que resolve, funcionalidades essenciais da primeira versão, telas, dados, integrações e como publicar.

Como falar (tudo o que você escrever vira voz):
- No máximo duas ou três frases por vez; depois devolva a palavra para a pessoa.
- Uma pergunta por vez. Quando a pessoa estiver em dúvida, ofereça duas opções concretas.
- Debata com franqueza: se uma ideia tiver risco ou custo alto, diga e sugira um caminho mais simples para a primeira versão.
- Nada de markdown, listas, emojis, código, siglas soletradas ou links.
- Quando chegar a hora de falar de infraestrutura, sugira o padrão da plataforma: GitHub para o código, Vercel para publicar, Supabase para banco de dados e login.
- Se a pessoa disser que quer encerrar ou gerar o projeto, resuma em até três frases o que foi decidido.`;
}

export interface CallSpec {
  titulo: string;
  resumo: string;
  publico: string;
  funcionalidades: string[];
  telas: string[];
  dados: string[];
  integracoes: string[];
  infraestrutura: string[];
  pendencias: string[];
}

export const EMPTY_SPEC: CallSpec = {
  titulo: "",
  resumo: "",
  publico: "",
  funcionalidades: [],
  telas: [],
  dados: [],
  integracoes: [],
  infraestrutura: [],
  pendencias: [],
};

export const SPEC_SYSTEM_PROMPT = `Você atualiza a especificação de um software a partir da transcrição de uma reunião.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois, neste formato:
{"titulo": "", "resumo": "", "publico": "", "funcionalidades": [], "telas": [], "dados": [], "integracoes": [], "infraestrutura": [], "pendencias": []}
Regras: português do Brasil; itens curtos (até 12 palavras); registre apenas o que foi dito ou decidido;
"pendencias" são perguntas ainda sem resposta; preserve itens da especificação anterior que continuam válidos.`;

const asList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 20) : [];
const asText = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 600) : "");

/** Lê o JSON devolvido pelo modelo de forma tolerante (cercas de código, texto extra). */
export function parseSpec(raw: string, anterior: CallSpec = EMPTY_SPEC): CallSpec {
  const inicio = raw.indexOf("{");
  const fim = raw.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return anterior;
  try {
    const o = JSON.parse(raw.slice(inicio, fim + 1)) as Record<string, unknown>;
    return {
      titulo: asText(o.titulo) || anterior.titulo,
      resumo: asText(o.resumo) || anterior.resumo,
      publico: asText(o.publico) || anterior.publico,
      funcionalidades: asList(o.funcionalidades),
      telas: asList(o.telas),
      dados: asList(o.dados),
      integracoes: asList(o.integracoes),
      infraestrutura: asList(o.infraestrutura),
      pendencias: asList(o.pendencias),
    };
  } catch {
    return anterior;
  }
}

/** Texto das instruções do projeto gerado ao fim da chamada. */
export function specToInstructions(s: CallSpec) {
  const bloco = (rotulo: string, itens: string[]) => (itens.length ? `${rotulo}:\n${itens.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    s.resumo ? `Resumo: ${s.resumo}\n` : "",
    s.publico ? `Público: ${s.publico}\n` : "",
    bloco("Funcionalidades da primeira versão", s.funcionalidades),
    bloco("Telas", s.telas),
    bloco("Dados", s.dados),
    bloco("Integrações", s.integracoes),
    bloco("Infraestrutura", s.infraestrutura),
    bloco("Pendências", s.pendencias),
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}
