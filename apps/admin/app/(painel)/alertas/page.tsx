import { formatUsdMicros, PROVIDERS } from "@forja/core";
import { desc, isNotNull, isNull, schema } from "@forja/db";
import { metaDoCambio } from "@forja/ops";
import { Badge, Button, Card, CardHeader, EmptyState, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { adminDb } from "@/lib/admin";
import { conciliarAgoraAction, enviarAlertaDeTesteAction, resolverAlertaAction, verificarAgoraAction } from "./actions";

export const metadata = { title: "Alertas" };

const quando = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

const TIPO: Record<string, string> = {
  margem: "margem",
  chave: "chave",
  provedor: "provedor",
  cambio: "câmbio",
  conciliacao: "conciliação",
  backup: "backup",
  teste: "teste",
};

const STATUS_DA_CONCILIACAO: Record<string, { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  ok: { label: "bate", tone: "green" },
  divergente: { label: "diferença > 2%", tone: "red" },
  sem_relatorio: { label: "sem relatório", tone: "gray" },
  erro: { label: "erro na leitura", tone: "amber" },
};

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const db = await adminDb();
  const [abertos, resolvidos, conciliacoes, fx] = await Promise.all([
    db.select().from(schema.ownerAlerts).where(isNull(schema.ownerAlerts.resolvedAt)).orderBy(desc(schema.ownerAlerts.createdAt)).limit(100),
    db.select().from(schema.ownerAlerts).where(isNotNull(schema.ownerAlerts.resolvedAt)).orderBy(desc(schema.ownerAlerts.resolvedAt)).limit(20),
    db.select().from(schema.costReconciliations).orderBy(desc(schema.costReconciliations.day), schema.costReconciliations.providerId).limit(28),
    metaDoCambio(db),
  ]);

  return (
    <>
      <PageHeader
        title="Alertas"
        description="Problemas que pedem atenção do dono. A rotina diária confere tudo e manda um e-mail para a equipe quando aparece algo novo."
        actions={
          <div className="flex flex-wrap gap-2">
            <form action={verificarAgoraAction}>
              <Button type="submit" variant="secondary" size="sm">
                Verificar agora
              </Button>
            </form>
            <form action={enviarAlertaDeTesteAction}>
              <Button type="submit" size="sm">
                Enviar alerta de teste
              </Button>
            </form>
          </div>
        }
      />
      <div className="mb-4 space-y-2">
        {erro ? <Notice tone="red">{erro}</Notice> : null}
        {ok ? <Notice tone="blue">{ok}</Notice> : null}
      </div>

      <Card className="mb-6">
        <CardHeader title={`Abertos (${abertos.length})`} description="Resolva quando tratar. O mesmo problema não abre dois alertas; se voltar depois de resolvido, abre de novo." />
        {abertos.length === 0 ? (
          <EmptyState title="Nenhum alerta aberto" description="Margem, chaves, provedores, câmbio e conciliação estão em dia." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {abertos.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={a.severity === "critico" ? "red" : "amber"}>{a.severity === "critico" ? "crítico" : "aviso"}</Badge>
                    <Badge tone="gray">{TIPO[a.kind] ?? a.kind}</Badge>
                    <span className="font-medium text-zinc-900">{a.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">{a.detail}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    aberto em {quando(a.createdAt)} · {a.notifiedAt ? `e-mail em ${quando(a.notifiedAt)}` : "e-mail pendente"}
                  </p>
                </div>
                <form action={resolverAlertaAction} className="shrink-0">
                  <input type="hidden" name="id" value={a.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    Marcar como resolvido
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Conciliação de custos"
            description="O que a Forja registrou contra o relatório de custo do provedor, dois dias depois (os relatórios atrasam). Diferença acima de 2% abre alerta."
            actions={
              <form action={conciliarAgoraAction}>
                <Button type="submit" variant="secondary" size="sm">
                  Conciliar agora
                </Button>
              </form>
            }
          />
          {conciliacoes.length === 0 ? (
            <EmptyState
              title="Nenhuma conciliação ainda"
              description="Cadastre ANTHROPIC_ADMIN_KEY e OPENAI_ADMIN_KEY nos Secrets do Supabase (doc 10). A rotina diária concilia sozinha."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Dia</Th>
                  <Th>Provedor</Th>
                  <Th className="text-right">Forja</Th>
                  <Th className="text-right">Relatório</Th>
                  <Th>Resultado</Th>
                </tr>
              </thead>
              <tbody>
                {conciliacoes.map((c) => {
                  const st = STATUS_DA_CONCILIACAO[c.status] ?? { label: c.status, tone: "gray" as const };
                  return (
                    <tr key={c.id}>
                      <Td className="tabular-nums">{c.day.split("-").reverse().join("/")}</Td>
                      <Td>{PROVIDERS[c.providerId].name}</Td>
                      <Td className="text-right tabular-nums">{formatUsdMicros(c.recordedUsdMicros)}</Td>
                      <Td className="text-right tabular-nums">{c.reportedUsdMicros === null ? "—" : formatUsdMicros(c.reportedUsdMicros)}</Td>
                      <Td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {c.diffPercent !== null && c.status !== "ok" ? (
                          <span className="ml-1 text-xs text-zinc-500">{(c.diffPercent / 100).toFixed(2).replace(".", ",")}%</span>
                        ) : null}
                        {c.detail && c.status !== "ok" && c.status !== "divergente" ? <div className="text-xs text-zinc-500">{c.detail}</div> : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="O que é verificado" />
          <ul className="space-y-2 p-5 text-sm text-zinc-600">
            <li>
              <b className="text-zinc-900">Margem negativa</b>: cliente que nos últimos 7 dias foi cobrado abaixo do custo efetivo.
            </li>
            <li>
              <b className="text-zinc-900">Chave falhando</b>: 5 erros ou mais e 20% das chamadas da chave em 24 h.
            </li>
            <li>
              <b className="text-zinc-900">Provedor com erro</b>: mais de 2% das chamadas em 24 h (com 50 chamadas ou mais).
            </li>
            <li>
              <b className="text-zinc-900">Câmbio desatualizado</b>: sem PTAX há mais de 3 dias.{" "}
              {fx.atualizadoEm ? `Última atualização: ${quando(fx.atualizadoEm)}.` : "Ainda não atualizado pela rotina."}
            </li>
            <li>
              <b className="text-zinc-900">Conciliação</b>: diferença acima de 2% (e de US$ 1) contra o relatório do provedor.
            </li>
            <li>
              <b className="text-zinc-900">Backup</b>: cópia diária que falhou ou não rodou.
            </li>
          </ul>
        </Card>
      </div>

      {resolvidos.length ? (
        <Card>
          <CardHeader title="Resolvidos recentemente" />
          <Table>
            <thead>
              <tr>
                <Th>Alerta</Th>
                <Th>Aberto</Th>
                <Th>Resolvido</Th>
              </tr>
            </thead>
            <tbody>
              {resolvidos.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <span className="text-zinc-900">{a.title}</span> <span className="text-xs text-zinc-400">({TIPO[a.kind] ?? a.kind})</span>
                  </Td>
                  <Td className="text-xs">{quando(a.createdAt)}</Td>
                  <Td className="text-xs">{quando(a.resolvedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
