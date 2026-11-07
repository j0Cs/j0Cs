import { rotinaDiariaDeCobranca } from "@forja/billing";
import { getDb } from "@forja/db";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Rotina diária: suspende inadimplentes depois da carência e encerra testes grátis vencidos. */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado.", { status: 401 });
  }
  return Response.json(await rotinaDiariaDeCobranca(getDb()));
}
