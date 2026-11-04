import { and, eq, getDb, inArray, lt, or, schema, sql } from "@forja/db";
import { cobrarAte, encerrarSessao, SEM_PULSO_SEGUNDOS } from "@/lib/voz";

export const runtime = "nodejs";

export const maxDuration = 300;
/** Para de pegar sessões novas perto do limite da função (a próxima varredura continua). */
const ORCAMENTO_MS = 240_000;
/** Sem pulso: cobra no máximo até o último pulso + este tempo (30 s sem pulso + 1 min de cron). */
const TETO_SEM_PULSO_SEGUNDOS = SEM_PULSO_SEGUNDOS + 60;

/**
 * Varredura a cada minuto (Vercel Cron, só em produção):
 * - "active" sem pulso há 30 s: cobra até o último pulso + 90 s, no máximo (um atraso da varredura
 *   não vira cobrança) e desliga; quem fecha a aba normalmente avisa o servidor na hora (sendBeacon);
 * - "connecting" parada há mais de 2 min: reserva órfã, libera;
 * - "closing" (desligamento não confirmado): tenta de novo, sem cobrar nada além do ended_at.
 * Abandonadas primeiro, retentativas depois; cada sessão isolada (uma falha não trava as outras).
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
    // abandonadas antes das retentativas: retentativas antigas não podem ocupar o lote inteiro
    .orderBy(sql`case ${schema.voiceSessions.status} when 'active' then 0 when 'connecting' then 1 else 2 end`, schema.voiceSessions.lastPulseAt)
    .limit(200);

  let encerradas = 0;
  let falhas = 0;
  let adiadas = 0;
  for (const s of pendentes) {
    if (Date.now() - agora > ORCAMENTO_MS) {
      adiadas++;
      continue;
    }
    try {
      if (s.status === "connecting") {
        await db.update(schema.voiceSessions).set({ status: "closed", endedAt: new Date(), endReason: "reserva-orfa" }).where(and(eq(schema.voiceSessions.id, s.id), inArray(schema.voiceSessions.status, ["connecting"])));
        continue;
      }
      let ok: boolean;
      if (s.status === "active") {
        const ate = new Date(Math.min(Date.now(), s.lastPulseAt.getTime() + TETO_SEM_PULSO_SEGUNDOS * 1000));
        await cobrarAte(db, s, ate);
        ok = await encerrarSessao(db, s, "sem-pulso", ate);
      } else {
        await cobrarAte(db, s, new Date()); // limitado ao ended_at gravado quando o fim foi pedido
        ok = await encerrarSessao(db, s, s.endReason ?? "retentativa");
      }
      if (ok) encerradas++;
      else falhas++;
    } catch (err) {
      falhas++;
      console.error(JSON.stringify({ level: "error", msg: "varredura de voz falhou", sessao: s.id, err: String(err) }));
    }
  }
  return Response.json({ verificadas: pendentes.length, encerradas, falhas, adiadas });
}
