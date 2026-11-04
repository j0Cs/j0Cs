import { and, eq, getDb, inArray, lt, or, schema } from "@forja/db";
import { cobrarAte, encerrarSessao, SEM_PULSO_SEGUNDOS } from "@/lib/voz";

export const runtime = "nodejs";

/**
 * Varredura a cada minuto (Vercel Cron, só em produção):
 * - "active" sem pulso há 30 s: cobra ATÉ AGORA (o provedor cobra até o desligamento) e desliga;
 *   quem fecha a aba normalmente avisa o servidor na hora (sendBeacon), então não cai aqui;
 * - "closing" (desligamento falhou antes): cobra até agora e tenta desligar de novo;
 * - "connecting" parada há mais de 2 min: reserva órfã, libera.
 * Cada sessão é tratada isoladamente: uma falha não trava as outras.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado.", { status: 401 });
  }
  const db = getDb();
  const agora = Date.now();
  const pendentes = await db
    .select()
    .from(schema.voiceSessions)
    .where(
      or(
        and(eq(schema.voiceSessions.status, "active"), lt(schema.voiceSessions.lastPulseAt, new Date(agora - SEM_PULSO_SEGUNDOS * 1000))),
        eq(schema.voiceSessions.status, "closing"),
        and(eq(schema.voiceSessions.status, "connecting"), lt(schema.voiceSessions.startedAt, new Date(agora - 120_000))),
      ),
    )
    .orderBy(schema.voiceSessions.lastPulseAt)
    .limit(200);

  let encerradas = 0;
  let falhas = 0;
  for (const s of pendentes) {
    try {
      if (s.status === "connecting") {
        await db.update(schema.voiceSessions).set({ status: "closed", endedAt: new Date(), endReason: "reserva-orfa" }).where(and(eq(schema.voiceSessions.id, s.id), inArray(schema.voiceSessions.status, ["connecting"])));
        continue;
      }
      await cobrarAte(db, s, new Date());
      if (await encerrarSessao(db, s, s.status === "closing" ? (s.endReason ?? "retentativa") : "sem-pulso")) encerradas++;
      else falhas++;
    } catch (err) {
      falhas++;
      console.error(JSON.stringify({ level: "error", msg: "varredura de voz falhou", sessao: s.id, err: String(err) }));
    }
  }
  return Response.json({ verificadas: pendentes.length, encerradas, falhas });
}
