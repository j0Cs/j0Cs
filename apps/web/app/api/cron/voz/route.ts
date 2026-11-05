import { getDb } from "@forja/db";
import { varrerSessoes } from "@/lib/voz";

export const runtime = "nodejs";

export const maxDuration = 300;
/** Para de pegar sessões novas perto do limite da função (a próxima varredura continua). */
const ORCAMENTO_MS = 240_000;

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
  return Response.json(await varrerSessoes(getDb(), { limite: 200, orcamentoMs: ORCAMENTO_MS }));
}
