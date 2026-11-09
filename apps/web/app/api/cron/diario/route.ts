import { rotinaDiariaDeCobranca } from "@forja/billing";
import { getDb } from "@forja/db";
import { limparUsoAntigo } from "@forja/insights";
import { rotinaDiariaDeOperacao } from "@forja/ops";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Rotina diária (o Hobby da Vercel aceita só crons diários e poucos por projeto):
 * - cobrança: suspende inadimplentes depois da carência e encerra testes grátis vencidos;
 * - operação: câmbio pela PTAX, conciliação de custos (D-2), alertas e e-mail para a equipe.
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new Response("Não autorizado.", { status: 401 });
  }
  const db = getDb();
  const cobranca = await rotinaDiariaDeCobranca(db).catch((e) => ({ erro: String(e) }));
  const operacao = await rotinaDiariaDeOperacao(db).catch((e) => ({ erro: String(e) }));
  // uso dos assistentes de IA: guardado por 180 dias
  const assistentes = await limparUsoAntigo(db)
    .then((apagados) => ({ apagados }))
    .catch((e) => ({ erro: String(e) }));
  return Response.json({ cobranca, operacao, assistentes });
}
