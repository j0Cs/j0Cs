/**
 * Teste de integração da operação (Sprint 4): Postgres local de verdade.
 * Câmbio pela PTAX (simulada), alertas de margem / chave / provedor / câmbio, conciliação com os
 * relatórios dos provedores (simulados), e-mail para a equipe e o alerta de teste.
 *
 *   pnpm --filter @forja/ops test:integracao
 *
 * Cria e apaga o banco forja_teste_operacao no MESMO servidor do DATABASE_URL, que precisa ser local.
 */
import { spawnSync } from "node:child_process";
import pg from "pg";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Defina DATABASE_URL (Postgres local).");
const u = new URL(base);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("O teste de integração só roda em Postgres local.");
const NOME = "forja_teste_operacao";
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${NOME} with (force)`);
await admin.query(`create database ${NOME}`);
await admin.end();
u.pathname = `/${NOME}`;
process.env.DATABASE_URL = u.toString();
process.env.DATABASE_URL_DIRECT = "";
process.env.ADMIN_URL = "http://localhost:3001";
process.env.NODE_ENV = "test";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"]) delete process.env[k];
process.env.ANTHROPIC_ADMIN_KEY = "sk-ant-admin-simulada";
process.env.ANTHROPIC_WORKSPACE_ID = "wrk_forja";
process.env.OPENAI_ADMIN_KEY = "sk-admin-simulada";
const { randomBytes } = await import("node:crypto");
const K1 = randomBytes(32).toString("base64");
const K2 = randomBytes(32).toString("base64");
process.env.ENCRYPTION_KEY = K1;
delete process.env.ENCRYPTION_KEY_2;

const mig = spawnSync("pnpm", ["--filter", "@forja/db", "migrate"], { env: process.env, encoding: "utf8" });
if (mig.status !== 0) throw new Error(`migração falhou:\n${mig.stdout}\n${mig.stderr}`);

const emails: string[] = [];
const logOriginal = console.log;
console.log = (...a: unknown[]) => {
  const t = a.map(String).join(" ");
  if (t.includes("[e-mail de desenvolvimento]")) emails.push(t);
  else logOriginal(...a);
};

const { createOrganizationForUser, eq, and, isNull, getDb, getPricingSettings, savePricingSettings, schema, closeDb } = await import("@forja/db");
const o = await import("../src/index");
const db = getDb();

let falhas = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  logOriginal(`${cond ? "✔" : "✘"} ${msg}${!cond && extra ? `  (${extra})` : ""}`);
  if (!cond) falhas++;
};
const abertos = async () => db.select().from(schema.ownerAlerts).where(isNull(schema.ownerAlerts.resolvedAt));
const US = 1_000_000;

// ---------------------------------------------------------------- preparação
const { DEFAULT_PLANS } = await import("@forja/core");
for (const p of DEFAULT_PLANS) await db.insert(schema.plans).values({ ...p, minSeats: p.minSeats ?? null }).onConflictDoNothing();
const [dona] = await db.insert(schema.users).values({ name: "Dona", email: "dona@forja.test", emailVerified: true, platformRole: "staff" }).returning();
const [cliente] = await db.insert(schema.users).values({ name: "Cliente", email: "cli@empresa.test", emailVerified: true }).returning();
const org = await createOrganizationForUser(db, { userId: cliente!.id, name: "Empresa Barata" });
const agora = new Date("2026-11-09T12:00:00Z");
const ontem = new Date("2026-11-08T15:00:00Z");
const d2 = new Date("2026-11-07T10:00:00Z");
const chaveRuim = "11111111-1111-4111-8111-111111111111";

const evento = (v: Partial<typeof schema.usageEvents.$inferInsert>) => ({
  orgId: org.id,
  modelId: "m",
  servedModelId: "m",
  providerId: "anthropic" as const,
  costUsdMicros: 0,
  chargeBrlMicros: 0,
  pricingSnapshot: {},
  status: "ok" as const,
  createdAt: ontem,
  ...v,
});
// 60 chamadas da OpenAI nas últimas 24 h, 6 com erro (10%) numa chave só (6 de 10 = 60%)
await db.insert(schema.usageEvents).values([
  ...Array.from({ length: 50 }, () => evento({ providerId: "openai" })),
  ...Array.from({ length: 4 }, () => evento({ providerId: "openai", providerKeyId: chaveRuim })),
  ...Array.from({ length: 6 }, () => evento({ providerId: "openai", providerKeyId: chaveRuim, status: "error", errorMessage: "401 invalid key" })),
]);
// margem negativa na semana: somando com D-2 abaixo, US$ 360 de custo (> R$ 2.000 efetivos) e R$ 1.390 cobrados
await db.insert(schema.usageEvents).values(evento({ costUsdMicros: 200 * US, chargeBrlMicros: 20 * US }));
// D-2: Anthropic US$ 100 registrados; OpenAI US$ 50
await db.insert(schema.usageEvents).values([
  evento({ createdAt: d2, costUsdMicros: 100 * US, chargeBrlMicros: 900 * US }),
  evento({ createdAt: d2, providerId: "openai", costUsdMicros: 50 * US, chargeBrlMicros: 450 * US }),
]);

// ---------------------------------------------------------------- 1. câmbio
const antes = (await getPricingSettings(db)).fxUsdBrl;
const ptax = async () => ({ rate: 5.4321, date: "2026-11-06 13:09:00.000" });
const r1 = await o.atualizarCambio(db, { folgaPercent: 4, buscar: ptax });
ok(r1.fx === 5.6494 && (await getPricingSettings(db)).fxUsdBrl === 5.6494, `câmbio = PTAX + 4% (${antes} → ${r1.fx})`);
const meta = await o.metaDoCambio(db);
ok(meta.ptax === 5.4321 && meta.folga === 4 && meta.dataPtax?.startsWith("2026-11-06") === true, "PTAX, folga e data gravadas");
await o.atualizarCambio(db, { buscar: ptax });
ok((await o.metaDoCambio(db)).folga === 4, "a rotina reaproveita a folga escolhida no painel");

// câmbio vencido abre alerta; voltou a atualizar, fecha sozinho
await db.update(schema.settings).set({ value: { ...meta, atualizadoEm: "2026-11-01T00:00:00Z" } }).where(eq(schema.settings.key, "fx_meta"));
await o.verificarAlertas(db, agora);
ok((await abertos()).some((a) => a.kind === "cambio"), "câmbio sem atualizar há mais de 3 dias abre alerta");
await db.update(schema.settings).set({ value: { ...meta, atualizadoEm: "2026-11-09T09:00:00Z" } }).where(eq(schema.settings.key, "fx_meta"));
await o.verificarAlertas(db, agora);
ok(!(await abertos()).some((a) => a.kind === "cambio"), "alerta do câmbio resolvido sozinho quando a PTAX atualiza");

// ---------------------------------------------------------------- 2. alertas
const todos = await abertos();
const provedor = todos.find((a) => a.dedupeKey === "provedor:openai");
ok(Boolean(provedor) && provedor!.title.includes("10"), `OpenAI com 10% de erro abre alerta (${provedor?.title})`);
const chave = todos.find((a) => a.dedupeKey === `chave:${chaveRuim}`);
ok(Boolean(chave) && chave!.detail.includes("401 invalid key"), "chave com 60% de erro abre alerta com o último erro");
ok(!todos.some((a) => a.dedupeKey === "provedor:anthropic"), "Anthropic sem erro não alerta");
const margem = todos.find((a) => a.kind === "margem");
ok(Boolean(margem) && margem!.title.includes("Empresa Barata"), "cliente com margem negativa abre alerta");
const qtd = todos.length;
await o.verificarAlertas(db, agora);
ok((await abertos()).length === qtd, "rodar de novo não duplica alertas abertos");

// ---------------------------------------------------------------- 3. conciliação (D-2)
const pedidos: string[] = [];
const relatorios = {
  anthropic: async (chave: string, dia: string, ws?: string | null) => {
    pedidos.push(`anthropic:${chave}:${dia}:${ws}`);
    return 101 * US; // 0,99%: bate
  },
  openai: async (chave: string, dia: string) => {
    pedidos.push(`openai:${chave}:${dia}`);
    return 60 * US; // registrado 50: 16,67% a menos
  },
};
const conc = await o.conciliarCustos(db, "2026-11-07", relatorios);
ok(pedidos.includes("anthropic:sk-ant-admin-simulada:2026-11-07:wrk_forja"), "relatório da Anthropic pedido com a chave de admin e o workspace");
ok(conc.find((c) => c.providerId === "anthropic")?.status === "ok", "Anthropic: diferença de 1% bate");
const oa = conc.find((c) => c.providerId === "openai");
ok(oa?.status === "divergente" && oa.diffPercent === 16.67, `OpenAI: 16,67% de diferença diverge (${oa?.diffPercent})`);
ok((await abertos()).some((a) => a.dedupeKey === "conciliacao:openai:2026-11-07"), "divergência abre alerta");
const linhas = await db.select().from(schema.costReconciliations);
ok(linhas.length === 2 && linhas.some((l) => l.providerId === "openai" && l.diffPercent === 1667 && l.reportedUsdMicros === 60 * US), "conciliação gravada por dia e provedor");
await o.conciliarCustos(db, "2026-11-07", { ...relatorios, openai: async () => 50 * US });
const depois = await db.select().from(schema.costReconciliations).where(eq(schema.costReconciliations.providerId, "openai"));
ok(depois.length === 1 && depois[0]!.status === "ok", "conciliar o mesmo dia de novo atualiza a linha");
await o.conciliarCustos(db, "2026-11-07", { ...relatorios, anthropic: async () => Promise.reject(new Error("Anthropic respondeu 401 no relatório de custo.")) });
ok((await abertos()).some((a) => a.dedupeKey === "conciliacao-erro:anthropic"), "relatório que falha vira aviso");

// ---------------------------------------------------------------- 4. e-mail para a equipe
emails.length = 0;
const enviados = await o.enviarAlertasPendentes(db);
ok(enviados === 1 && emails.length === 1 && emails[0]!.includes("dona@forja.test"), "um e-mail só, para a equipe (staff)");
ok(!emails.some((e) => e.includes("cli@empresa.test")), "cliente não recebe alerta do dono");
ok(emails[0]!.includes("http://localhost:3001/alertas"), "o e-mail leva aos alertas do painel");
ok((await abertos()).every((a) => a.notifiedAt), "alertas marcados como avisados");
emails.length = 0;
ok((await o.enviarAlertasPendentes(db)) === 0 && emails.length === 0, "sem alerta novo, sem e-mail");

// ---------------------------------------------------------------- 5. alerta de teste ("pronto quando")
const t = await o.enviarAlertaDeTeste(db, "dona@forja.test");
ok(t === 1 && emails.length === 1 && emails[0]!.includes("Alerta de teste"), "alerta de teste chega por e-mail à equipe");

// ---------------------------------------------------------------- 6. resolver e reabrir
await o.resolverAlerta(db, provedor!.id);
ok(!(await abertos()).some((a) => a.id === provedor!.id), "resolver fecha o alerta");
await o.verificarAlertas(db, agora);
ok((await abertos()).some((a) => a.dedupeKey === "provedor:openai" && a.id !== provedor!.id), "o problema continua: abre um alerta novo");

// ---------------------------------------------------------------- 7. rotina diária completa
await db.delete(schema.costReconciliations);
const rotina = await o.rotinaDiariaDeOperacao(db, agora, {
  buscarPtax: async () => ({ rate: 5.5, date: "2026-11-09 13:00:00.000" }),
  relatorios: { anthropic: async () => 100 * US, openai: async () => 50 * US },
});
ok("fx" in rotina.cambio && rotina.cambio.fx === 5.72, "rotina: câmbio atualizado (5,50 + 4%)");
ok(Array.isArray(rotina.conciliacoes) && rotina.conciliacoes.length === 2, "rotina: concilia D-2 dos dois provedores");
ok((await db.select().from(schema.costReconciliations)).every((l) => l.day === "2026-11-07"), "rotina: o dia conciliado é D-2");
const falhou = await o.rotinaDiariaDeOperacao(db, agora, { buscarPtax: async () => Promise.reject(new Error("PTAX respondeu 500")) , relatorios });
ok("erro" in falhou.cambio && falhou.cambio.erro.includes("500"), "PTAX fora do ar não derruba a rotina");
ok((await getPricingSettings(db)).fxUsdBrl === 5.72, "câmbio anterior mantido quando a PTAX falha");

// ---------------------------------------------------------------- 8. backup
ok((await abertos()).some((a) => a.dedupeKey === "backup:nao_configurado" && a.severity === "aviso"), "sem backup configurado: aviso ao dono");
const gravarBackup = async (v: Record<string, unknown>) =>
  db.insert(schema.settings).values({ key: "backup_meta", value: v }).onConflictDoUpdate({ target: schema.settings.key, set: { value: v } });
await gravarBackup({ em: "2026-11-09T06:50:00Z", ok: true, detalhe: "ok", tabelas: 28 });
await o.verificarAlertas(db, agora);
ok(!(await abertos()).some((a) => a.kind === "backup"), "backup em dia: o alerta fecha sozinho");
await gravarBackup({ em: "2026-11-07T06:50:00Z", ok: true, detalhe: "ok" });
await o.verificarAlertas(db, agora);
ok((await abertos()).some((a) => a.dedupeKey === "backup:atrasado" && a.severity === "critico"), "backup parado há mais de 36 h: alerta crítico");
await gravarBackup({ em: "2026-11-09T06:50:00Z", ok: false, detalhe: "A restauração de teste falhou.", execucao: "https://github.com/x/y/actions/runs/9" });
await o.verificarAlertas(db, agora);
const falhaBackup = (await abertos()).find((a) => a.dedupeKey === "backup:falhou");
ok(Boolean(falhaBackup?.detail.includes("restauração de teste falhou") && falhaBackup.detail.includes("actions/runs/9")), "backup que falhou: alerta com o motivo e o log");
await gravarBackup({ em: "2026-11-09T07:50:00Z", ok: true, detalhe: "ok" });
await o.verificarAlertas(db, agora);
ok(!(await abertos()).some((a) => a.kind === "backup"), "o próximo backup bom fecha os alertas de backup");

// ---------------------------------------------------------------- 9. rotação da chave de criptografia
const { encryptSecret, decryptSecret } = await import("@forja/core/server");
const [chaveApi] = await db
  .insert(schema.providerKeys)
  .values({ providerId: "anthropic", label: "principal", encryptedKey: encryptSecret("sk-ant-chave-real"), keyHint: "••••real" })
  .returning();
const [conector] = await db
  .insert(schema.connectors)
  .values({
    orgId: org.id,
    type: "supabase",
    name: "Supabase",
    encryptedCredentials: encryptSecret("sbp_token_do_cliente"),
    metadata: { projetosCriados: [{ ref: "abc", nome: "x", senhaDoBanco: encryptSecret("senha-do-banco") }], outro: 1 },
  })
  .returning();
const inv1 = await o.inventarioDeCifras(db);
ok(inv1.chaves_de_api["1"] === 1 && inv1.conectores["1"] === 1 && inv1.senhas_de_banco["1"] === 1, "inventário: tudo na chave 1");
process.env.ENCRYPTION_KEY_2 = K2;
const rec = await o.recifrarSegredos(db);
ok(rec.ativa === 2 && rec.recifrados === 3 && rec.falhas.length === 0, "recifrar: 3 segredos passam para a chave 2", JSON.stringify(rec));
const inv2 = await o.inventarioDeCifras(db);
ok(inv2.chaves_de_api["2"] === 1 && inv2.conectores["2"] === 1 && inv2.senhas_de_banco["2"] === 1 && !inv2.conectores["1"], "inventário: tudo na chave 2");
delete process.env.ENCRYPTION_KEY;
const ca = (await db.query.providerKeys.findFirst({ where: eq(schema.providerKeys.id, chaveApi!.id) }))!;
const cn = (await db.query.connectors.findFirst({ where: eq(schema.connectors.id, conector!.id) }))!;
const sb = (cn.metadata.projetosCriados as { senhaDoBanco: string }[])[0]!;
ok(
  decryptSecret(ca.encryptedKey) === "sk-ant-chave-real" && decryptSecret(cn.encryptedCredentials) === "sbp_token_do_cliente" && decryptSecret(sb.senhaDoBanco) === "senha-do-banco",
  "sem a chave antiga, tudo continua abrindo com a nova",
);
ok(cn.metadata.outro === 1, "o resto do metadata do conector fica intacto");
const rec2 = await o.recifrarSegredos(db);
ok(rec2.recifrados === 0 && rec2.jaNaAtiva === 3, "recifrar de novo não muda nada");
await db.insert(schema.providerKeys).values({ providerId: "openai", label: "quebrada", encryptedKey: "v1.aaaa.bbbb.cccc", keyHint: "••••" });
const rec3 = await o.recifrarSegredos(db);
ok(rec3.falhas.length === 1 && rec3.falhas[0]!.erro.includes("ENCRYPTION_KEY, que não está mais configurada"), "segredo que não abre: listado e deixado como estava");
process.env.ENCRYPTION_KEY = K1;
delete process.env.ENCRYPTION_KEY_2;

// ---------------------------------------------------------------- 10. acesso do backup ao banco
const acesso = await o.prepararAcessoDoBackup(db, process.env.DATABASE_URL);
ok(acesso.usuario === "forja_backup" && !acesso.url.includes("forja:"), "papel forja_backup criado; a URL usa o papel do backup");
const papel = new pg.Client({ connectionString: acesso.url });
await papel.connect();
const leu = await papel.query("select count(*)::int as n from organizations");
ok(leu.rows[0].n >= 1, "o backup lê as tabelas (com RLS ligada)");
await papel.query("insert into settings (key, value) values ('backup_meta', '{}'::jsonb) on conflict (key) do update set value = excluded.value");
ok(true, "o backup grava o próprio registro em settings");
const negado = await papel.query("update organizations set name = 'x'").then(() => "passou", (e: Error) => e.message);
ok(/permission denied/.test(negado), "o backup não altera outras tabelas", negado);
await papel.end();
const dump = spawnSync("pg_dump", ["--format=custom", "--schema=public", "--schema=drizzle", "--no-owner", "--no-privileges", "--no-sync", "--file=/dev/null", acesso.url], { encoding: "utf8" });
ok(dump.status === 0, "pg_dump completo com o papel do backup", dump.stderr.slice(0, 300));
const renovado = await o.prepararAcessoDoBackup(db, process.env.DATABASE_URL);
const velho = new pg.Client({ connectionString: acesso.url });
const entrouComAVelha = await velho.connect().then(() => true, () => false);
if (entrouComAVelha) await velho.end();
ok(!entrouComAVelha && renovado.url !== acesso.url, "gerar de novo troca a senha (a antiga para de funcionar)");
const comoSupabase = await o.prepararAcessoDoBackup(db, "postgresql://postgres.abcdefghijklmnopqrst:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres");
const us = new URL(comoSupabase.url);
ok(
  us.username === "forja_backup.abcdefghijklmnopqrst" && us.port === "5432" && us.hostname === "aws-0-us-east-1.pooler.supabase.com" && us.pathname === "/postgres",
  "Supabase: usuário com o ref do projeto e pooler em modo sessão (5432)",
  comoSupabase.url.replace(/:[^:@]+@/, ":***@"),
);

// limpa a configuração de preço do teste
await savePricingSettings(db, await getPricingSettings(db));
void and;
await closeDb();
console.log = logOriginal;
const fim = new pg.Client({ connectionString: base });
await fim.connect();
await fim.query(`drop database if exists ${NOME} with (force)`);
await fim.end();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
