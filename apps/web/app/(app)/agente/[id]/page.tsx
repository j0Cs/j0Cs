import { conectorDaOrg, hashDasMigracoes, migracoesDaTarefa, supabaseDaOrg } from "@forja/agent";
import { and, asc, eq, schema, sql } from "@forja/db";
import { buttonClass, PageHeader } from "@forja/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canManage, getSession } from "@/lib/session";
import { Entrega } from "./entrega";
import { TarefaAoVivo } from "./tarefa-ao-vivo";

export const metadata = { title: "Tarefa do agente" };
// aprovar (abrir o PR) roda nesta página
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, org, role } = await getSession();
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

  // entrega (depois do PR): preview na Vercel e migrações no Supabase
  let entrega: Parameters<typeof Entrega>[0] | null = null;
  if (t.prUrl) {
    const [vercel, migracoes, supabase] = await Promise.all([conectorDaOrg(db, org.id, "vercel"), migracoesDaTarefa(db, t.id), supabaseDaOrg(db, org.id)]);
    let projetos: Parameters<typeof Entrega>[0]["projetos"] = null;
    let erroProjetos: string | null = null;
    if (supabase && migracoes.length && canManage(role)) {
      try {
        projetos = await supabase.api.projetos();
      } catch (e) {
        erroProjetos = `Não consegui listar os projetos do Supabase: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    entrega = {
      taskId: t.id,
      preview: { estado: t.previewState, url: t.previewUrl, erro: t.previewError },
      vercelConectada: Boolean(vercel),
      migracoes: migracoes.map((m) => ({ path: m.path, sql: m.sql, bloqueio: m.bloqueio, avisos: m.avisos })),
      hash: hashDasMigracoes(migracoes),
      supabaseConectado: Boolean(supabase),
      projetos,
      erroProjetos,
      supabaseRef: t.supabaseProjectRef,
      resultados: t.migrations ?? [],
      podeGerenciar: canManage(role),
    };
  }

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
      tipo: t.kind,
      relatorio: t.kind === "auditoria" || t.kind === "revisao" ? t.report : null,
      baseSha: t.baseSha,
          },
          passos,
        }}
      />
      {entrega ? (
        <div className="mt-6">
          <Entrega {...entrega} />
        </div>
      ) : null}
    </>
  );
}
