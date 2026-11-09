import { diffDaTarefa } from "@forja/agent";
import { and, asc, eq, gt, schema, sql } from "@forja/db";
import { waitUntil } from "@vercel/functions";
import { githubApp, rodarTarefa } from "@/lib/agente";
import { getApiSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Andamento da tarefa para a tela ao vivo. Se a tarefa está executando e ninguém está com ela
 * (a função anterior acabou o tempo), retoma aqui: a tela aberta mantém a tarefa andando.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getApiSession();
  if (!s) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ erro: "Tarefa não encontrada." }, { status: 404 });
  const url = new URL(request.url);
  const desde = Number(url.searchParams.get("desde") ?? -1);

  const t = await s.db.query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.id, id), eq(schema.agentTasks.orgId, s.org.id)) });
  if (!t) return Response.json({ erro: "Tarefa não encontrada." }, { status: 404 });

  if (t.status === "executando" && !t.stopRequested && (!t.runnerUntil || t.runnerUntil < new Date())) {
    const gh = await githubApp();
    if (gh) waitUntil(rodarTarefa(s.db, gh, t.id));
  }

  const passos = await s.db
    .select({
      idx: schema.agentTaskSteps.idx,
      kind: schema.agentTaskSteps.kind,
      toolName: schema.agentTaskSteps.toolName,
      summary: schema.agentTaskSteps.summary,
      detail: schema.agentTaskSteps.detail,
      isError: schema.agentTaskSteps.isError,
      createdAt: schema.agentTaskSteps.createdAt,
    })
    .from(schema.agentTaskSteps)
    .where(and(eq(schema.agentTaskSteps.taskId, t.id), gt(schema.agentTaskSteps.idx, Number.isFinite(desde) ? desde : -1)))
    .orderBy(asc(schema.agentTaskSteps.idx))
    .limit(200);

  const comDiff = url.searchParams.get("diff") === "1" && ["aguardando_aprovacao", "abrindo_pr", "concluida", "parada"].includes(t.status);
  let diff: Awaited<ReturnType<typeof diffDaTarefa>> | null = null;
  if (comDiff) {
    const gh = await githubApp();
    if (gh) diff = await diffDaTarefa(s.db, gh, t).catch(() => null);
  }
  const [arquivos] = await s.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.agentTaskFiles)
    .where(eq(schema.agentTaskFiles.taskId, t.id));

  return Response.json({
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
    diff,
  });
}
