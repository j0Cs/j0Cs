/** Regras puras da operação (testadas sem banco). */

/** Câmbio usado na cobrança: PTAX de venda + folga, arredondado em 4 casas. */
export const cambioComFolga = (ptax: number, folgaPercent: number) => Math.round(ptax * (1 + folgaPercent / 100) * 10_000) / 10_000;

/** Câmbio desatualizado: sem atualização há mais de 3 dias (fim de semana + feriado cabem). */
export const cambioVencido = (atualizadoEm: Date | null, agora = new Date()) =>
  !atualizadoEm || agora.getTime() - atualizadoEm.getTime() > 3 * 24 * 60 * 60 * 1000;

/** Provedor com erro acima de 2% (com volume mínimo para não alarmar à toa). */
export const provedorComErro = (total: number, erros: number) => total >= 50 && erros / total > 0.02;

/** Chave falhando: pelo menos 5 erros e 20% das chamadas dela. */
export const chaveFalhando = (total: number, erros: number) => erros >= 5 && erros / total >= 0.2;

/**
 * Diferença entre o relatório do provedor e o que a Forja registrou, em % do relatório.
 * Só alerta acima de 2% e com pelo menos US$ 1 em jogo (centavos não valem um e-mail).
 */
export function conciliacao(registradoUsdMicros: number, relatorioUsdMicros: number | null) {
  if (relatorioUsdMicros === null) return { status: "sem_relatorio" as const, diffPercent: null };
  const base = Math.max(relatorioUsdMicros, registradoUsdMicros);
  if (base === 0) return { status: "ok" as const, diffPercent: 0 };
  // relatório zerado com uso registrado: −100% (a chave de admin aponta para outro workspace/projeto?)
  const divisor = relatorioUsdMicros > 0 ? relatorioUsdMicros : registradoUsdMicros;
  const diff = Math.max(-9999, Math.min(9999, ((relatorioUsdMicros - registradoUsdMicros) / divisor) * 100));
  const relevante = base >= 1_000_000;
  return { status: Math.abs(diff) > 2 && relevante ? ("divergente" as const) : ("ok" as const), diffPercent: Math.round(diff * 100) / 100 };
}

/** Semana ISO (para não repetir o alerta de margem do mesmo cliente toda noite). */
export function semanaIso(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t.getTime() - inicio.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-S${String(semana).padStart(2, "0")}`;
}

/** Dia AAAA-MM-DD (UTC) n dias antes. */
export const diaUtc = (agora: Date, diasAtras: number) => new Date(agora.getTime() - diasAtras * 86_400_000).toISOString().slice(0, 10);
