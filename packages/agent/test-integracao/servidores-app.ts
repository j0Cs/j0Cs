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
import { iniciarGithubSimulado } from "./github-simulado";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
writeFileSync(process.env.CHAVE_SAIDA ?? "chave-github-teste.pem", privateKey.export({ type: "pkcs1", format: "pem" }));

await iniciarGithubSimulado({
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

const PAGINA =
  'export default function Contato() {\n  return (\n    <form action="/api/contato" method="post">\n      <input name="nome" required />\n      <input name="email" type="email" required />\n      <textarea name="mensagem" required />\n      <button>Enviar</button>\n    </form>\n  );\n}\n';
const roteiro: { texto?: string; ferramentas: { name: string; input: Record<string, unknown> }[] }[] = [
  { texto: "Plano:\n1. Ver a estrutura do projeto\n2. Criar a página de contato com formulário\n3. Colocar o link no menu", ferramentas: [{ name: "listar_arquivos", input: {} }] },
  { ferramentas: [{ name: "ler_arquivo", input: { caminho: "src/app/layout.tsx" } }] },
  {
    ferramentas: [
      { name: "escrever_arquivo", input: { caminho: "src/app/contato/page.tsx", conteudo: PAGINA } },
      { name: "editar_arquivo", input: { caminho: "src/app/layout.tsx", procurar: '<a href="/">Início</a>', substituir: '<a href="/">Início</a> <a href="/contato">Contato</a>' } },
    ],
  },
  { ferramentas: [{ name: "concluir", input: { titulo_pr: "Página de contato com formulário", resumo: "Cria /contato com nome, e-mail e mensagem e adiciona o link no menu." } }] },
];

const porta = Number(process.env.PORTA_MODELO ?? 12302);
createServer(async (req, res) => {
  let corpo = "";
  for await (const p of req) corpo += p;
  if (!req.url?.startsWith("/v1/messages")) {
    res.writeHead(404).end();
    return;
  }
  const j = JSON.parse(corpo || "{}") as { messages?: { role: string }[]; model?: string };
  const n = (j.messages ?? []).filter((m) => m.role === "assistant").length;
  const passo = roteiro[Math.min(n, roteiro.length - 1)]!;
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
