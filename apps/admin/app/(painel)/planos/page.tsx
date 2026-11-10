import { ALL_TIERS, formatBrl, formatPercent, simulatePlan, TIER_LABELS } from "@forja/core";
import { asc, getEconomics, schema } from "@forja/db";
import { Button, Card, CardHeader, cx, Field, inputClass, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { updatePlan } from "./actions";

export const metadata = { title: "Planos e margem" };

export default async function PlansPage() {
  const db = await adminDb();
  const [plans, economics] = await Promise.all([
    db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder)),
    getEconomics(db),
  ]);

  return (
    <>
      <PageHeader
        title="Planos e margem"
        description="Preço, créditos inclusos e modelos liberados por plano. A tabela ao lado de cada plano mostra o lucro bruto por assinante conforme ele usa os créditos."
      />
      <div className="space-y-6">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.name} description={`id: ${p.id} · linha: ${p.kind === "gestao" ? "Gestão (contas do cliente)" : "Construir com a Forja"}`} />
            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <form action={updatePlan} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Nome">
                  <input name="name" defaultValue={p.name} className={inputClass} />
                </Field>
                <Field label="Preço mensal (R$)">
                  <input name="price" defaultValue={p.priceBrlCents / 100} className={inputClass} />
                </Field>
                <Field label="Créditos inclusos (R$)">
                  <input name="credits" defaultValue={p.includedCreditsBrlCents / 100} className={inputClass} />
                </Field>
                <Field label="Assentos">
                  <input name="seats" defaultValue={p.seats} className={inputClass} />
                </Field>
                <Field label="Máx. projetos" hint="Vazio = ilimitado">
                  <input name="maxProjects" defaultValue={p.maxProjects ?? ""} className={inputClass} />
                </Field>
                <Field label="Descrição">
                  <input name="description" defaultValue={p.description} className={inputClass} />
                </Field>
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1 text-xs font-medium text-zinc-700">Faixas de modelos liberadas</legend>
                  <div className="flex flex-wrap gap-3 text-sm">
                    {ALL_TIERS.map((t) => (
                      <label key={t} className="inline-flex items-center gap-1.5">
                        <input type="checkbox" name="tiers" value={t} defaultChecked={p.allowedTiers.includes(t)} />
                        {TIER_LABELS[t]}
                      </label>
                    ))}
                    <label className="ml-auto inline-flex items-center gap-1.5">
                      <input type="checkbox" name="active" defaultChecked={p.active} /> Plano ativo
                    </label>
                  </div>
                </fieldset>
                <div className="sm:col-span-2">
                  <Button type="submit">Salvar plano</Button>
                </div>
              </form>

              <Table>
                <thead>
                  <tr>
                    <Th>Uso dos créditos</Th>
                    <Th className="text-right">Receita líquida</Th>
                    <Th className="text-right">Custo API</Th>
                    <Th className="text-right">Infra</Th>
                    <Th className="text-right">Lucro bruto</Th>
                  </tr>
                </thead>
                <tbody>
                  {simulatePlan(p, economics, [0, 30, 60, 100, 150]).map((r) => (
                    <tr key={r.utilizationPercent}>
                      <Td>{r.utilizationPercent}%{r.utilizationPercent > 100 ? " (com recargas)" : ""}</Td>
                      <Td className="text-right tabular-nums">{formatBrl(r.netRevenueBrl)}</Td>
                      <Td className="text-right tabular-nums">{formatBrl(r.apiCostBrl)}</Td>
                      <Td className="text-right tabular-nums">{formatBrl(r.infraBrl)}</Td>
                      <Td className={cx("text-right font-medium tabular-nums", r.grossProfitBrl < 0 && "text-red-600")}>
                        {formatBrl(r.grossProfitBrl)} <span className="text-xs text-zinc-400">({formatPercent(r.grossMarginPercent)})</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
