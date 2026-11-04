import {
  effectiveCostBrlMicros,
  formatBrl,
  formatBrlCents,
  formatBrlMicros,
  formatInt,
  formatPercent,
  plural,
  formatTokens,
  formatUsdMicros,
  PROVIDERS,
  simulatePlan,
} from "@forja/core";
import {
  asc,
  getEconomics,
  getPricingSettings,
  platformCostByModel,
  platformCostByProvider,
  platformOverview,
  schema,
  startOfMonth,
} from "@forja/db";
import { Card, CardHeader, cx, EmptyState, Notice, PageHeader, Stat, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";

export default async function Overview() {
  const db = await adminDb();
  const since = startOfMonth();
  const [overview, byProvider, byModel, settings, economics, plans, keys] = await Promise.all([
    platformOverview(db, since),
    platformCostByProvider(db, since),
    platformCostByModel(db, since),
    getPricingSettings(db),
    getEconomics(db),
    db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder)),
    db.select({ providerId: schema.providerKeys.providerId }).from(schema.providerKeys),
  ]);

  const apiCostBrl = effectiveCostBrlMicros(overview.costUsdMicros, settings);
  const usageMargin = overview.chargeBrlMicros - apiCostBrl;
  const usageMarginPct = overview.chargeBrlMicros ? (usageMargin / overview.chargeBrlMicros) * 100 : 0;
  const errorRate = overview.requests ? (overview.errors / overview.requests) * 100 : 0;
  const providersWithoutKey = (Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).filter(
    (p) => !keys.some((k) => k.providerId === p),
  );

  return (
    <>
      <PageHeader
        title="Visão geral"
        description={`Mês atual · câmbio US$ 1 = ${formatBrl(settings.fxUsdBrl)} · sobrecusto ${settings.costOverheadPercent}% (IOF/spread/tributos)`}
      />

      {providersWithoutKey.length ? (
        <div className="mb-4">
          <Notice>
            Sem chave cadastrada para: {providersWithoutKey.map((p) => PROVIDERS[p].name).join(", ")}. Os modelos desses provedores
            vão falhar para os clientes até você adicionar uma chave em <b>Chaves de API</b>.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR (assinaturas)" value={formatBrlCents(overview.mrrBrlCents)} hint={plural(overview.activeSubscriptions, "assinatura ativa", "assinaturas ativas")} />
        <Stat label="Consumo cobrado" value={formatBrlMicros(overview.chargeBrlMicros)} hint={plural(overview.requests, "chamada", "chamadas")} />
        <Stat
          label="Custo de API"
          value={formatBrlMicros(apiCostBrl)}
          hint={`${formatUsdMicros(overview.costUsdMicros)} pagos aos provedores`}
        />
        <Stat
          label="Margem no consumo"
          value={formatBrlMicros(usageMargin)}
          tone={usageMargin >= 0 ? "good" : "bad"}
          hint={`${formatPercent(usageMarginPct)} do consumo cobrado`}
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Clientes ativos no mês" value={`${overview.activeOrgs} / ${overview.totalOrgs}`} />
        <Stat label="Taxa de erro" value={formatPercent(errorRate)} tone={errorRate > 2 ? "bad" : "default"} hint={plural(overview.errors, "falha de provedor", "falhas de provedor")} />
        <Stat
          label="Resultado bruto estimado"
          value={formatBrlMicros(overview.mrrBrlCents * 10_000 - apiCostBrl)}
          hint="MRR − custo de API (antes de impostos e infra)"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Custo por provedor" description="O que você vai pagar na fatura de cada um" />
          {byProvider.length === 0 ? (
            <EmptyState title="Sem consumo ainda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Provedor</Th>
                  <Th className="text-right">Chamadas</Th>
                  <Th className="text-right">Custo US$</Th>
                  <Th className="text-right">Cobrado</Th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((r) => (
                  <tr key={r.providerId}>
                    <Td className="font-medium text-zinc-900">{PROVIDERS[r.providerId].name}</Td>
                    <Td className="text-right tabular-nums">{formatInt(r.requests)}</Td>
                    <Td className="text-right tabular-nums">{formatUsdMicros(r.costUsdMicros)}</Td>
                    <Td className="text-right tabular-nums">{formatBrlMicros(r.chargeBrlMicros)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Custo por modelo" />
          {byModel.length === 0 ? (
            <EmptyState title="Sem consumo ainda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  <Th className="text-right">Entrada / cache / saída</Th>
                  <Th className="text-right">Custo US$</Th>
                  <Th className="text-right">Margem</Th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((r) => {
                  const margin = r.chargeBrlMicros - effectiveCostBrlMicros(r.costUsdMicros, settings);
                  return (
                    <tr key={r.modelId}>
                      <Td className="font-medium text-zinc-900">{r.modelId}</Td>
                      <Td className="text-right tabular-nums">
                        {formatTokens(r.inputTokens)} / {formatTokens(r.cacheReadTokens)} / {formatTokens(r.outputTokens)}
                      </Td>
                      <Td className="text-right tabular-nums">{formatUsdMicros(r.costUsdMicros)}</Td>
                      <Td className={cx("text-right tabular-nums", margin < 0 && "text-red-600")}>{formatBrlMicros(margin)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Simulador de margem por plano"
          description={`Impostos ${economics.revenueTaxPercent}% · gateway ${economics.paymentFeePercent}% · markup médio ${economics.blendedMarkupPercent}% · infra ${formatBrlCents(economics.infraPerSeatBrlCents)}/assento`}
        />
        <Table>
          <thead>
            <tr>
              <Th>Plano</Th>
              <Th className="text-right">Preço</Th>
              <Th className="text-right">Créditos</Th>
              <Th className="text-right">Margem c/ 30% de uso</Th>
              <Th className="text-right">60%</Th>
              <Th className="text-right">100% (pior caso)</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const rows = simulatePlan(p, economics);
              return (
                <tr key={p.id}>
                  <Td className="font-medium text-zinc-900">{p.name}</Td>
                  <Td className="text-right tabular-nums">{formatBrlCents(p.priceBrlCents)}</Td>
                  <Td className="text-right tabular-nums">{formatBrlCents(p.includedCreditsBrlCents)}</Td>
                  {rows.map((r) => (
                    <Td key={r.utilizationPercent} className={cx("text-right tabular-nums", r.grossProfitBrl < 0 && "text-red-600")}>
                      {formatBrl(r.grossProfitBrl)} <span className="text-xs text-zinc-400">({formatPercent(r.grossMarginPercent)})</span>
                    </Td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
