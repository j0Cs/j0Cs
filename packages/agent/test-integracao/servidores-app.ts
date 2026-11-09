/**
 * Sobe um GitHub simulado e um modelo Anthropic roteirizado (API real em formato, respostas fixas)
 * para testar o agente pelo app rodando (next start + navegador). Grava a chave privada do GitHub
 * App simulado em CHAVE_SAIDA para o app usar.
 *
 *   CHAVE_SAIDA=/caminho/chave.pem tsx test-integracao/servidores-app.ts
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { iniciarSupabaseSimulado, iniciarVercelSimulada } from "./entrega-simulada";
import { iniciarGithubSimulado } from "./github-simulado";

// Vercel e Supabase do "cliente" (Sprint 4). BANCO_DO_CLIENTE: um Postgres local vazio que faz o papel
// do banco do projeto no Supabase (as migrações do agente rodam nele de verdade).
await iniciarVercelSimulada(Number(process.env.PORTA_VERCEL ?? 12304));
if (process.env.BANCO_DO_CLIENTE) {
  await iniciarSupabaseSimulado(Number(process.env.PORTA_SUPABASE ?? 12305), { abcdefghijklmnopqrst: process.env.BANCO_DO_CLIENTE }, process.env.BANCO_DO_CLIENTE);
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(process.env.CHAVE_SAIDA ?? "chave-github-teste.pem", privateKey.export({ type: "pkcs1", format: "pem" }));

const gh$ = await iniciarGithubSimulado({
  porta: Number(process.env.PORTA_GITHUB ?? 12301),
  chavePublica: publicKey,
  appId: "777",
  installationId: 4242,
  repos: [
    {
      fullName: "cliente-teste/site",
      defaultBranch: "main",
      arquivos: {
        "package.json": '{ "name": "site", "dependencies": { "next": "16.0.0" } }\n',
        "src/app/layout.tsx":
          'export default function Layout({ children }) {\n  return (\n    <html lang="pt-BR">\n      <body>\n        <nav><a href="/">Início</a></nav>\n        {children}\n      </body>\n    </html>\n  );\n}\n',
        "src/app/page.tsx": "export default function Home() {\n  return <h1>Bem-vindo</h1>;\n}\n",
      },
    },
  ],
});

// Sprint 4b: repositório com um .env versionado, uma consulta insegura e um PR feito "pelo Claude Code do cliente"
const ARQ_APP: Record<string, string> = {
  "package.json": '{ "name": "loja", "dependencies": { "next": "16.0.0", "pg": "8.0.0" } }\n',
  "README.md": "# Loja\n\nLoja virtual da clínica.\n",
  "AGENTS.md": "# Regras do projeto\n\nUse pnpm.\n",
  ".env": "DATABASE_URL=postgres://u:senhaforte@db.exemplo.com/app\n",
  "src/app/page.tsx": "export default function Home() {\n  return <h1>Loja</h1>;\n}\n",
  "src/api/usuarios.ts": "export async function buscar(db, id) {\n  return db.query(`select * from usuarios where id = ${id}`);\n}\n",
};
gh$.repos.set("cliente-teste/loja", { fullName: "cliente-teste/loja", defaultBranch: "main", arquivos: ARQ_APP, sha: "shaloja0001" });
const BUSCA = "export async function porEmail(db, email) {\n  return db.query(`select * from usuarios where email = '${email}'`);\n}\n";
gh$.pulls.set("cliente-teste/loja#7", {
  numero: 7,
  titulo: "Busca de usuários por e-mail",
  corpo: "Feito com o Claude Code.",
  autor: "dev-cliente",
  headRef: "feature/busca",
  headSha: "shapr0007",
  headRepo: "cliente-teste/loja",
  baseRef: "main",
  baseSha: "shaloja0001",
  arquivos: { ...ARQ_APP, "src/api/busca.ts": BUSCA },
  alterados: [{ filename: "src/api/busca.ts", status: "added", additions: 3, deletions: 0, patch: `@@ -0,0 +1,3 @@\n${BUSCA.trimEnd().split("\n").map((l) => `+${l}`).join("\n")}` }],
});

const PAGINA =
  'export default function Contato() {\n  return (\n    <form action="/api/contato" method="post">\n      <input name="nome" required />\n      <input name="email" type="email" required />\n      <textarea name="mensagem" required />\n      <button>Enviar</button>\n    </form>\n  );\n}\n';
const roteiro: { texto?: string; ferramentas: { name: string; input: Record<string, unknown> }[] }[] = [
  { texto: "Plano:\n1. Ver a estrutura do projeto\n2. Criar a página de contato com formulário\n3. Colocar o link no menu", ferramentas: [{ name: "listar_arquivos", input: {} }] },
  { ferramentas: [{ name: "ler_arquivo", input: { caminho: "src/app/layout.tsx" } }] },
  {
    ferramentas: [
      { name: "escrever_arquivo", input: { caminho: "src/app/contato/page.tsx", conteudo: PAGINA } },
      { name: "editar_arquivo", input: { caminho: "src/app/layout.tsx", procurar: '<a href="/">Início</a>', substituir: '<a href="/">Início</a> <a href="/contato">Contato</a>' } },
      {
        name: "escrever_arquivo",
        input: {
          caminho: "supabase/migrations/20261109130000_cria_contatos.sql",
          conteudo:
            "create table public.contatos (\n  id bigint generated always as identity primary key,\n  nome text not null,\n  email text not null,\n  mensagem text not null,\n  criado_em timestamptz not null default now()\n);\nalter table public.contatos enable row level security;\ncreate policy \"qualquer um envia\" on public.contatos for insert with check (true);\n",
        },
      },
    ],
  },
  { ferramentas: [{ name: "concluir", input: { titulo_pr: "Página de contato com formulário", resumo: "Cria /contato com nome, e-mail e mensagem e adiciona o link no menu." } }] },
];

const roteiroAuditoria: typeof roteiro = [
  { texto: "Plano:\n1. Ler a API de usuários\n2. Conferir segredos e testes\n3. Parecer de cada papel", ferramentas: [{ name: "ler_arquivo", input: { caminho: "src/api/usuarios.ts" } }] },
  {
    ferramentas: [
      { name: "registrar_achado", input: { categoria: "seguranca", severidade: "critica", titulo: "Injeção de SQL na busca de usuário", detalhe: "O id da requisição entra direto no texto do SQL: `1 or 1=1` devolve todos os usuários.", arquivo: "src/api/usuarios.ts", linha: 2, recomendacao: "Use consulta parametrizada: db.query('select * from usuarios where id = $1', [id]).", persona: "seguranca_pleno" } },
      { name: "registrar_achado", input: { categoria: "qualidade", severidade: "media", titulo: "Nenhum teste na API", detalhe: "Não há testes para buscar(); uma regressão na consulta passaria despercebida.", arquivo: "src/api/usuarios.ts", recomendacao: "Crie um teste de integração com id válido, inexistente e malicioso.", persona: "qa_pleno" } },
      { name: "registrar_achado", input: { categoria: "estrutura", severidade: "baixa", titulo: "Acesso ao banco espalhado nas rotas", detalhe: "As rotas montam SQL direto; uma camada de dados facilita validação e testes.", arquivo: "src/api/usuarios.ts", recomendacao: "Centralize as consultas num módulo de dados.", persona: "dev_senior" } },
    ],
  },
  {
    ferramentas: [
      {
        name: "concluir_auditoria",
        input: {
          resumo: "Projeto pequeno e organizado, com um problema crítico: injeção de SQL na API de usuários e um .env com a senha do banco no repositório. Comece pela consulta parametrizada e pela troca da senha.",
          notas: { seguranca: 2, estrutura: 7, qualidade: 4, desempenho: 8, economia: 9 },
          pareceres: [
            { persona: "dev_senior", parecer: "Estrutura simples (Next.js + pg). Próximo passo: uma camada de dados e testes de integração no CI." },
            { persona: "dev_pleno", parecer: "Código curto e legível; trocar o SQL montado por parâmetros resolve o principal." },
            { persona: "qa_pleno", parecer: "Sem testes. Prioridade: casos de id inválido e malicioso na busca." },
            { persona: "seguranca_pleno", parecer: "Crítico: injeção de SQL em buscar() e senha do banco versionada no .env. Troque a senha hoje." },
          ],
        },
      },
    ],
  },
];
const roteiroRevisao: typeof roteiro = [
  {
    texto: "Plano: revisar a consulta nova e os testes",
    ferramentas: [
      { name: "ler_arquivo", input: { caminho: "src/api/busca.ts" } },
      { name: "registrar_achado", input: { categoria: "seguranca", severidade: "alta", titulo: "E-mail interpolado no SQL", detalhe: "Um e-mail como `x' or '1'='1` devolve todos os usuários.", arquivo: "src/api/busca.ts", linha: 2, recomendacao: "Use parâmetros: where email = $1.", persona: "seguranca_pleno" } },
      { name: "registrar_achado", input: { categoria: "qualidade", severidade: "media", titulo: "Sem teste para e-mail vazio ou com maiúsculas", detalhe: "A busca não normaliza o e-mail e não há teste.", arquivo: "src/api/busca.ts", linha: 1, recomendacao: "Normalize com lower(trim()) e cubra vazio, maiúsculas e inexistente.", persona: "qa_pleno" } },
    ],
  },
  {
    ferramentas: [
      {
        name: "concluir_auditoria",
        input: {
          resumo: "A busca por e-mail funciona no caminho feliz, mas abre uma injeção de SQL. Corrija a consulta e adicione os testes antes do merge.",
          pareceres: [
            { persona: "qa_pleno", parecer: "Faltam testes de e-mail vazio, com maiúsculas e inexistente." },
            { persona: "seguranca_pleno", parecer: "Injeção de SQL na consulta nova: bloqueia o merge." },
          ],
          veredito: "nao_seguir",
        },
      },
    ],
  },
];

const porta = Number(process.env.PORTA_MODELO ?? 12302);
createServer(async (req, res) => {
  let corpo = "";
  for await (const p of req) corpo += p;
  // Admin API da Anthropic (conector de gasto): organização e relatório de custo
  if (req.url?.startsWith("/v1/organizations/me")) {
    res.writeHead(req.headers["x-api-key"] === "sk-ant-admin01-teste" ? 200 : 401, { "content-type": "application/json" }).end(JSON.stringify({ id: "org_1", name: "Clínica (API)" }));
    return;
  }
  if (req.url?.startsWith("/v1/organizations/cost_report")) {
    const hoje = Date.now();
    const data = Array.from({ length: 14 }, (_, i) => ({
      starting_at: new Date(hoje - (13 - i) * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z",
      results: [{ currency: "USD", amount: String(800 + ((i * 337) % 900)) }],
    }));
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data, has_more: false }));
    return;
  }
  if (!req.url?.startsWith("/v1/messages")) {
    res.writeHead(404).end();
    return;
  }
  const j = JSON.parse(corpo || "{}") as { messages?: { role: string }[]; model?: string; system?: string | { text?: string }[] };
  const n = (j.messages ?? []).filter((m) => m.role === "assistant").length;
  const sistema = typeof j.system === "string" ? j.system : (j.system ?? []).map((b) => b.text ?? "").join("\n");
  const qual = sistema.includes("revisando um pull request") ? roteiroRevisao : sistema.includes("auditor técnico") ? roteiroAuditoria : roteiro;
  const passo = qual[Math.min(n, qual.length - 1)]!;
  // um passo leva ~1,2 s, para a tela ao vivo mostrar o andamento
  await new Promise((r) => setTimeout(r, 1200));
  res.writeHead(200, { "content-type": "application/json", "request-id": `req_${n}` });
  res.end(
    JSON.stringify({
      id: `msg_${n}`,
      type: "message",
      role: "assistant",
      model: j.model ?? "claude-sonnet-5-5",
      content: [
        ...(passo.texto ? [{ type: "text", text: passo.texto }] : []),
        ...passo.ferramentas.map((f, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: f.name, input: f.input })),
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 3000, output_tokens: 600, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0 },
    }),
  );
}).listen(porta, "127.0.0.1");
console.log(`GitHub simulado em :${process.env.PORTA_GITHUB ?? 12301}, modelo em :${porta}`);
