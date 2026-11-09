/**
 * Teste de integração do agente: Postgres local de verdade + GitHub simulado (confere o JWT do app)
 * + modelo roteirizado no lugar do provedor. Cobre o "Pronto quando" da Sprint 3:
 * "adicione uma página de contato com formulário" vira um PR, com o custo mostrado e abaixo do teto;
 * e também teto, parar, simultâneas, saldo reservado, teto diário, trava de execução, repositório
 * vazio, repositório sem acesso, modelo sem ferramentas e a verificação da instalação.
 *
 *   pnpm --filter @forja/agent test:integracao
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { iniciarSupabaseSimulado, iniciarVercelSimulada } from "./entrega-simulada";
import { iniciarGithubSimulado } from "./github-simulado";

const base = process.env.DATABASE_URL;
if (!base) throw new Error("Defina DATABASE_URL (Postgres local).");
const u = new URL(base);
if (!["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("O teste de integração só roda em Postgres local.");
const NOME = "forja_teste_agente";
const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${NOME} with (force)`);
await admin.query(`create database ${NOME}`);
// bancos "do cliente" no Supabase simulado (um por projeto)
const BANCOS_DO_CLIENTE = ["forja_teste_cliente_a", "forja_teste_cliente_b"];
for (const b of BANCOS_DO_CLIENTE) {
  await admin.query(`drop database if exists ${b} with (force)`);
  await admin.query(`create database ${b}`);
}
await admin.end();
const urlDoBanco = (nome: string) => Object.assign(new URL(base), { pathname: `/${nome}` }).toString();
u.pathname = `/${NOME}`;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const INSTALACAO = 4242;
const gh$ = await iniciarGithubSimulado({
  porta: 12301,
  chavePublica: publicKey,
  appId: "777",
  installationId: INSTALACAO,
  repos: [
    {
      fullName: "cliente-teste/site",
      defaultBranch: "main",
      arquivos: {
        "package.json": '{ "name": "site", "dependencies": { "next": "16.0.0" } }\n',
        "src/app/layout.tsx": 'export default function Layout({ children }) {\n  return (\n    <html lang="pt-BR">\n      <body>\n        <nav><a href="/">Início</a></nav>\n        {children}\n      </body>\n    </html>\n  );\n}\n',
        "src/app/page.tsx": "export default function Home() {\n  return <h1>Bem-vindo</h1>;\n}\n",
      },
    },
    { fullName: "cliente-teste/vazio", defaultBranch: "main", arquivos: null },
  ],
});

process.env.DATABASE_URL = u.toString();
process.env.DATABASE_URL_DIRECT = "";
process.env.NODE_ENV = "test";
process.env.ANTHROPIC_API_KEY = "sk-ant-teste"; // chave de desenvolvimento (o modelo é roteirizado)
process.env.BETTER_AUTH_SECRET = "segredo-de-teste";
process.env.GITHUB_APP_ID = "777";
process.env.GITHUB_APP_SLUG = "forja-agentes-teste";
process.env.GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: "pkcs1", format: "pem" }).toString().replace(/\n/g, "\\n");
process.env.GITHUB_APP_CLIENT_ID = "Iv1.teste";
process.env.GITHUB_APP_CLIENT_SECRET = "segredo-oauth";
process.env.GITHUB_API_BASE = gh$.url;
const vercel$ = await iniciarVercelSimulada(12302);
const REF_A = "abcdefghijklmnopqrst";
const supabase$ = await iniciarSupabaseSimulado(12303, { [REF_A]: urlDoBanco(BANCOS_DO_CLIENTE[0]!) }, urlDoBanco(BANCOS_DO_CLIENTE[1]!));
process.env.VERCEL_API_BASE = vercel$.url;
process.env.SUPABASE_API_BASE = supabase$.url;
process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.GITHUB_WEB_BASE = gh$.url;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

const mig = spawnSync("pnpm", ["--filter", "@forja/db", "migrate"], { env: process.env, encoding: "utf8" });
if (mig.status !== 0) throw new Error(`migração falhou:\n${mig.stdout}\n${mig.stderr}`);

const { DEFAULT_MODELS, DEFAULT_PLANS } = await import("@forja/core");
const db_ = await import("@forja/db");
const { createOrganizationForUser, eq, getDb, schema, closeDb, sql } = db_;
const a = await import("../src/index");
const db = getDb();

let falhas = 0;
const ok = (cond: boolean, msg: string, extra = "") => {
  console.log(`${cond ? "✔" : "✘"} ${msg}${!cond && extra ? `  (${extra})` : ""}`);
  if (!cond) falhas++;
};
const espera = async (fn: () => Promise<unknown>, regex: RegExp) => {
  try {
    await fn();
    return "sem erro";
  } catch (e) {
    return regex.test((e as Error).message) ? "ok" : (e as Error).message;
  }
};

// ---------------------------------------------------------------- preparação
for (const p of DEFAULT_PLANS) await db.insert(schema.plans).values({ ...p, minSeats: p.minSeats ?? null }).onConflictDoNothing();
for (const m of DEFAULT_MODELS) await db.insert(schema.models).values(m as never).onConflictDoNothing();
const [dono] = await db.insert(schema.users).values({ name: "Ana", email: "ana@cliente.test", emailVerified: true }).returning();
const org0 = await createOrganizationForUser(db, { userId: dono!.id, name: "Cliente Teste" });
await db.update(schema.organizations).set({ planId: "pro", creditBalanceBrlMicros: 30_000_000 }).where(eq(schema.organizations.id, org0.id));
const lerOrg = async () => (await db.query.organizations.findFirst({ where: eq(schema.organizations.id, org0.id) }))!;
const lerTarefa = async (id: string) => (await db.query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, id) }))!;

const gh = (await a.githubApp())!;
ok(Boolean(gh), "GitHub App montado a partir dos segredos");

// ---------------------------------------------------------------- instalação (prova de acesso da pessoa)
const tokenPessoa = await gh.trocarCodigo("codigo-bom");
const visiveis = await gh.instalacoesDoUsuario(tokenPessoa);
ok(visiveis.includes(INSTALACAO), "OAuth: a pessoa enxerga a instalação");
ok((await espera(() => gh.trocarCodigo("codigo-ruim"), /recusou|bad code/i)) === "ok", "código OAuth inválido é recusado");
const info = await a.registrarInstalacao(db, gh, { orgId: org0.id, userId: dono!.id, installationId: INSTALACAO });
ok(info.login === "cliente-teste", "instalação ligada à organização (JWT do app conferido pelo GitHub)");
ok((await gh.repositorios(INSTALACAO)).length === 2, "lista os repositórios liberados");

// ---------------------------------------------------------------- modelo roteirizado
type Chamada = { name: string; input: Record<string, unknown> };
const roteiro = (passos: { texto?: string; chamadas: Chamada[] }[], ganchos: { aoPasso?: (n: number) => Promise<void> } = {}) => ({
  anthropic: {
    id: "anthropic" as const,
    stream: async function* () {},
    async complete(req: { messages: { role: string }[] }) {
      const n = req.messages.filter((m) => m.role === "assistant").length;
      await ganchos.aoPasso?.(n);
      const passo = passos[Math.min(n, passos.length - 1)]!;
      return {
        message: {
          role: "assistant" as const,
          text: passo.texto ?? "",
          toolCalls: passo.chamadas.map((c, i) => ({ id: `t${n}-${i}`, name: c.name, input: c.input })),
        },
        servedModel: "claude-sonnet-5-5",
        stopReason: passo.chamadas.length ? "tool_use" : "end_turn",
        refused: false,
        // ~ R$ 0,05 por passo com os preços do catálogo
        usageByModel: [{ model: "claude-sonnet-5-5", usage: { inputTokens: 3_000, cacheReadTokens: 6_000, cacheWriteTokens: 0, outputTokens: 600 } }],
      };
    },
  },
});

const PAGINA = `export default function Contato() {\n  return (\n    <form action="/api/contato" method="post">\n      <input name="nome" required />\n      <input name="email" type="email" required />\n      <textarea name="mensagem" required />\n      <button>Enviar</button>\n    </form>\n  );\n}\n`;
const roteiroContato = [
  { texto: "Plano:\n1. Ver a estrutura do projeto\n2. Criar a página de contato com formulário\n3. Colocar o link no menu", chamadas: [{ name: "listar_arquivos", input: {} }] },
  { chamadas: [{ name: "ler_arquivo", input: { caminho: "src/app/layout.tsx" } }] },
  {
    chamadas: [
      { name: "escrever_arquivo", input: { caminho: "src/app/contato/page.tsx", conteudo: PAGINA } },
      { name: "editar_arquivo", input: { caminho: "src/app/layout.tsx", procurar: '<a href="/">Início</a>', substituir: '<a href="/">Início</a> <a href="/contato">Contato</a>' } },
      { name: "escrever_arquivo", input: { caminho: "../fora.txt", conteudo: "tentativa de sair do repositório" } },
    ],
  },
  { chamadas: [{ name: "concluir", input: { titulo_pr: "Página de contato com formulário", resumo: "Cria /contato com nome, e-mail e mensagem e adiciona o link no menu." } }] },
];

// ---------------------------------------------------------------- 1. caminho feliz: pedido → PR
const { tarefa: t1 } = await a.criarTarefa(db, gh, {
  org: await lerOrg(),
  userId: dono!.id,
  repoFullName: "cliente-teste/site",
  pedido: "Adicione uma página de contato com formulário",
  modelId: "claude-sonnet-5-5",
  tetoBrlMicros: 20_000_000,
});
ok(t1.status === "executando" && t1.baseSha !== null && t1.budgetBrlMicros === 20_000_000, "tarefa criada no commit atual da main, teto R$ 20");
const r1 = await a.executarTarefa(db, gh, t1.id, { deps: { adapters: roteiro(roteiroContato) as never } });
let t = await lerTarefa(t1.id);
ok(r1 === "fim" && t.status === "aguardando_aprovacao", "agente concluiu e espera aprovação", `${r1} ${t.status}`);
ok(Boolean(t.plan?.startsWith("Plano:")), "plano registrado");
ok(t.stepCount === 4 && t.prTitle === "Página de contato com formulário", "4 passos e título do PR");
const passos = await db.select().from(schema.agentTaskSteps).where(eq(schema.agentTaskSteps.taskId, t1.id));
ok(passos.some((p) => p.toolName === "escrever_arquivo" && p.isError), "escrever fora do repositório foi recusado (passo com erro)");
const usos = await db.select().from(schema.usageEvents).where(eq(schema.usageEvents.agentTaskId, t1.id));
const somaUsos = usos.reduce((s, x) => s + x.chargeBrlMicros, 0);
ok(usos.length === 4 && somaUsos === t.spentBrlMicros && t.spentBrlMicros > 0, "cada passo medido e cobrado; custo da tarefa = soma dos usos", `${usos.length} ${somaUsos} ${t.spentBrlMicros}`);
ok(t.spentBrlMicros < t.budgetBrlMicros, `custo ${(t.spentBrlMicros / 1e6).toFixed(2)} abaixo do teto`);
ok((await lerOrg()).creditBalanceBrlMicros === 30_000_000 - t.spentBrlMicros, "saldo da organização debitado pelo mesmo valor");
const diff = await a.diffDaTarefa(db, gh, t);
ok(
  diff.length === 2 && diff[0]!.path === "src/app/contato/page.tsx" && diff[0]!.tipo === "novo" && diff[1]!.tipo === "alterado" && diff[1]!.patch.includes('+        <nav><a href="/">Início</a> <a href="/contato">Contato</a></nav>'),
  "diff: página nova + menu alterado (e nada fora do repositório)",
);
const pr = await a.aprovarTarefa(db, gh, org0.id, t1.id);
t = await lerTarefa(t1.id);
const arvore = [...gh$.arvores.values()].at(-1)!;
ok(t.status === "concluida" && t.prUrl === "https://github.com/cliente-teste/site/pull/1", "aprovado: PR aberto", t.status);
ok(arvore.base === `arvore-de-${t1.baseSha}` && arvore.entradas.length === 2 && arvore.entradas.some((e) => e.path === "src/app/contato/page.tsx" && e.content === PAGINA), "commit com as 2 mudanças sobre o commit de partida");
ok(gh$.prs[0]!.base === "main" && gh$.prs[0]!.head === pr.branch && pr.branch.startsWith("forja/pagina-de-contato"), "PR da branch forja/... para a main");
ok(gh$.prs[0]!.body.includes("Custo da tarefa"), "descrição do PR traz o resumo e o custo");
ok((await espera(() => a.aprovarTarefa(db, gh, org0.id, t1.id), /já foi aberto/)) === "ok", "aprovar de novo não abre outro PR");

// ---------------------------------------------------------------- 2. parar (antes e durante)
const { tarefa: t2 } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Troque o título da home para Olá", modelId: "claude-sonnet-5-5" });
await a.pararTarefa(db, org0.id, t2.id);
ok((await lerTarefa(t2.id)).status === "parada", "parar antes de começar: parada na hora");
const { tarefa: t3 } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Troque o título da home para Olá", modelId: "claude-sonnet-5-5" });
const r3 = await a.executarTarefa(db, gh, t3.id, {
  deps: {
    adapters: roteiro(
      [
        { texto: "Plano: editar a home", chamadas: [{ name: "editar_arquivo", input: { caminho: "src/app/page.tsx", procurar: "Bem-vindo", substituir: "Olá" } }] },
        { chamadas: [{ name: "listar_arquivos", input: {} }] },
      ],
      { aoPasso: async (n) => (n === 1 ? a.pararTarefa(db, org0.id, t3.id) : undefined) },
    ) as never,
  },
});
t = await lerTarefa(t3.id);
ok(r3 === "fim" && t.status === "aguardando_aprovacao" && t.stopReason === "Parada por você.", "parar no meio: o que já foi feito fica para aprovar", `${t.status} ${t.stopReason}`);
await a.descartarTarefa(db, org0.id, t3.id);
ok((await lerTarefa(t3.id)).status === "descartada", "descartar: nada vai para o GitHub");

// ---------------------------------------------------------------- 3. teto da tarefa
const { tarefa: t4 } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Crie dez páginas novas para o site", modelId: "claude-sonnet-5-5", tetoBrlMicros: 1_000_000 });
const caro = roteiro([{ chamadas: [{ name: "listar_arquivos", input: {} }] }]);
const completarBarato = caro.anthropic.complete.bind(caro.anthropic);
caro.anthropic.complete = async (req) => {
  const r = await completarBarato(req);
  // passo caro (~R$ 0,60): o teto de R$ 1 estoura no 2º passo
  r.usageByModel = [{ model: "claude-sonnet-5-5", usage: { inputTokens: 40_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 8_000 } }];
  return r;
};
const r4 = await a.executarTarefa(db, gh, t4.id, { deps: { adapters: caro as never } });
t = await lerTarefa(t4.id);
ok(r4 === "fim" && t.status === "parada" && t.stopReason === "Teto de gasto atingido." && t.spentBrlMicros >= t.budgetBrlMicros, "teto atingido: o agente para sozinho", `${t.status} ${t.stopReason} ${t.spentBrlMicros}`);
ok(t.spentBrlMicros < t.budgetBrlMicros + 600_000, "passa do teto no máximo pelo último passo");

// ---------------------------------------------------------------- 4. simultâneas, saldo reservado e teto diário
await db.update(schema.organizations).set({ creditBalanceBrlMicros: 30_000_000 }).where(eq(schema.organizations.id, org0.id));
const { tarefa: a1 } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Tarefa paralela número um", modelId: "claude-sonnet-5-5", tetoBrlMicros: 20_000_000 });
const { tarefa: a2, tetoLimitado } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Tarefa paralela número dois", modelId: "claude-sonnet-5-5", tetoBrlMicros: 20_000_000 });
ok(a1.budgetBrlMicros === 20_000_000 && a2.budgetBrlMicros === 10_000_000 && tetoLimitado, "saldo reservado: a 2ª tarefa só pega o saldo livre (R$ 10)");
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Tarefa paralela número três", modelId: "claude-sonnet-5-5" }), /2 tarefas em andamento/)) === "ok",
  "no máximo 2 tarefas ao mesmo tempo",
);
// trava: dois executores na mesma tarefa
const [x, y] = await Promise.all([
  a.executarTarefa(db, gh, a1.id, { deps: { adapters: roteiro(roteiroContato) as never } }),
  a.executarTarefa(db, gh, a1.id, { deps: { adapters: roteiro(roteiroContato) as never } }),
]);
ok([x, y].sort().join(",") === "fim,ocupada", "um executor por vez (o outro recebe 'ocupada')", `${x},${y}`);
// orçamento de tempo: para e retoma
const r5 = await a.executarTarefa(db, gh, a2.id, { orcamentoMs: -1, deps: { adapters: roteiro(roteiroContato) as never } });
const t5 = await lerTarefa(a2.id);
ok(r5 === "continuar" && t5.status === "executando" && t5.runnerUntil === null, "fim do tempo da função: devolve 'continuar' e solta a trava");
ok((await a.executarTarefa(db, gh, a2.id, { deps: { adapters: roteiro(roteiroContato) as never } })) === "fim", "a próxima execução retoma e termina");
await db.update(schema.organizations).set({ agentDailyCapBrlMicros: 200_000 }).where(eq(schema.organizations.id, org0.id));
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Mais uma tarefa hoje", modelId: "claude-sonnet-5-5" }), /teto diário/)) === "ok",
  "teto diário atingido: nova tarefa recusada",
);
await db.update(schema.organizations).set({ agentDailyCapBrlMicros: 100_000_000 }).where(eq(schema.organizations.id, org0.id));

// ---------------------------------------------------------------- 5. repositório vazio, sem acesso e modelo sem ferramentas
const { tarefa: tv } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/vazio", pedido: "Crie a primeira página do projeto", modelId: "claude-sonnet-5-5" });
ok(tv.baseSha === null, "repositório vazio aceito (sem commit de partida)");
await a.executarTarefa(db, gh, tv.id, {
  deps: {
    adapters: roteiro([
      { texto: "Plano: criar a home", chamadas: [{ name: "escrever_arquivo", input: { caminho: "index.html", conteudo: "<h1>Oi</h1>\n" } }] },
      { chamadas: [{ name: "concluir", input: { titulo_pr: "Primeira página", resumo: "Cria index.html" } }] },
    ]) as never,
  },
});
const prVazio = await a.aprovarTarefa(db, gh, org0.id, tv.id);
ok(prVazio.url.endsWith("/pull/2") && gh$.repos.get("cliente-teste/vazio")!.sha !== null, "repositório vazio: cria o README de partida e abre o PR");
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "outra-empresa/segredo", pedido: "Leia os segredos da outra empresa", modelId: "claude-sonnet-5-5" }), /não tem acesso/)) === "ok",
  "repositório fora da instalação: recusado",
);
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Tarefa com o Gemini", modelId: "gemini-3.8-flash" }), /Claude, GPT ou Grok/)) === "ok",
  "modelo sem ferramentas: recusado na criação com mensagem clara",
);

// ---------------------------------------------------------------- 7. entrega: conversa → tarefa → PR → preview → migrações
const { encryptSecret, decryptSecret } = await import("@forja/core/server");
const [projetoChat] = await db.insert(schema.projects).values({ orgId: org0.id, name: "Lista de tarefas", repoFullName: "cliente-teste/site" } as never).returning();
const [conversa] = await db
  .insert(schema.conversations)
  .values({ orgId: org0.id, projectId: projetoChat!.id, title: "Lista de tarefas com banco", modelId: "claude-sonnet-5-5", createdBy: dono!.id })
  .returning();
await db.insert(schema.messages).values([
  { conversationId: conversa!.id, role: "user", content: "Quero uma página com a lista de tarefas, salvando no banco." },
  { conversationId: conversa!.id, role: "assistant", content: "Combinado: tabela tarefas (titulo, feita) com RLS e uma página /tarefas." },
]);
const mensagens = async () =>
  (await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversa!.id)).orderBy(schema.messages.createdAt)).map((m) => m.content);

const doChat = await a.pedidoDaConversa(db, org0.id, conversa!.id);
ok(Boolean(doChat?.pedido.includes("lista de tarefas, salvando no banco") && doChat.pedido.includes("Combinado: tabela tarefas")), "pedido montado a partir da conversa");
ok(doChat?.projeto?.repoFullName === "cliente-teste/site", "o repositório do projeto vem sugerido");
ok((await a.pedidoDaConversa(db, "00000000-0000-4000-8000-000000000000", conversa!.id)) === null, "conversa de outra organização não é lida");
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: doChat!.pedido, modelId: "claude-sonnet-5-5", conversationId: "00000000-0000-4000-8000-000000000000" }), /Conversa não encontrada/)) === "ok",
  "conversa inexistente: recusada",
);
const { tarefa: tc } = await a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: doChat!.pedido, modelId: "claude-sonnet-5-5", conversationId: conversa!.id });
ok(tc.conversationId === conversa!.id && tc.projectId === projetoChat!.id, "tarefa ligada à conversa e ao projeto");
ok((await mensagens()).some((m) => m.includes("Mandei para o agente") && m.includes(`/agente/${tc.id}`)), "a conversa recebe o link da tarefa");

const MIG1 = "create table public.tarefas (id bigint generated always as identity primary key, titulo text not null, feita boolean not null default false);\nalter table public.tarefas enable row level security;\ncreate policy \"leitura\" on public.tarefas for select using (true);\n";
const MIG2 = "create index tarefas_feita_idx on public.tarefas (feita);\ncreate table public.etiquetas (id bigint generated always as identity primary key, nome text not null);\nalter table public.etiquetas enable row level security;\n";
await a.executarTarefa(db, gh, tc.id, {
  deps: {
    adapters: roteiro([
      {
        texto: "Plano:\n1. Migração da tabela\n2. Página",
        chamadas: [
          { name: "escrever_arquivo", input: { caminho: "supabase/migrations/20261109120000_cria_tarefas.sql", conteudo: MIG1 } },
          { name: "escrever_arquivo", input: { caminho: "supabase/migrations/20261109120100_indice_e_etiquetas.sql", conteudo: MIG2 } },
          { name: "escrever_arquivo", input: { caminho: "src/app/tarefas/page.tsx", conteudo: "export default function Tarefas() {\n  return <h1>Tarefas</h1>;\n}\n" } },
        ],
      },
      { chamadas: [{ name: "concluir", input: { titulo_pr: "Lista de tarefas", resumo: "Tabela tarefas com RLS e página /tarefas." } }] },
    ]) as never,
  },
});
await a.aprovarTarefa(db, gh, org0.id, tc.id);
let te = await lerTarefa(tc.id);
ok(te.prUrl !== null && (await mensagens()).some((m) => m.includes("Pull request aberto") && m.includes(te.prUrl!)), "PR aberto e o link aparece na conversa");

// Vercel
ok((await espera(() => a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }), /Conecte a Vercel/)) === "ok", "sem Vercel conectada: pede para conectar");
await db.insert(schema.connectors).values({ orgId: org0.id, type: "vercel", name: "Vercel · cliente", encryptedCredentials: encryptSecret("vercel-token-bom"), metadata: {} });
ok(
  (await espera(() => a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: false }), /Peça a um dono ou administrador/)) === "ok" && vercel$.estado.projetos.length === 0,
  "membro comum não cria projeto novo na conta da Vercel",
);
// preview automático e um clique ao mesmo tempo: só um publica
const corrida = await Promise.allSettled([
  a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }),
  a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }),
]);
const ganhou = corrida.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<{ deploymentId: string }> | undefined;
const perdeu = corrida.find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
ok(Boolean(ganhou) && /já está sendo publicado/.test(String(perdeu?.reason?.message)), "duas publicações ao mesmo tempo: só uma passa");
const r7 = ganhou!.value;
te = await lerTarefa(tc.id);
const projetoVercel = vercel$.estado.projetos[0];
const dep1 = vercel$.estado.deployments.get(r7.deploymentId)!;
ok(vercel$.estado.projetos.length === 1 && projetoVercel!.name === "site" && projetoVercel!.link.repo === "site" && projetoVercel!.framework === "nextjs", "projeto criado na Vercel a partir do repositório (Next.js detectado)");
ok(
  JSON.stringify(dep1.corpo.gitSource) === JSON.stringify({ type: "github", org: "cliente-teste", repo: "site", ref: te.branch }) && !("target" in dep1.corpo),
  "deployment de preview da branch do PR (sem target de produção)",
);
ok(vercel$.estado.semTime === 0 && te.vercelProjectId === projetoVercel!.id && te.previewState === "QUEUED", "todas as chamadas no time padrão da conta; preview na fila");
ok((await espera(() => a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }), /já está sendo publicado/)) === "ok", "não publica duas vezes ao mesmo tempo");
te = await a.atualizarPreview(db, te);
ok(te.previewState === "BUILDING" && !(await mensagens()).some((m) => m.includes("Preview publicado")), "build em andamento: ainda sem aviso na conversa");
te = await a.atualizarPreview(db, te);
const avisos = (await mensagens()).filter((m) => m.includes("Preview publicado"));
ok(te.previewState === "READY" && te.previewUrl === `https://${dep1.url}`, "preview pronto com o endereço da Vercel");
ok(avisos.length === 1 && avisos[0]!.includes(`https://${dep1.url}`) && avisos[0]!.includes(te.prUrl!), "link do preview na conversa, junto com o do PR");
await a.atualizarPreview(db, te);
await a.atualizarPreviewsDaConversa(db, org0.id, conversa!.id);
ok((await mensagens()).filter((m) => m.includes("Preview publicado")).length === 1, "o aviso não se repete");

await a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true });
ok(vercel$.estado.projetos.length === 1 && vercel$.estado.deployments.size === 2, "publicar de novo reaproveita o projeto");
vercel$.estado.falharBuild = true;
await a.atualizarPreviewsDaConversa(db, org0.id, conversa!.id);
await a.atualizarPreviewsDaConversa(db, org0.id, conversa!.id);
te = await lerTarefa(tc.id);
ok(te.previewState === "ERROR" && Boolean(te.previewError?.includes("exited with 1")), "build com erro: motivo e log guardados", te.previewError ?? "");
ok((await mensagens()).some((m) => m.includes("não saiu na Vercel")), "a conversa fica sabendo do erro");
vercel$.estado.falharBuild = false;

vercel$.estado.projetos.length = 0;
vercel$.estado.semAcesso.add("cliente-teste/site");
await db.update(schema.agentTasks).set({ vercelProjectId: null }).where(eq(schema.agentTasks.id, tc.id));
ok((await espera(() => a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }), /instale o app do GitHub/)) === "ok", "Vercel sem acesso ao repositório: diz o que fazer");
te = await lerTarefa(tc.id);
ok(te.previewState === "ERROR" && Boolean(te.previewError?.includes("Settings → Git")), "o motivo fica na tarefa");
vercel$.estado.semAcesso.clear();
vercel$.estado.token = "outro";
ok((await espera(() => a.publicarPreview(db, gh, org0.id, tc.id, { podeCriarProjeto: true }), /recusou o token/)) === "ok", "token da Vercel inválido: pede um novo");
vercel$.estado.token = "vercel-token-bom";

// Supabase
const migs = await a.migracoesDaTarefa(db, tc.id);
const HASH = a.hashDasMigracoes(migs);
const em = (ref: string, confirmacao = "Projeto abcd") => ({ ref, hash: HASH, confirmacao });
ok(migs.every((m) => m.bloqueio === null), "migrações do PR sem bloqueio");
ok(migs[0]!.avisos.some((x) => x.includes("libera para todos")), "política using (true) vira aviso para quem confirma");
ok(migs.length === 2 && migs[0]!.versao === "20261109120000" && migs[0]!.nome === "cria_tarefas" && migs[1]!.versao === "20261109120100", "migrações do PR em ordem, com a versão do nome do arquivo");
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, em(REF_A)), /Conecte o Supabase/)) === "ok", "sem Supabase conectado: pede para conectar");
const [conectorSb] = await db.insert(schema.connectors).values({ orgId: org0.id, type: "supabase", name: "Supabase", encryptedCredentials: encryptSecret("sbp_bom"), metadata: {} }).returning();
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, em("outroprojetoxyzxyzxy")), /não aparece/)) === "ok", "projeto que não é do cliente: recusado");
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tv.id, em(REF_A)), /não tem migrações/)) === "ok", "tarefa sem migrações: recusada");
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, { ...em(REF_A), hash: "0".repeat(64) }), /mudaram desde que a tela abriu/)) === "ok", "SQL diferente do que a tela mostrou: recusado");
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, em(REF_A, "projeto errado")), /digite o nome do projeto/)) === "ok", "sem digitar o nome do projeto: recusado");
ok(supabase$.estado.consultas.length === 0, "nada rodou no banco do cliente antes da confirmação certa");
const res1 = await a.aplicarMigracoes(db, org0.id, tc.id, em(REF_A));
ok(res1.length === 2 && res1.every((r) => r.ok && !r.erro), "as 2 migrações aplicadas no projeto escolhido");
const clienteA = new pg.Client({ connectionString: urlDoBanco(BANCOS_DO_CLIENTE[0]!) });
await clienteA.connect();
const rls = await clienteA.query("select relrowsecurity from pg_class where relname = 'tarefas'");
const hist = await clienteA.query("select version, name from supabase_migrations.schema_migrations order by version");
ok(rls.rows[0]?.relrowsecurity === true, "tabela criada no banco do cliente, com RLS");
ok(hist.rows.map((r) => `${r.version}:${r.name}`).join(",") === "20261109120000:cria_tarefas,20261109120100:indice_e_etiquetas", "histórico do Supabase CLI gravado (db push não repete)");
await clienteA.end();
te = await lerTarefa(tc.id);
ok(te.supabaseProjectRef === REF_A && (te.migrations ?? []).length === 2, "resultado guardado na tarefa");
ok((await mensagens()).some((m) => m.includes("Banco atualizado no Supabase") && m.includes("2 migração")), "a conversa fica sabendo");
const res2 = await a.aplicarMigracoes(db, org0.id, tc.id, em(REF_A));
ok(res2.every((r) => r.ok && r.erro === "já estava aplicada"), "aplicar de novo não repete nada");

const novo = await a.criarProjetoSupabase(db, org0.id, { nome: "Tarefas (teste)", taskId: tc.id });
const criacao = supabase$.estado.criacoes.at(-1)!;
ok(novo.status === "COMING_UP" && JSON.stringify(criacao.region_selection) === JSON.stringify({ type: "specific", code: "sa-east-1" }), "projeto novo criado em São Paulo");
const conectorDepois = (await db.query.connectors.findFirst({ where: eq(schema.connectors.id, conectorSb!.id) }))!;
const criado = (conectorDepois.metadata.projetosCriados as { ref: string; senhaDoBanco: string }[])[0]!;
ok(
  criado.ref === novo.ref && decryptSecret(criado.senhaDoBanco) === supabase$.estado.senhas.get(novo.ref) && !JSON.stringify(conectorDepois.metadata).includes(supabase$.estado.senhas.get(novo.ref)!),
  "senha do banco gerada pela Forja e guardada só criptografada",
);
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, em(novo.ref, "Tarefas (teste)")), /ainda não está pronto/)) === "ok", "projeto iniciando: pede para esperar");
supabase$.estado.projetos.find((p) => p.ref === novo.ref)!.status = "ACTIVE_HEALTHY";
// no banco B já existe uma tabela "etiquetas": a 2ª migração falha no meio
const clienteB = new pg.Client({ connectionString: urlDoBanco(BANCOS_DO_CLIENTE[1]!) });
await clienteB.connect();
await clienteB.query("create table public.etiquetas (id int)");
const res3 = await a.aplicarMigracoes(db, org0.id, tc.id, em(novo.ref, "Tarefas (teste)"));
const indice = await clienteB.query("select 1 from pg_indexes where indexname = 'tarefas_feita_idx'");
const histB = await clienteB.query("select version from supabase_migrations.schema_migrations");
await clienteB.end();
ok(res3[0]!.ok && !res3[1]!.ok && Boolean(res3[1]!.erro?.includes("already exists")), "migração que falha: para e mostra o erro do banco", JSON.stringify(res3));
ok(indice.rowCount === 0 && histB.rows.length === 1, "a migração que falhou não deixou nada pela metade (transação) nem entrou no histórico");
ok((await mensagens()).some((m) => m.includes("Migração falhou no Supabase") && m.includes("1 migração(ões) antes dela")), "a conversa fica sabendo da falha");
supabase$.estado.token = "outro";
ok((await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, em(REF_A)), /recusou o token/)) === "ok", "token do Supabase inválido: pede um novo");
supabase$.estado.token = "sbp_bom";
await db.insert(schema.agentTaskFiles).values({ taskId: tc.id, path: "supabase/migrations/sem_data.sql", content: "insert into public.tarefas (titulo) values ('x');" });
const migs2 = await a.migracoesDaTarefa(db, tc.id);
const antesDaSemData = supabase$.estado.consultas.length;
ok(
  (await espera(() => a.aplicarMigracoes(db, org0.id, tc.id, { ref: REF_A, hash: a.hashDasMigracoes(migs2), confirmacao: "Projeto abcd" }), /precisa começar com data e hora/)) === "ok" &&
    supabase$.estado.consultas.length === antesDaSemData,
  "migração sem data no nome: bloqueada (não seria reaplicável com segurança)",
);

// ---------------------------------------------------------------- 6. bloqueio da organização
await db.update(schema.organizations).set({ planId: null }).where(eq(schema.organizations.id, org0.id));
ok(
  (await espera(async () => a.criarTarefa(db, gh, { org: await lerOrg(), userId: dono!.id, repoFullName: "cliente-teste/site", pedido: "Sem plano não pode", modelId: "claude-sonnet-5-5" }), /sem plano ativo/)) === "ok",
  "organização sem plano: agente bloqueado",
);

console.log(`\n${falhas ? `✘ ${falhas} falha(s)` : "✔ tudo certo"}`);
await closeDb();
await gh$.fechar();
await vercel$.fechar();
await supabase$.fechar();
const limpar = new pg.Client({ connectionString: base });
await limpar.connect();
await limpar.query(`drop database if exists ${NOME} with (force)`);
for (const b of BANCOS_DO_CLIENTE) await limpar.query(`drop database if exists ${b} with (force)`);
await limpar.end();
void sql;
process.exit(falhas ? 1 : 0);
