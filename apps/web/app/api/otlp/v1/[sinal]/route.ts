import { consumeRateLimit, getDb } from "@forja/db";
import { corpoDoLote, ErroOtlp, fonteDoToken, ingerir, lerLogs, LIMITE_DO_LOTE } from "@forja/insights";

export const runtime = "nodejs";

/**
 * Recebe a telemetria (OTLP/HTTP) do Claude Code, Codex, Gemini CLI e Grok Build de cada cliente.
 * Autenticação: o token de envio da fonte (Authorization: Bearer fj_otlp_…). Só os logs viram uso;
 * métricas e traces são aceitos e descartados, para não contar duas vezes.
 */
function resposta(contentType: string | null, status = 200, erro?: string) {
  const json = (contentType ?? "").includes("json");
  if (status !== 200) return new Response(erro ?? "", { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  return json
    ? Response.json({})
    : new Response(new Uint8Array(), { status: 200, headers: { "content-type": "application/x-protobuf" } });
}

export async function POST(request: Request, ctx: { params: Promise<{ sinal: string }> }) {
  const { sinal } = await ctx.params;
  if (!["logs", "metrics", "traces"].includes(sinal)) return new Response("Não encontrado.", { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  const token = (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : request.headers.get("x-forja-token") ?? "").trim();
  const tipo = request.headers.get("content-type");
  if (!token) return resposta(tipo, 401, "Token de envio ausente.");
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_DO_LOTE) return resposta(tipo, 413, "Lote grande demais.");

  const db = getDb();
  const fonte = await fonteDoToken(db, token);
  if (!fonte) return resposta(tipo, 401, "Token de envio inválido ou revogado.");
  if (!(await consumeRateLimit(db, `otlp:${fonte.id}`, 3_600, 3_600))) return resposta(tipo, 429, "Muitos envios. Tente mais tarde.");
  if (sinal !== "logs") return resposta(tipo);

  try {
    const corpo = corpoDoLote(Buffer.from(await request.arrayBuffer()), request.headers.get("content-encoding"));
    const registros = lerLogs(corpo, tipo);
    if (registros.length > 20_000) return resposta(tipo, 413, "Registros demais no lote.");
    await ingerir(db, fonte, registros);
    return resposta(tipo);
  } catch (e) {
    if (e instanceof ErroOtlp) return resposta(tipo, 400, e.message);
    console.error(JSON.stringify({ level: "error", msg: "otlp falhou", fonte: fonte.id, err: String(e) }));
    return resposta(tipo, 500, "Erro ao gravar.");
  }
}
