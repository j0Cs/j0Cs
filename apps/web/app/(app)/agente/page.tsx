import { configDoGithubApp, gastoDoAgenteHoje, instalacaoDaOrg, LIMITES } from "@forja/agent";
import { formatBrlMicros } from "@forja/core";
import { desc, eq, schema } from "@forja/db";
import { Badge, buttonClass, Card, CardHeader, EmptyState, Field, inputClass, Notice, PageHeader, Table, Td, Th } from "@forja/ui";
import { GitPullRequest } from "lucide-react";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AVISOS_DO_GITHUB, STATUS_DA_TAREFA } from "@/lib/agente-ui";
import { canManage, getSession } from "@/lib/session";
import { tetoDiarioAction } from "./actions";

export const metadata = { title: "Agente" };

const data = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function AgentePage({ searchParams }: { searchParams: Promise<{ github?: string }> }) {
  const { github } = await searchParams;
  const { db, org, role } = await getSession();
  const [instalacao, tarefas, gastoHoje, configurado] = await Promise.all([
    instalacaoDaOrg(db, org.id),
    db.select().from(schema.agentTasks).where(eq(schema.agentTasks.orgId, org.id)).orderBy(desc(schema.agentTasks.createdAt)).limit(50),
    gastoDoAgenteHoje(db, org.id),
    configDoGithubApp().then(Boolean),
  ]);
  const aviso = github ? AVISOS_DO_GITHUB[github] : undefined;
  const gerencia = canManage(role);
  const linkDaInstalacao = instalacao
    ? instalacao.accountType === "Organization"
      ? `https://github.com/organizations/${instalacao.accountLogin}/settings/installations/${instalacao.installationId}`
      : `https://github.com/settings/installations/${instalacao.installationId}`
    : null;

  return (
    <>
      <PageHeader
        title="Agente"
        description="Peça uma mudança em português e receba um pull request pronto para revisar. O agente lê o repositório, faz as alterações numa cópia e só abre o PR depois que você aprova."
        actions={
          instalacao ? (
            <Link href="/agente/nova" className={buttonClass("brand")}>
              Nova tarefa
            </Link>
          ) : null
        }
      />
      {aviso ? (
        <div className="mb-4">
          <Notice tone={aviso.tone}>{aviso.texto}</Notice>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <GitPullRequest size={22} className="mt-0.5 shrink-0 text-zinc-700" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-900">GitHub</p>
              {instalacao ? (
                <p className="mt-1 text-sm text-zinc-600">
                  Conectado a <b>{instalacao.accountLogin}</b>. O agente só enxerga os repositórios que você liberou para o app Forja Agentes e só
                  escreve numa branch nova, pelo PR que você aprovar.
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  Instale o app <b>Forja Agentes</b> na sua conta ou organização do GitHub e escolha quais repositórios ele pode ver. Nenhuma senha ou
                  token pessoal fica guardado aqui.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {gerencia && configurado ? (
                  <a href="/api/github/instalar" className={buttonClass(instalacao ? "secondary" : "primary", "sm")}>
                    {instalacao ? "Conectar outra conta" : "Conectar o GitHub"}
                  </a>
                ) : null}
                {linkDaInstalacao ? (
                  <a href={linkDaInstalacao} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
                    Escolher repositórios no GitHub
                  </a>
                ) : null}
              </div>
              {!configurado ? <p className="mt-2 text-xs text-zinc-500">A conexão com o GitHub ainda está sendo configurada pela equipe da Forja.</p> : null}
              {!gerencia && !instalacao ? <p className="mt-2 text-xs text-zinc-500">Peça a um dono ou administrador para conectar.</p> : null}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="font-medium text-zinc-900">Teto diário</p>
          <p className="mt-1 text-sm text-zinc-600">
            Gasto do agente hoje: <b className="tabular-nums">{formatBrlMicros(gastoHoje)}</b> de {formatBrlMicros(org.agentDailyCapBrlMicros)}. Cada tarefa
            também tem o próprio teto, e até {LIMITES.simultaneas} rodam ao mesmo tempo.
          </p>
          {gerencia ? (
            <ActionForm action={tetoDiarioAction} submit="Salvar" variant="secondary" className="mt-3 space-y-2">
              <Field label="Teto diário (R$)">
                <input name="teto" inputMode="decimal" defaultValue={(org.agentDailyCapBrlMicros / 1e6).toFixed(0)} className={inputClass} />
              </Field>
            </ActionForm>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader title="Tarefas" />
        {tarefas.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa ainda"
            description={instalacao ? "Crie a primeira: por exemplo, “adicione uma página de contato com formulário”." : "Conecte o GitHub para começar."}
            action={
              instalacao ? (
                <Link href="/agente/nova" className={buttonClass("primary", "sm")}>
                  Nova tarefa
                </Link>
              ) : null
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Tarefa</Th>
                <Th>Repositório</Th>
                <Th>Status</Th>
                <Th className="text-right">Custo</Th>
                <Th>Criada</Th>
              </tr>
            </thead>
            <tbody>
              {tarefas.map((t) => {
                const st = STATUS_DA_TAREFA[t.status] ?? { label: t.status, tone: "gray" as const };
                return (
                  <tr key={t.id}>
                    <Td>
                      <Link href={`/agente/${t.id}`} className="font-medium text-zinc-900 hover:underline">
                        {t.title}
                      </Link>
                    </Td>
                    <Td className="text-xs">{t.repoFullName}</Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{formatBrlMicros(t.spentBrlMicros)}</Td>
                    <Td className="text-xs">{data(t.createdAt)}</Td>
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
