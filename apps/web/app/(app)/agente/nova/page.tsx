import { githubApp, instalacaoDaOrg, LIMITES } from "@forja/agent";
import { and, eq, schema } from "@forja/db";
import { buttonClass, Card, Field, inputClass, Notice, PageHeader } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { modelosDoAgente, PREFERIDOS_DO_AGENTE } from "@/lib/agente";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { getSession } from "@/lib/session";
import { criarTarefaAction } from "../actions";

export const metadata = { title: "Nova tarefa do agente" };
// a primeira parte da tarefa roda logo depois da criação (after), dentro desta função
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovaTarefaPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams;
  const { db, org, plan } = await getSession();
  const instalacao = await instalacaoDaOrg(db, org.id);
  if (!instalacao) {
    return (
      <>
        <PageHeader title="Nova tarefa" />
        <Notice>
          Conecte o GitHub antes de criar uma tarefa.{" "}
          <Link href="/agente" className="font-medium underline">
            Ir para Agente
          </Link>
        </Notice>
      </>
    );
  }

  const projetoDaCall =
    projeto && UUID.test(projeto)
      ? await db.query.projects.findFirst({ where: and(eq(schema.projects.id, projeto), eq(schema.projects.orgId, org.id)) })
      : undefined;
  const pedidoInicial = projetoDaCall?.instructions
    ? `Crie a primeira versão do projeto "${projetoDaCall.name}" conforme esta especificação (combinada na call):\n\n${projetoDaCall.instructions}`
    : "";

  const gh = await githubApp();
  let repos: { fullName: string; private: boolean }[] = [];
  let erroRepos: string | null = null;
  if (gh) {
    try {
      repos = await gh.repositorios(instalacao.installationId);
    } catch {
      erroRepos = "Não consegui listar os repositórios no GitHub agora. Recarregue em instantes.";
    }
  } else erroRepos = "O GitHub App da Forja ainda não foi configurado.";

  const modelos = modelosDoAgente(await listModelOptions(db, plan?.allowedTiers ?? []));
  const padrao = defaultModelFor(modelos, PREFERIDOS_DO_AGENTE);

  return (
    <>
      <PageHeader
        title="Nova tarefa"
        description="Descreva o resultado que você quer, como explicaria a um desenvolvedor. O agente propõe um plano, faz as mudanças e mostra o diff para você aprovar."
        actions={
          <Link href="/agente" className={buttonClass("ghost", "sm")}>
            Voltar
          </Link>
        }
      />
      {projetoDaCall ? (
        <div className="mb-4">
          <Notice tone="blue">
            A especificação da call do projeto <b>{projetoDaCall.name}</b> já está no pedido. Escolha o repositório (pode ser um vazio, criado agora no GitHub) e
            ajuste o que quiser.
          </Notice>
        </div>
      ) : null}
      {erroRepos ? (
        <div className="mb-4">
          <Notice tone="red">{erroRepos}</Notice>
        </div>
      ) : repos.length === 0 ? (
        <div className="mb-4">
          <Notice>
            O app Forja Agentes ainda não enxerga nenhum repositório de <b>{instalacao.accountLogin}</b>. Libere pelo menos um no GitHub (em Agente → Escolher
            repositórios no GitHub).
          </Notice>
        </div>
      ) : null}

      <Card className="max-w-3xl p-6">
        <ActionForm action={criarTarefaAction} submit="Criar tarefa e começar" pending="Preparando o repositório…" variant="brand">
          {projetoDaCall ? <input type="hidden" name="projeto" value={projetoDaCall.id} /> : null}
          <Field label="Repositório">
            <select name="repo" required className={inputClass} defaultValue={repos[0]?.fullName}>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName}
                  {r.private ? " (privado)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="O que fazer" hint="Ex.: “Adicione uma página de contato com formulário (nome, e-mail, mensagem) e um link no menu.”">
            <textarea name="pedido" required minLength={10} rows={pedidoInicial ? 14 : 6} defaultValue={pedidoInicial} className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modelo" hint="Claude, GPT ou Grok. O custo de cada passo aparece ao vivo.">
              <select name="modelo" defaultValue={padrao} className={inputClass}>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.allowed}>
                    {m.displayName}
                    {m.allowed ? "" : " (plano superior)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teto de gasto da tarefa (R$)" hint="O agente para quando chegar nele; o que já foi feito pode virar PR.">
              <input
                name="teto"
                inputMode="decimal"
                defaultValue={(LIMITES.tetoPadraoBrlMicros / 1e6).toFixed(0)}
                className={inputClass}
              />
            </Field>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
