import { computeChargeBrlMicros, formatBrlMicros, formatInt, formatTokens, plural, VOICE_PRODUCTS } from "@forja/core";
import { getPricingSettings, orgDailySpend, orgRecentUsage, orgUsageByModel, schema, startOfMonth, toCatalogModel } from "@forja/db";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat, Table, Td, Th } from "@forja/ui";
import { getSession } from "@/lib/session";

export const metadata = { title: "Custos e uso" };

export default async function CostsPage() {
  const { db, org, plan } = await getSession();
  const since = startOfMonth();
  const [byModel, daily, recent, settings, catalog] = await Promise.all([
    orgUsageByModel(db, org.id, since),
    orgDailySpend(db, org.id, since),
    orgRecentUsage(db, org.id, 15),
    getPricingSettings(db),
    db.select().from(schema.models),
  ]);
  const models = new Map(catalog.map((m) => [m.id, toCatalogModel(m)]));

  const spent = byModel.reduce((s, r) => s + r.chargeBrlMicros, 0);
  const requests = byModel.reduce((s, r) => s + r.requests, 0);
  // Quanto o cache de prompt economizou: tokens lidos do cache × (preço cheio − preço de cache)
  const cacheSavings = byModel.reduce((s, r) => {
    const m = models.get(r.modelId);
    if (!m) return s;
    const diff = m.pricing.inputUsdMicrosPerMTok - m.pricing.cacheReadUsdMicrosPerMTok;
    return s + computeChargeBrlMicros(Math.round((r.cacheReadTokens * diff) / 1e6), settings, m.markupPercent);
  }, 0);
  const maxDay = Math.max(1, ...daily.map((d) => d.chargeBrlMicros));

  return (
    <>
      <PageHeader title="Custos e uso" description="Tudo que foi consumido neste mês, por modelo e por dia. Valores em reais, já com impostos." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saldo disponível" value={formatBrlMicros(org.creditBalanceBrlMicros)} hint={`Plano ${plan?.name ?? "—"}`} />
        <Stat label="Gasto no mês" value={formatBrlMicros(spent)} hint={plural(requests, "resposta", "respostas")} />
        <Stat
          label="Créditos do plano"
          value={plan ? formatBrlMicros(plan.includedCreditsBrlCents * 10_000) : "—"}
          hint="Renovam a cada ciclo"
        />
        <Stat label="Economia com cache" value={formatBrlMicros(cacheSavings)} tone="good" hint="Contexto reaproveitado entre mensagens" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Por modelo" description="Mês atual" />
          {byModel.length === 0 ? (
            <EmptyState title="Sem uso neste mês" description="Converse em um projeto para ver os custos aqui." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  <Th className="text-right">Respostas</Th>
                  <Th className="text-right">Entrada</Th>
                  <Th className="text-right">Cache</Th>
                  <Th className="text-right">Saída</Th>
                  <Th className="text-right">Custo</Th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((r) => (
                  <tr key={r.modelId}>
                    <Td className="font-medium text-zinc-900">{r.displayName ?? VOICE_PRODUCTS[r.modelId]?.displayName ?? r.modelId}</Td>
                    <Td className="text-right tabular-nums">{formatInt(r.requests)}</Td>
                    <Td className="text-right tabular-nums">{formatTokens(r.inputTokens + r.cacheWriteTokens)}</Td>
                    <Td className="text-right tabular-nums">{formatTokens(r.cacheReadTokens)}</Td>
                    <Td className="text-right tabular-nums">{formatTokens(r.outputTokens)}</Td>
                    <Td className="text-right font-medium tabular-nums">{formatBrlMicros(r.chargeBrlMicros)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Por dia" />
          <div className="space-y-2 p-5">
            {daily.length === 0 ? <p className="text-sm text-zinc-500">Sem dados.</p> : null}
            {daily.map((d) => (
              <div key={d.day} className="flex items-center gap-3 text-xs">
                <span className="w-12 shrink-0 tabular-nums text-zinc-500">{d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                <div className="h-2 flex-1 rounded-full bg-zinc-100">
                  <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(d.chargeBrlMicros / maxDay) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right tabular-nums">{formatBrlMicros(d.chargeBrlMicros)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Últimas chamadas" />
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Modelo</Th>
              <Th>Status</Th>
              <Th className="text-right">Tokens</Th>
              <Th className="text-right">Custo</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e) => (
              <tr key={e.id}>
                <Td>{e.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</Td>
                <Td>{models.get(e.modelId)?.displayName ?? VOICE_PRODUCTS[e.modelId]?.displayName ?? e.modelId}</Td>
                <Td>
                  {e.status === "ok" ? <Badge tone="green">ok</Badge> : e.status === "refused" ? <Badge tone="amber">recusado</Badge> : <Badge tone="red">erro</Badge>}
                </Td>
                <Td className="text-right tabular-nums">{formatTokens(e.inputTokens + e.cacheReadTokens + e.cacheWriteTokens + e.outputTokens)}</Td>
                <Td className="text-right tabular-nums">{formatBrlMicros(e.chargeBrlMicros)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
