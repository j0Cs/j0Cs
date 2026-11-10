import { atualizarPreview } from "@forja/agent";
import { and, eq, schema } from "@forja/db";
import { getApiSession } from "@/lib/session";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Andamento do preview e das migrações (a tela consulta enquanto o build roda na Vercel). */
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await getApiSession();
  if (!s) return Response.json({ erro: "Não autenticado." }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ erro: "Tarefa não encontrada." }, { status: 404 });
  const t0 = await s.db.query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.id, id), eq(schema.agentTasks.orgId, s.org.id)) });
  if (!t0) return Response.json({ erro: "Tarefa não encontrada." }, { status: 404 });
  const t = await atualizarPreview(s.db, t0);
  return Response.json({
    preview: { estado: t.previewState, url: t.previewUrl, erro: t.previewError },
    supabase: { ref: t.supabaseProjectRef, migracoes: t.migrations ?? [] },
  });
}
