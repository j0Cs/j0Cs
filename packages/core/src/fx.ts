/**
 * Cotação PTAX (venda) do Banco Central — API pública Olinda.
 * Volta até 7 dias para cobrir fins de semana e feriados.
 */
export async function fetchPtaxUsdBrl(today = new Date()): Promise<{ rate: number; date: string }> {
  for (let back = 0; back < 7; back++) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const mmddyyyy = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
    const url =
      "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
      `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mmddyyyy}'&$format=json`;
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`PTAX respondeu ${res.status}`);
    const body = (await res.json()) as { value?: { cotacaoVenda: number; dataHoraCotacao: string }[] };
    const last = body.value?.at(-1);
    if (last) return { rate: last.cotacaoVenda, date: last.dataHoraCotacao };
  }
  throw new Error("PTAX sem cotação nos últimos 7 dias.");
}
