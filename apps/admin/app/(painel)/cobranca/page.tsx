import { nomeDoMetodo, resumoDoPainel, stripeConfigurado } from "@forja/billing";
import { formatBrlCents } from "@forja/core";
import { Badge, Button, Card, CardHeader, cx, EmptyState, inputBaseClass, Notice, PageHeader, Stat, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { reembolsarAction } from "./actions";

export const metadata = { title: "Cobrança" };

const data = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeDoMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;

const STATUS_DA_ASSINATURA: Record<string, { label: string; tone: "green" | "amber" | "red" }> = {
  active: { label: "ativa", tone: "green" },
  past_due: { label: "em atraso", tone: "red" },
  incomplete: { label: "aguardando 1º pagamento", tone: "amber" },
};

export default async function CobrancaPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const db = await adminDb();
  const r = await resumoDoPainel(db);
  const online = stripeConfigurado();

  return (
    <>
      <PageHeader
        title="Cobrança"
        description="Espelho do Stripe gravado pelos webhooks: assinaturas, receita, recusas e reembolsos. Valores brutos, antes das taxas do Stripe e dos impostos."
      />
      <div className="mb-4 space-y-2">
        {erro ? <Notice tone="red">{erro}</Notice> : null}
        {ok ? <Notice tone="blue">{ok}</Notice> : null}
        {!online ? (
          <Notice>
            Stripe não configurado: defina <code>STRIPE_SECRET_KEY</code> e <code>STRIPE_WEBHOOK_SECRET</code> nos dois projetos da Vercel (doc 8).
          </Notice>
        ) : null}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Receita recorrente (MRR)" value={formatBrlCents(r.mrrCentavos)} hint={`${r.assinantes} assinatura(s) ativa(s)`} />
        <Stat label="Recebido neste mês" value={formatBrlCents(r.receitaDoMesCentavos)} hint="assinaturas + recargas − reembolsos" />
        <Stat label="Em atraso" value={String(r.emAtraso)} hint="suspensão automática após 3 dias" tone={r.emAtraso ? "bad" : "default"} />
        <Stat label="Recusas em 30 dias" value={String(r.falhas30Dias)} tone={r.falhas30Dias ? "bad" : "default"} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Assinaturas" />
          {r.assinaturas.length === 0 ? (
            <EmptyState title="Nenhuma assinatura ainda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Plano</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Valor/mês</Th>
                  <Th>Renova</Th>
                </tr>
              </thead>
              <tbody>
                {r.assinaturas.map(({ sub, org }) => {
                  const st = STATUS_DA_ASSINATURA[sub.status] ?? { label: sub.status, tone: "amber" as const };
                  return (
                    <tr key={sub.id}>
                      <Td className="font-medium text-zinc-900">{org}</Td>
                      <Td>
                        {sub.planId}
                        {sub.seats > 1 ? <span className="text-xs text-zinc-500"> · {sub.seats} assentos</span> : null}
                      </Td>
                      <Td>
                        <Badge tone={st.tone}>{st.label}</Badge> {sub.cancelAtPeriodEnd ? <Badge tone="amber">cancela no fim</Badge> : null}
                      </Td>
                      <Td className="text-right tabular-nums">{formatBrlCents(sub.amountBrlCents)}</Td>
                      <Td className="text-xs">{data(sub.currentPeriodEnd)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Receita por mês" />
          {r.porMes.length === 0 ? (
            <EmptyState title="Sem pagamentos ainda" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Mês</Th>
                  <Th className="text-right">Assinaturas</Th>
                  <Th className="text-right">Recargas</Th>
                  <Th className="text-right">Reembolsos</Th>
                </tr>
              </thead>
              <tbody>
                {r.porMes.map((m) => (
                  <tr key={m.mes}>
                    <Td>{nomeDoMes(m.mes)}</Td>
                    <Td className="text-right tabular-nums">{formatBrlCents(m.assinaturas)}</Td>
                    <Td className="text-right tabular-nums">{formatBrlCents(m.recargas)}</Td>
                    <Td className={cx("text-right tabular-nums", m.reembolsos > 0 && "text-red-700")}>
                      {m.reembolsos ? `− ${formatBrlCents(m.reembolsos)}` : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title="Recusas e pendências (30 dias)" description="O cliente recebe o aviso por e-mail e o link da fatura na tela Plano e cobrança." />
        {r.falhas.length === 0 ? (
          <EmptyState title="Nenhuma recusa" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Descrição</Th>
                <Th>Motivo</Th>
                <Th className="text-right">Valor</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {r.falhas.map(({ pagamento: p, org }) => (
                <tr key={p.id}>
                  <Td className="text-xs">{data(p.failedAt ?? p.createdAt)}</Td>
                  <Td className="font-medium text-zinc-900">{org}</Td>
                  <Td>
                    {p.description} {p.status === "pending" ? <Badge tone="amber">aguardando</Badge> : null}
                  </Td>
                  <Td className="text-xs">{p.failureMessage ?? "—"}</Td>
                  <Td className="text-right tabular-nums">{formatBrlCents(p.amountBrlCents)}</Td>
                  <Td>
                    {p.hostedUrl ? (
                      <a className="text-xs underline" href={p.hostedUrl} target="_blank" rel="noreferrer">
                        Fatura
                      </a>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Pagamentos recebidos"
          description="Reembolso total ou parcial (em R$) pelo Stripe; os créditos do cliente são estornados na mesma proporção, sem deixar o saldo negativo."
        />
        {r.recentes.length === 0 ? (
          <EmptyState title="Nenhum pagamento ainda" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Cliente</Th>
                <Th>Descrição</Th>
                <Th>Meio</Th>
                <Th className="text-right">Valor</Th>
                <Th>Reembolso</Th>
              </tr>
            </thead>
            <tbody>
              {r.recentes.map(({ pagamento: p, org }) => {
                const restante = p.amountBrlCents - p.refundedBrlCents;
                const podeReembolsar = online && p.method !== "boleto" && Boolean(p.paymentIntentId) && restante > 0;
                return (
                  <tr key={p.id}>
                    <Td className="text-xs">{data(p.paidAt)}</Td>
                    <Td className="font-medium text-zinc-900">{org}</Td>
                    <Td>{p.description}</Td>
                    <Td className="text-xs">{nomeDoMetodo(p.method)}</Td>
                    <Td className="text-right tabular-nums">
                      {formatBrlCents(p.amountBrlCents)}
                      {p.refundedBrlCents ? <span className="block text-xs text-red-700">− {formatBrlCents(p.refundedBrlCents)}</span> : null}
                    </Td>
                    <Td>
                      {podeReembolsar ? (
                        <form action={reembolsarAction} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            name="valor"
                            placeholder={(restante / 100).toFixed(2).replace(".", ",")}
                            className={cx(inputBaseClass, "w-24 py-1 text-xs")}
                            aria-label="Valor do reembolso em reais (vazio = tudo)"
                          />
                          <Button variant="danger" size="sm">
                            Reembolsar
                          </Button>
                        </form>
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {restante <= 0 ? "reembolsado" : p.method === "boleto" ? "boleto: devolver por fora" : "—"}
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
