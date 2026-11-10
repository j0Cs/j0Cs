/**
 * Relatórios de custo dos provedores (APIs de administração), em micro-dólares do dia (UTC).
 * Chaves de admin ficam nos Secrets do Supabase: ANTHROPIC_ADMIN_KEY e OPENAI_ADMIN_KEY.
 * Use um workspace (Anthropic) e um projeto (OpenAI) só da Forja: se as mesmas chaves servem a
 * outros sistemas, o relatório inteiro nunca vai bater com o que a Forja registrou.
 */

const proximoDia = (dia: string) => new Date(new Date(`${dia}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Anthropic Admin API: cost_report (valores em centavos de dólar, como texto decimal). */
export async function buscarCustoAnthropic(chaveAdmin: string, dia: string, workspaceId?: string | null, fetchImpl: typeof fetch = fetch) {
  const base = (process.env.ANTHROPIC_ADMIN_API_BASE ?? "https://api.anthropic.com").replace(/\/+$/, "");
  let total = 0;
  let pagina: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ starting_at: `${dia}T00:00:00Z`, ending_at: `${proximoDia(dia)}T00:00:00Z`, bucket_width: "1d" });
    if (workspaceId) q.append("group_by[]", "workspace_id");
    if (pagina) q.set("page", pagina);
    const r = await fetchImpl(`${base}/v1/organizations/cost_report?${q}`, {
      headers: { "x-api-key": chaveAdmin, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Anthropic respondeu ${r.status} no relatório de custo.`);
    const j = (await r.json()) as {
      data?: { results?: { amount?: string | number; currency?: string; workspace_id?: string | null }[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const balde of j.data ?? []) {
      for (const item of balde.results ?? []) {
        if (workspaceId && item.workspace_id !== workspaceId) continue;
        if (item.currency && item.currency.toUpperCase() !== "USD") continue;
        total += Number(item.amount ?? 0) * 10_000; // centavos → micro-dólares
      }
    }
    if (!j.has_more || !j.next_page) break;
    pagina = j.next_page;
  }
  return Math.round(total);
}

/** OpenAI Costs API (valores em dólares). */
export async function buscarCustoOpenAI(chaveAdmin: string, dia: string, projetoId?: string | null, fetchImpl: typeof fetch = fetch) {
  const base = (process.env.OPENAI_ADMIN_API_BASE ?? "https://api.openai.com").replace(/\/+$/, "");
  const inicio = Math.floor(new Date(`${dia}T00:00:00Z`).getTime() / 1000);
  let total = 0;
  let pagina: string | null = null;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ start_time: String(inicio), end_time: String(inicio + 86_400), bucket_width: "1d", limit: "7" });
    if (projetoId) q.append("project_ids", projetoId);
    if (pagina) q.set("page", pagina);
    const r = await fetchImpl(`${base}/v1/organization/costs?${q}`, {
      headers: { authorization: `Bearer ${chaveAdmin}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`OpenAI respondeu ${r.status} no relatório de custo.`);
    const j = (await r.json()) as {
      data?: { results?: { amount?: { value?: number; currency?: string } }[] }[];
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const balde of j.data ?? []) {
      for (const item of balde.results ?? []) {
        if (item.amount?.currency && item.amount.currency.toLowerCase() !== "usd") continue;
        total += Number(item.amount?.value ?? 0) * 1_000_000;
      }
    }
    if (!j.has_more || !j.next_page) break;
    pagina = j.next_page;
  }
  return Math.round(total);
}
