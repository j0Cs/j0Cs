import { and, eq, getDb, lt, schema } from "@forja/db";
import { cobrarAte, encerrarSessao, PULSO_SEGUNDOS } from "@/lib/voz";

export const runtime = "nodejs";

/**
 * Varredura a cada minuto (Vercel Cron): chamadas sem pulso há 60 s são cobradas até o
 * último pulso + um intervalo e encerradas no provedor (aba fechada, rede caiu, abuso).
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado.", { status: 401 });
  }
  const db = getDb();
  const limite = new Date(Date.now() - 60_000);
  const abandonadas = await db
    .select()
    .from(schema.voiceSessions)
    .where(and(eq(schema.voiceSessions.status, "active"), lt(schema.voiceSessions.lastPulseAt, limite)));

  for (const s of abandonadas) {
    await cobrarAte(db, s, new Date(s.lastPulseAt.getTime() + PULSO_SEGUNDOS * 1000));
    await encerrarSessao(db, s, "sem-pulso");
  }
  return Response.json({ encerradas: abandonadas.length });
}
