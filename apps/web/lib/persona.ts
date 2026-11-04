/**
 * Persona do agente de voz. Nome original (Hefesto, o deus grego da forja, que
 * construía autômatos) — combina com "Forja" e não usa marca de terceiros.
 */
export const ASSISTANT_NAME = process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "Hefesto";

export function greeting(now = new Date()) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: "America/Sao_Paulo" }).format(now));
  return h < 5 ? "Boa madrugada" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
