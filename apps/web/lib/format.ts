import { formatBrlMicros, formatTokens, type NormalizedUsage } from "@forja/core";

/** Linha de custo exibida abaixo de cada resposta (cliente e servidor usam a mesma). */
export function usageMeta(chargeBrlMicros: number, u: NormalizedUsage) {
  const input = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
  return `${formatBrlMicros(chargeBrlMicros)} · ${formatTokens(input)} entrada (${formatTokens(u.cacheReadTokens)} do cache) · ${formatTokens(u.outputTokens)} saída`;
}
