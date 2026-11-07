import { effectiveCostBrlMicros, formatBrlCents, formatBrlMicros, formatInt } from "@forja/core";
import { asc, getPricingSettings, platformOrgs, schema, startOfMonth } from "@forja/db";
import { Badge, Button, Card, CardHeader, cx, inputBaseClass, inputClass, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { grantCredits, setOrgPlan, setOrgStatus } from "./actions";

export const metadata = { title: "Clientes" };

export default async function ClientsPage() {
  const db = await adminDb();
  const [orgs, settings, plans] = await Promise.all([
    platformOrgs(db, startOfMonth()),
    getPricingSettings(db),
    db.select().from(schema.plans).orderBy(asc(schema.plans.sortOrder)),
  ]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Assinantes, saldo, consumo do mês e margem por cliente. Clientes no prejuízo aparecem em vermelho — reveja plano ou markup."
      />
      <Card>
        <CardHeader title={`${orgs.length} organizações`} />
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Plano</Th>
              <Th className="text-right">Saldo</Th>
              <Th className="text-right">Chamadas</Th>
              <Th className="text-right">Consumo cobrado</Th>
              <Th className="text-right">Custo API</Th>
              <Th className="text-right">Resultado</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const cost = effectiveCostBrlMicros(o.costUsdMicros, settings);
              const result = (o.planPriceBrlCents ?? 0) * 10_000 - cost;
              return (
                <tr key={o.id}>
                  <Td>
                    <p className="font-medium text-zinc-900">{o.name}</p>
                    <p className="text-xs text-zinc-500">
                      {o.slug} · desde {o.createdAt.toLocaleDateString("pt-BR")}{" "}
                      {o.status === "suspended" ? <Badge tone="red">suspenso</Badge> : null}
                    </p>
                  </Td>
                  <Td>
                    <form action={setOrgPlan} className="flex gap-1">
                      <input type="hidden" name="orgId" value={o.id} />
                      <select name="planId" defaultValue={plans.find((p) => p.name === o.planName)?.id} className={cx(inputBaseClass, "w-auto py-1 text-xs")}>
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {formatBrlCents(p.priceBrlCents)}
                          </option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm">
                        Salvar
                      </Button>
                    </form>
                  </Td>
                  <Td className={cx("text-right tabular-nums", o.balanceBrlMicros < 0 && "text-red-600")}>{formatBrlMicros(o.balanceBrlMicros)}</Td>
                  <Td className="text-right tabular-nums">{formatInt(o.requests)}</Td>
                  <Td className="text-right tabular-nums">{formatBrlMicros(o.chargeBrlMicros)}</Td>
                  <Td className="text-right tabular-nums">{formatBrlMicros(cost)}</Td>
                  <Td className={cx("text-right font-medium tabular-nums", result < 0 ? "text-red-600" : "text-emerald-700")}>
                    {formatBrlMicros(result)}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1.5">
                      <form action={grantCredits} className="flex gap-1">
                        <input type="hidden" name="orgId" value={o.id} />
                        <input name="amount" placeholder="R$" className={cx(inputBaseClass, "w-20 py-1 text-xs")} />
                        <select name="kind" className={cx(inputBaseClass, "w-auto py-1 text-xs")}>
                          <option value="adjustment">Ajuste</option>
                          <option value="topup">Recarga</option>
                        </select>
                        <Button variant="secondary" size="sm">
                          Lançar
                        </Button>
                      </form>
                      <form action={setOrgStatus}>
                        <input type="hidden" name="orgId" value={o.id} />
                        <input type="hidden" name="status" value={o.status === "active" ? "suspended" : "active"} />
                        <Button variant={o.status === "active" ? "danger" : "secondary"} size="sm">
                          {o.status === "active" ? "Suspender" : "Reativar"}
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
