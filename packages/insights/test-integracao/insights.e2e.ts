/**
 * Teste de integração dos assistentes de IA: Postgres local de verdade. Lote OTLP (JSON e protobuf,
 * gerados pelo serializador oficial) → fonte pelo token → uso gravado sem repetir → resumo e
 * recomendações → revogação → limpeza de 180 dias → gasto das chaves de administração com cache.
 *
 *   pnpm --filter @forja/insights test:integracao
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { JsonLogsSerializer, ProtobufLogsSerializer } from "@opentelemetry/otlp-transformer";
import pg from "pg";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Defina DATABASE_URL (Postgres local).");
const u = new URL(base);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("O teste de integração só roda em Postgres local.");
const NOME = "forja_teste_insights";
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${NOME} with (force)`);
await admin.query(`create database ${NOME}`);
await admin.end();
u.pathname = `/${NOME}`;
process.env.DATABASE_URL = u.toString();
process.env.DATABASE_URL_DIRECT = "";
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
const mig = spawnSync("pnpm", ["--filter", "@forja/db", "migrate"], { env: process.env, encoding: "utf8" });
if (mig.status !== 0) throw new Error(`migração falhou:\n${mig.stdout}\n${mig.stderr}`);

const { createOrganizationForUser, eq, getDb, schema, closeDb } = await import("@forja/db");
const { encryptSecret } = await import("@forja/core/server");
const i = await import("../src/index");
const db = getDb();

let falhas = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log(`${cond ? "✔" : "✘"} ${msg}${!cond && extra ? `  (${extra})` : ""}`);
  if (!cond) falhas++;
};

const { DEFAULT_PLANS } = await import("@forja/core");
for (const p of DEFAULT_PLANS) await db.insert(schema.plans).values({ ...p, minSeats: p.minSeats ?? null }).onConflictDoNothing();
const [dono] = await db.insert(schema.users).values({ name: "Ana", email: "ana@cliente.test", emailVerified: true }).returning();
const org = await createOrganizationForUser(db, { userId: dono!.id, name: "Cliente" });
const [outro] = await db.insert(schema.users).values({ name: "Bia", email: "bia@outra.test", emailVerified: true }).returning();
const orgB = await createOrganizationForUser(db, { userId: outro!.id, name: "Outra" });

function registro(nome: string, atributos: Record<string, string | number>, quando: number) {
  return {
    hrTime: [Math.floor(quando / 1000), (quando % 1000) * 1e6] as [number, number],
    hrTimeObserved: [Math.floor(quando / 1000), (quando % 1000) * 1e6] as [number, number],
    severityNumber: 9,
    severityText: "INFO",
    body: nome,
    eventName: undefined,
    resource: { attributes: { "service.name": "claude-code", "session.id": "s1", "user.email": "ana@cliente.test" }, asyncAttributesPending: false, merge: () => undefined } as never,
    instrumentationScope: { name: "com.anthropic.claude_code", version: "1" },
    attributes: { "event.name": nome, ...atributos },
    droppedAttributesCount: 0,
  };
}

// ---------------------------------------------------------------- Claude Code (JSON)
const { fonte, token } = await i.criarFonte(db, { orgId: org.id, userId: dono!.id, tool: "claude_code", label: "Notebook da Ana" });
ok(token.startsWith("fj_otlp_") && fonte.tokenHash !== token && fonte.tokenHint === token.slice(-4), "token mostrado uma vez; no banco só o hash");
ok((await i.fonteDoToken(db, token))?.id === fonte.id && (await i.fonteDoToken(db, `${token}x`)) === null && (await i.fonteDoToken(db, "qualquer")) === null, "token certo acha a fonte; errado não");

const agora = Date.now();
const pedidos = Array.from({ length: 30 }, (_, n) =>
  registro("api_request", { model: n < 25 ? "claude-opus-5-5" : "claude-sonnet-5-5", input_tokens: 4_000, output_tokens: 800, cache_read_tokens: 30_000, cache_creation_tokens: 90_000, cost_usd: 0.5, request_id: `req_${n}` }, agora - n * 60_000),
);
const lote = Buffer.from(JsonLogsSerializer.serializeRequest([...pedidos, registro("user_prompt", { prompt_length: 10 }, agora)] as never) ?? new Uint8Array());
const r1 = await i.ingerir(db, fonte, i.lerLogs(lote, "application/json"), agora);
ok(r1.recebidos === 31 && r1.requisicoes === 30 && r1.gravados === 30, "lote JSON: só os pedidos ao modelo entram", JSON.stringify(r1));
const r2 = await i.ingerir(db, fonte, i.lerLogs(lote, "application/json"), agora);
ok(r2.gravados === 0, "o mesmo lote de novo (nova tentativa do exportador) não conta duas vezes");

// ---------------------------------------------------------------- Grok Build (protobuf)
const { fonte: fGrok } = await i.criarFonte(db, { orgId: org.id, userId: dono!.id, tool: "grok_build" });
const pb = Buffer.from(ProtobufLogsSerializer.serializeRequest([registro("grok_code.api_request", { model: "grok-5", input_tokens: 10_000, cache_read_tokens: 8_000, output_tokens: 500, request_id: "g1" }, agora)] as never) ?? new Uint8Array());
const r3 = await i.ingerir(db, fGrok, i.lerLogs(pb, "application/x-protobuf"), agora);
const [uGrok] = await db.select().from(schema.aiUsageEvents).where(eq(schema.aiUsageEvents.sourceId, fGrok.id));
ok(r3.gravados === 1 && Number(uGrok!.inputTokens) === 2_000 && Number(uGrok!.cacheReadTokens) === 8_000, "protobuf do Grok: cache separado da entrada");

// ---------------------------------------------------------------- resumo e recomendações
const resumo = await i.resumoDeUso(db, org.id, 30);
const cc = resumo.usos.filter((x) => x.tool === "claude_code");
ok(cc.reduce((s, x) => s + x.requisicoes, 0) === 30 && cc.reduce((s, x) => s + x.costUsdMicros, 0) === 15_000_000, "resumo por ferramenta e modelo, com o custo informado");
ok(resumo.porPessoa.some((p) => p.actor === "ana@cliente.test"), "uso por pessoa (e-mail da conta da ferramenta)");
ok(resumo.recomendacoes.some((x) => /cache/i.test(x.titulo)), "pouco cache (30 mil lidos para 94 mil enviados): recomendação de cache", resumo.recomendacoes.map((x) => x.titulo).join(" | "));
ok((await i.resumoDeUso(db, orgB.id, 30)).usos.length === 0, "outra organização não vê esse uso");

// ---------------------------------------------------------------- revogação e limpeza
await i.revogarFonte(db, orgB.id, fonte.id);
ok((await i.fonteDoToken(db, token)) !== null, "outra organização não revoga a fonte");
await i.revogarFonte(db, org.id, fonte.id);
ok((await i.fonteDoToken(db, token)) === null, "fonte revogada: o token para de valer");
await db.update(schema.aiUsageEvents).set({ occurredAt: new Date(agora - 200 * 86_400_000) }).where(eq(schema.aiUsageEvents.sourceId, fGrok.id));
const apagados = await i.limparUsoAntigo(db, new Date(agora));
ok(apagados === 1, "limpeza diária apaga o que passou de 180 dias", String(apagados));

// ---------------------------------------------------------------- gasto real com chave de administração
await db.insert(schema.connectors).values({ orgId: org.id, type: "anthropic_admin", name: "Anthropic · Minha org", encryptedCredentials: encryptSecret("sk-ant-admin01-teste"), metadata: {} });
let chamadas = 0;
const f = (async (url: string | URL) => {
  chamadas++;
  if (!String(url).includes("cost_report")) return new Response("{}", { status: 404 });
  const dia = new Date(agora).toISOString().slice(0, 10);
  return new Response(JSON.stringify({ data: [{ starting_at: `${dia}T00:00:00Z`, results: [{ currency: "USD", amount: "2500" }] }], has_more: false }), { status: 200 });
}) as typeof fetch;
const g1 = await i.gastoDasApis(db, org.id, { f, agora: new Date(agora) });
ok(g1.length === 1 && g1[0]!.totalUsdMicros === 25_000_000 && g1[0]!.erro === null, "gasto lido do relatório de custo (US$ 25)");
await i.gastoDasApis(db, org.id, { f, agora: new Date(agora + 10 * 60_000) });
ok(chamadas === 1, "dentro de uma hora usa o valor guardado (não consulta de novo)");
const falha = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
const g3 = await i.gastoDasApis(db, org.id, { f: falha, agora: new Date(agora + 2 * 3_600_000) });
ok(Boolean(g3[0]!.erro?.includes("recusada")) && g3[0]!.totalUsdMicros === 25_000_000, "chave recusada: mostra o erro e mantém o último valor");
ok((await i.gastoDasApis(db, orgB.id, { f })).length === 0, "outra organização não vê o gasto");

console.log(`\n${falhas ? `✘ ${falhas} falha(s)` : "✔ tudo certo"}`);
await closeDb();
const limpar = new pg.Client({ connectionString: base });
await limpar.connect();
await limpar.query(`drop database if exists ${NOME} with (force)`);
await limpar.end();
process.exit(falhas ? 1 : 0);
