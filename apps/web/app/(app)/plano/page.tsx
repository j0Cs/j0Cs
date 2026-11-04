import { formatBrl, formatBrlCents, TIER_LABELS } from "@forja/core";
import { asc, eq, schema } from "@forja/db";
import { Badge, Card, CardHeader, cx, PageHeader, Table, Td, Th } from "@forja/ui";
import { listModelOptions } from "@/lib/models";
import { getSession } from "@/lib/session";

export const metadata = { title: "Plano e modelos" };

export default async function PlanPage() {
  const { db, plan } = await getSession();
  const [plans, models] = await Promise.all([
    db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder)),
    listModelOptions(db, plan?.allowedTiers ?? []),
  ]);

  return (
    <>
      <PageHeader
        title="Plano e modelos"
        description="A assinatura inclui créditos todo mês. Cada resposta debita o custo real do modelo usado — sem limite escondido: acabou o crédito, você recarrega."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.filter((p) => p.priceBrlCents > 0 || p.id === plan?.id).map((p) => (
          <Card key={p.id} className={cx("p-5", p.id === plan?.id && "border-zinc-900 ring-1 ring-zinc-900")}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">{p.name}</p>
              {p.id === plan?.id ? <Badge tone="brand">Seu plano</Badge> : null}
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {formatBrlCents(p.priceBrlCents)}
              <span className="text-sm font-normal text-zinc-500">/mês</span>
            </p>
            <p className="mt-1 text-sm text-zinc-600">{formatBrlCents(p.includedCreditsBrlCents)} em créditos inclusos</p>
            <p className="mt-3 text-xs text-zinc-500">{p.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {p.allowedTiers.map((t) => (
                <Badge key={t}>{TIER_LABELS[t]}</Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Tabela de preços dos modelos" description="Por 1 milhão de tokens (≈ 750 mil palavras). Leitura de cache = contexto reaproveitado." />
        <Table>
          <thead>
            <tr>
              <Th>Modelo</Th>
              <Th>Faixa</Th>
              <Th className="text-right">Entrada</Th>
              <Th className="text-right">Cache</Th>
              <Th className="text-right">Saída</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <Td>
                  <p className="font-medium text-zinc-900">{m.displayName}</p>
                  <p className="text-xs text-zinc-500">{m.description}</p>
                </Td>
                <Td>{TIER_LABELS[m.tier]}</Td>
                <Td className="text-right tabular-nums">{formatBrl(m.inputBrlPerMTok)}</Td>
                <Td className="text-right tabular-nums">{formatBrl(m.cacheReadBrlPerMTok)}</Td>
                <Td className="text-right tabular-nums">{formatBrl(m.outputBrlPerMTok)}</Td>
                <Td>{m.allowed ? <Badge tone="green">Incluso</Badge> : <Badge tone="amber">Upgrade</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
