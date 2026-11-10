import { effectiveCostBrlMicros, formatBrlMicros, formatInt, formatTokens } from "@forja/core";
import { getPricingSettings } from "@forja/db";
import { metricasDoBeta } from "@forja/ops";
import { Badge, Card, CardHeader, cx, EmptyState, PageHeader, Stat, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";

export const metadata = { title: "Métricas do beta" };

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "—");

export default async function MetricasPage() {
  const db = await adminDb();
  const [m, settings] = await Promise.all([metricasDoBeta(db, 30), getPricingSettings(db)]);
  const f = m.funil;
  const etapas = [
    { nome: "Criaram a conta", valor: f.cadastros },
    { nome: "Confirmaram o e-mail", valor: f.emailConfirmado },
    { nome: "Tiveram a primeira resposta", valor: f.primeiraResposta },
    { nome: "Assinaram um plano", valor: f.assinantes },
  ];
  const contexto = m.cache.entrada + m.cache.lido + m.cache.escrito;
  const margem = (cobrado: number, custoUsd: number) => cobrado - effectiveCostBrlMicros(custoUsd, settings);
  const negativas = m.clientes.filter((c) => c.requisicoes > 0 && margem(c.chargeBrlMicros, c.costUsdMicros) < 0).length;

  return (
    <>
      <PageHeader title="Métricas do beta" description="Últimos 30 dias. A margem usa o câmbio e o sobrecusto de agora." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Empresas ativas na semana" value={formatInt(m.ativasNaSemana)} hint="com pelo menos uma resposta em 7 dias · meta do beta: 10" tone={m.ativasNaSemana >= 10 ? "good" : undefined} />
        <Stat label="Primeira resposta em 10 min" value={pct(f.respostaEm10Min, f.cadastros)} hint={`${f.respostaEm10Min} de ${f.cadastros} contas novas`} />
        <Stat label="Contexto vindo do cache" value={pct(m.cache.lido, contexto)} hint="token lido do cache custa cerca de 10% do preço" tone={contexto && m.cache.lido / contexto < 0.4 ? "bad" : undefined} />
        <Stat label="Clientes com margem negativa" value={formatInt(negativas)} hint="meta do beta: nenhum" tone={negativas ? "bad" : "good"} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Funil das contas novas" description="Das empresas criadas nos últimos 30 dias, quantas chegaram a cada etapa." />
        {f.cadastros === 0 ? (
          <EmptyState title="Nenhuma conta nova em 30 dias" description="Mande os convites de fundador: cada cadastro aparece aqui." />
        ) : (
          <ol className="space-y-3 p-5">
            {etapas.map((e, i) => (
              <li key={e.nome} className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-zinc-700">{e.nome}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
                  <span className="block h-full rounded-full bg-zinc-800" style={{ width: `${f.cadastros ? Math.max(2, (e.valor / f.cadastros) * 100) : 0}%` }} />
                </span>
                <span className="w-28 text-right tabular-nums text-zinc-900">
                  {e.valor} <span className="text-xs text-zinc-500">{i ? `(${pct(e.valor, etapas[i - 1]!.valor)} da etapa anterior)` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Modelos mais usados" />
          {m.modelos.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-zinc-500">Sem uso no período.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">Tokens</Th>
                  <Th className="text-right">Cobrado</Th>
                  <Th className="text-right">Margem</Th>
                </tr>
              </thead>
              <tbody>
                {m.modelos.map((x) => {
                  const mg = margem(x.chargeBrlMicros, x.costUsdMicros);
                  return (
                    <tr key={x.modelId}>
                      <Td className="font-mono text-xs">{x.modelId}</Td>
                      <Td className="text-right tabular-nums">{formatInt(x.requisicoes)}</Td>
                      <Td className="text-right tabular-nums">{formatTokens(x.tokens)}</Td>
                      <Td className="text-right tabular-nums">{formatBrlMicros(x.chargeBrlMicros)}</Td>
                      <Td className={cx("text-right tabular-nums", mg < 0 && "font-medium text-red-700")}>{formatBrlMicros(mg)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Uso e margem por cliente" description="Créditos usados no período e o que sobrou depois do custo dos provedores." />
          {m.clientes.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-zinc-500">Nenhum cliente no período.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th className="text-right">Pedidos</Th>
                  <Th className="text-right">Créditos usados</Th>
                  <Th className="text-right">Margem</Th>
                  <Th className="text-right">Último uso</Th>
                </tr>
              </thead>
              <tbody>
                {m.clientes.map((c) => {
                  const mg = margem(c.chargeBrlMicros, c.costUsdMicros);
                  return (
                    <tr key={c.orgId}>
                      <Td>
                        {c.nome}{" "}
                        <span className="ml-1 inline-flex gap-1 align-middle">
                          <Badge>{c.plano ?? "sem plano"}</Badge>
                          {c.convite ? <Badge tone="blue">fundador</Badge> : null}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums">{formatInt(c.requisicoes)}</Td>
                      <Td className="text-right tabular-nums">{formatBrlMicros(c.chargeBrlMicros)}</Td>
                      <Td className={cx("text-right tabular-nums", mg < 0 && "font-medium text-red-700")}>{c.requisicoes ? formatBrlMicros(mg) : "—"}</Td>
                      <Td className="text-right text-xs">{quando(c.ultimoUso)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
