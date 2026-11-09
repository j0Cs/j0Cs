import { and, asc, eq, schema, sql } from "@forja/db";
import { buttonClass, PageHeader } from "@forja/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { TarefaAoVivo } from "./tarefa-ao-vivo";

export const metadata = { title: "Tarefa do agente" };
// aprovar (abrir o PR) roda nesta página
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, org } = await getSession();
  const t = await db.query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.id, id), eq(schema.agentTasks.orgId, org.id)) });
  if (!t) notFound();
  const [passos, [arquivos]] = await Promise.all([
    db
      .select({
        idx: schema.agentTaskSteps.idx,
        kind: schema.agentTaskSteps.kind,
        toolName: schema.agentTaskSteps.toolName,
        summary: schema.agentTaskSteps.summary,
        detail: schema.agentTaskSteps.detail,
        isError: schema.agentTaskSteps.isError,
      })
      .from(schema.agentTaskSteps)
      .where(eq(schema.agentTaskSteps.taskId, t.id))
      .orderBy(asc(schema.agentTaskSteps.idx))
      .limit(200),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.agentTaskFiles).where(eq(schema.agentTaskFiles.taskId, t.id)),
  ]);

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.request.length > 300 ? `${t.request.slice(0, 300)}…` : t.request}
        actions={
          <Link href="/agente" className={buttonClass("ghost", "sm")}>
            Todas as tarefas
          </Link>
        }
      />
      <TarefaAoVivo
        inicial={{
          tarefa: {
            id: t.id,
            status: t.status,
            titulo: t.title,
            repo: t.repoFullName,
            branchBase: t.baseBranch,
            plano: t.plan,
            resumo: t.summary,
            tituloPr: t.prTitle,
            motivo: t.stopReason,
            erro: t.error,
            prUrl: t.prUrl,
            gastoBrlMicros: t.spentBrlMicros,
            tetoBrlMicros: t.budgetBrlMicros,
            passos: t.stepCount,
            arquivosAlterados: arquivos?.n ?? 0,
            parando: t.stopRequested,
          },
          passos,
        }}
      />
    </>
  );
}
