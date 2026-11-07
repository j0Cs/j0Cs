import { BOLETO_DIAS, nomeDoMetodo, PACOTES_DE_RECARGA_CENTAVOS, resumoDaCobranca, stripeConfigurado } from "@forja/billing";
import {
  bloqueioDaOrg,
  diasRestantesDoTeste,
  formatBrl,
  formatBrlCents,
  formatBrlMicros,
  TIER_LABELS,
  TRIAL_PLAN_ID,
} from "@forja/core";
import { asc, eq, schema } from "@forja/db";
import { Badge, Card, CardHeader, cx, EmptyState, inputBaseClass, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { FormCobranca } from "@/components/form-cobranca";
import { listModelOptions } from "@/lib/models";
import { canManage, getSession } from "@/lib/session";
import { assinarAction, portalAction, recarregarAction, trocarPlanoAction } from "./actions";

export const metadata = { title: "Plano e cobrança" };

const data = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const STATUS_DO_PAGAMENTO: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  paid: { label: "Pago", tone: "green" },
  pending: { label: "Aguardando", tone: "amber" },
  failed: { label: "Recusado", tone: "red" },
  refunded: { label: "Reembolsado", tone: "gray" },
  partially_refunded: { label: "Reembolso parcial", tone: "gray" },
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ pagamento?: string }> }) {
  const { pagamento } = await searchParams;
  const { db, org, plan, role } = await getSession();
  const [plans, models, cobranca] = await Promise.all([
    db.select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder)),
    listModelOptions(db, plan?.allowedTiers ?? []),
    resumoDaCobranca(db, org.id),
  ]);
  const online = stripeConfigurado();
  const gerencia = canManage(role);
  const { assinatura, pagamentos, pendente } = cobranca;
  const ativa = assinatura?.status === "active" || assinatura?.status === "past_due";
  const bloqueio = bloqueioDaOrg(org);
  const noTeste = org.planId === TRIAL_PLAN_ID;
  const diasDeTeste = noTeste ? diasRestantesDoTeste(org.trialEndsAt) : null;
  const proximoPlano = assinatura && assinatura.planId !== org.planId ? plans.find((p) => p.id === assinatura.planId) : undefined;
  const podeRecarregar = online && gerencia && !bloqueio && Boolean(org.planId) && !noTeste;

  return (
    <>
      <PageHeader
        title="Plano e cobrança"
        description="A assinatura inclui créditos todo mês. Cada resposta debita o custo real do modelo usado, sem limite escondido: acabou o crédito, você recarrega."
      />

      <div className="mb-6 space-y-2">
        {pagamento === "assinatura" ? (
          <Notice tone="blue">Pagamento enviado. O plano e os créditos entram assim que o Stripe confirmar (no cartão, em segundos; no boleto, até 2 dias úteis depois de pago).</Notice>
        ) : null}
        {pagamento === "recarga" ? <Notice tone="blue">Recarga enviada. O crédito entra assim que o pagamento for confirmado (Pix e cartão: na hora).</Notice> : null}
        {!online ? <Notice>Os pagamentos online ainda não estão ligados. Para assinar agora, fale com o suporte.</Notice> : null}
        {pendente ? (
          <Notice tone="red">
            A cobrança de {formatBrlCents(pendente.amountBrlCents)} não passou{pendente.failureMessage ? `: ${pendente.failureMessage}` : ""}.{" "}
            {org.status === "suspended" ? "O uso está pausado até o pagamento entrar." : "Regularize em até 3 dias para o uso não ser pausado."}{" "}
            {pendente.hostedUrl ? (
              <a className="font-medium underline" href={pendente.hostedUrl} target="_blank" rel="noreferrer">
                Pagar a fatura
              </a>
            ) : null}
          </Notice>
        ) : null}
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sua assinatura</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold">{plan?.name ?? "Sem plano"}</p>
            {noTeste && diasDeTeste !== null && !bloqueio ? (
              <Badge tone="amber">{diasDeTeste === 0 ? "teste termina hoje" : `faltam ${diasDeTeste} dia(s) de teste`}</Badge>
            ) : null}
            {bloqueio ? <Badge tone="red">uso pausado</Badge> : null}
            {assinatura?.status === "active" && !assinatura.cancelAtPeriodEnd ? <Badge tone="green">ativa</Badge> : null}
            {assinatura?.status === "past_due" ? <Badge tone="red">pagamento em aberto</Badge> : null}
            {assinatura?.status === "incomplete" ? <Badge tone="amber">aguardando o 1º pagamento</Badge> : null}
            {assinatura?.cancelAtPeriodEnd ? <Badge tone="amber">cancelamento agendado</Badge> : null}
          </div>
          <div className="mt-3 space-y-1 text-sm text-zinc-600">
            {bloqueio ? <p>{bloqueio.message}</p> : null}
            {assinatura && ativa ? (
              <p>
                {formatBrlCents(assinatura.amountBrlCents)}/mês
                {assinatura.seats > 1 ? ` · ${assinatura.seats} assentos` : ""} ·{" "}
                {assinatura.cancelAtPeriodEnd ? `termina em ${data(assinatura.currentPeriodEnd)}` : `renova em ${data(assinatura.currentPeriodEnd)}`}
              </p>
            ) : null}
            {proximoPlano && ativa ? <p>Na renovação, muda para o plano {proximoPlano.name}.</p> : null}
            {assinatura?.status === "incomplete" ? (
              <p>O boleto vale {BOLETO_DIAS} dias. Assim que ele for pago, o plano e os créditos entram sozinhos.</p>
            ) : null}
            {noTeste && !bloqueio ? <p>No teste, só os modelos econômicos. Os premium liberam com a assinatura.</p> : null}
            <p>
              Saldo: <b className="tabular-nums text-zinc-900">{formatBrlMicros(org.creditBalanceBrlMicros)}</b>. Créditos do plano valem até a
              renovação; os de recarga ficam guardados.
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pagamentos e faturas</p>
          <p className="mt-2 text-sm text-zinc-600">
            Troque o cartão, baixe notas e faturas, pague um boleto em aberto ou cancele a assinatura. Abre o portal seguro do Stripe.
          </p>
          <div className="mt-4">
            {online && gerencia && org.billingCustomerId ? (
              <FormCobranca action={portalAction} submit="Abrir o portal" variant="secondary" />
            ) : (
              <p className="text-xs text-zinc-500">
                {!gerencia ? "Só donos e administradores acessam os pagamentos." : "Disponível depois do primeiro pagamento."}
              </p>
            )}
          </div>
        </Card>
      </div>

      <h2 id="planos" className="mb-3 text-sm font-semibold text-zinc-900">
        Planos
      </h2>
      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans
          .filter((p) => p.priceBrlCents > 0)
          .map((p) => {
            const atual = p.id === org.planId && ativa;
            const porAssento = Boolean(p.minSeats);
            const assentosPadrao = atual ? (assinatura?.seats ?? p.minSeats ?? 1) : (p.minSeats ?? 1);
            return (
              <Card key={p.id} className={cx("flex flex-col p-5", atual && "border-zinc-900 ring-1 ring-zinc-900")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {atual ? <Badge tone="brand">Seu plano</Badge> : null}
                </div>
                <p className="mt-2 text-2xl font-semibold">
                  {formatBrlCents(p.priceBrlCents)}
                  <span className="text-sm font-normal text-zinc-500">{porAssento ? "/assento/mês" : "/mês"}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {formatBrlCents(p.includedCreditsBrlCents)} em créditos{porAssento ? " por assento" : ""} todo mês
                </p>
                <p className="mt-3 text-xs text-zinc-500">{p.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.allowedTiers.map((t) => (
                    <Badge key={t}>{TIER_LABELS[t]}</Badge>
                  ))}
                </div>
                <div className="mt-auto pt-4">
                  {online && gerencia ? (
                    <FormCobranca
                      action={ativa ? trocarPlanoAction : assinarAction}
                      submit={atual ? "Atualizar assentos" : ativa ? "Mudar para este plano" : "Assinar"}
                      pending={ativa ? "Mudando…" : "Abrindo o pagamento…"}
                      variant={atual ? "secondary" : "primary"}
                    >
                      <input type="hidden" name="planId" value={p.id} />
                      {porAssento ? (
                        <label className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                          Assentos (mín. {p.minSeats})
                          <input
                            name="assentos"
                            type="number"
                            min={p.minSeats ?? 1}
                            max={200}
                            defaultValue={assentosPadrao}
                            className={cx(inputBaseClass, "w-20 py-1 text-right")}
                          />
                        </label>
                      ) : null}
                    </FormCobranca>
                  ) : null}
                  {atual && !porAssento ? <p className="text-center text-xs text-zinc-500">Plano em vigor</p> : null}
                </div>
              </Card>
            );
          })}
      </div>
      {ativa && online && gerencia ? (
        <p className="-mt-5 mb-8 text-xs text-zinc-500">
          Para um plano maior, a troca vale na hora e cobra só a diferença proporcional (os créditos da diferença entram junto). Para um
          menor, vale na renovação, sem perder o que já foi pago.
        </p>
      ) : !ativa && online && gerencia ? (
        <p className="-mt-5 mb-8 text-xs text-zinc-500">Cartão (Visa e Mastercard) ou boleto. Cupom de desconto no próprio pagamento.</p>
      ) : null}

      <Card id="recarga" className="mb-8 scroll-mt-6">
        <CardHeader
          title="Recarga de créditos"
          description="Pix ou cartão, o crédito entra na hora. R$ 1 pago = R$ 1 em créditos, pelo mesmo preço de tabela."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {PACOTES_DE_RECARGA_CENTAVOS.map((v) => (
            <div key={v} className="rounded-lg border border-zinc-200 p-4">
              <p className="text-lg font-semibold tabular-nums">{formatBrlCents(v)}</p>
              <p className="mb-3 text-xs text-zinc-500">em créditos</p>
              {podeRecarregar ? (
                <FormCobranca action={recarregarAction} submit="Recarregar" pending="Abrindo o Pix…" variant="secondary" size="sm">
                  <input type="hidden" name="valor" value={v} />
                </FormCobranca>
              ) : null}
            </div>
          ))}
        </div>
        {!podeRecarregar ? (
          <p className="px-5 pb-5 text-xs text-zinc-500">
            {!gerencia
              ? "Só donos e administradores fazem recargas."
              : bloqueio
                ? "Regularize o plano para recarregar."
                : !online
                  ? "Recargas online ainda não estão ligadas."
                  : "As recargas são para assinantes: assine um plano primeiro."}
          </p>
        ) : null}
      </Card>

      <Card className="mb-8">
        <CardHeader title="Histórico de pagamentos" />
        {pagamentos.length === 0 ? (
          <EmptyState title="Nenhum pagamento ainda" description="Assinaturas e recargas aparecem aqui." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Meio</Th>
                <Th className="text-right">Valor</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p) => {
                const st = STATUS_DO_PAGAMENTO[p.status] ?? { label: p.status, tone: "gray" as const };
                return (
                  <tr key={p.id}>
                    <Td className="text-xs">{data(p.paidAt ?? p.failedAt ?? p.createdAt)}</Td>
                    <Td>
                      {p.description}
                      {p.failureMessage && p.status !== "paid" ? <span className="block text-xs text-red-700">{p.failureMessage}</span> : null}
                    </Td>
                    <Td className="text-xs">{nomeDoMetodo(p.method)}</Td>
                    <Td className="text-right tabular-nums">{formatBrlCents(p.amountBrlCents)}</Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    <Td>
                      {p.hostedUrl ? (
                        <a className="text-xs font-medium text-zinc-700 underline" href={p.hostedUrl} target="_blank" rel="noreferrer">
                          Fatura
                        </a>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

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
