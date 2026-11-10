/**
 * Repositório do projeto: liga um repositório do GitHub (pelo app Forja Agentes) a um projeto e guarda
 * a estrutura lida (linguagens, stack, árvore, README), para o chat, a call e a auditoria.
 */
import { and, eq, schema, type Db } from "@forja/db";
import { lerEstrutura, type EstruturaDoRepositorio } from "./estrutura";
import { ErroGithub, type GithubApp } from "./github";
import { arquivosDoTime, FERRAMENTAS_DO_TIME, mesclarBloco, ORDEM_DAS_PERSONAS, PERSONAS, type FerramentaDoTime } from "./personas";
import { instalacaoDaOrg, RegraDoAgente } from "./tarefas";

const NOME_DE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function conectarRepositorio(db: Db, gh: GithubApp, p: { orgId: string; projectId: string; repoFullName: string }) {
  const projeto = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, p.projectId), eq(schema.projects.orgId, p.orgId)) });
  if (!projeto) throw new RegraDoAgente("Projeto não encontrado.");
  if (!NOME_DE_REPO.test(p.repoFullName)) throw new RegraDoAgente("Escolha um repositório da lista.");
  const instalacao = await instalacaoDaOrg(db, p.orgId);
  if (!instalacao) throw new RegraDoAgente("Conecte o GitHub em Agente antes de escolher o repositório.");

  let estrutura: EstruturaDoRepositorio;
  try {
    estrutura = await lerEstrutura(gh, instalacao.installationId, p.repoFullName);
  } catch (e) {
    if (e instanceof ErroGithub && (e.status === 404 || e.status === 403)) {
      throw new RegraDoAgente("O app Forja Agentes não tem acesso a esse repositório. Libere o acesso no GitHub e tente de novo.");
    }
    if (e instanceof ErroGithub && e.status === 413) throw new RegraDoAgente(e.message);
    throw new RegraDoAgente("Não consegui ler o repositório no GitHub agora. Tente de novo em instantes.");
  }
  await db
    .update(schema.projects)
    .set({ repoFullName: estrutura.repo, repoSnapshot: estrutura as unknown as Record<string, unknown>, repoSnapshotAt: new Date() })
    .where(eq(schema.projects.id, projeto.id));
  return estrutura;
}

export async function desconectarRepositorio(db: Db, p: { orgId: string; projectId: string }) {
  await db
    .update(schema.projects)
    .set({ repoFullName: null, repoSnapshot: null, repoSnapshotAt: null })
    .where(and(eq(schema.projects.id, p.projectId), eq(schema.projects.orgId, p.orgId)));
}

/** Resumo curto da estrutura para o contexto do chat e da call (economiza tokens: nada de árvore inteira). */
export function resumoDaEstrutura(e: EstruturaDoRepositorio) {
  const partes = [
    `Repositório ${e.repo} (branch ${e.branch}): ${e.arquivos} arquivos.`,
    e.linguagens.length ? `Linguagens: ${e.linguagens.map((l) => l.nome).join(", ")}.` : "",
    e.stack.length ? `Stack: ${e.stack.join(", ")}.` : "",
    Object.keys(e.scripts).length ? `Scripts: ${Object.keys(e.scripts).join(", ")}.` : "",
    `Pastas principais: ${e.arvore.filter((n) => n.tipo === "pasta" && !n.caminho.includes("/")).map((n) => n.caminho).join(", ") || "—"}.`,
  ];
  return partes.filter(Boolean).join(" ");
}

/**
 * Abre um PR no repositório com os arquivos do time da Forja para as ferramentas escolhidas (Claude
 * Code, Codex, Gemini CLI, Grok Build). AGENTS.md e GEMINI.md existentes são preservados: só o bloco
 * do time é incluído ou trocado.
 */
export async function instalarTimeNoRepositorio(db: Db, gh: GithubApp, p: { orgId: string; repoFullName: string; ferramentas: FerramentaDoTime[] }) {
  if (!NOME_DE_REPO.test(p.repoFullName)) throw new RegraDoAgente("Repositório inválido.");
  const ferramentas = p.ferramentas.filter((f) => Object.hasOwn(FERRAMENTAS_DO_TIME, f));
  if (!ferramentas.length) throw new RegraDoAgente("Escolha pelo menos uma ferramenta.");
  const instalacao = await instalacaoDaOrg(db, p.orgId);
  if (!instalacao) throw new RegraDoAgente("Conecte o GitHub em Agente antes de instalar o time.");
  try {
    const repo = await gh.repo(instalacao.installationId, p.repoFullName);
    const baseSha = await gh.shaDaBranch(instalacao.installationId, repo.fullName, repo.defaultBranch);
    const arquivos = await Promise.all(
      arquivosDoTime(ferramentas).map(async (a) => {
        if (!a.bloco || !baseSha) return { path: a.path, content: a.content };
        const atual = await gh.arquivo(instalacao.installationId, repo.fullName, a.path, baseSha);
        return { path: a.path, content: mesclarBloco(atual, a.content) };
      }),
    );
    const nomes = ferramentas.map((f) => FERRAMENTAS_DO_TIME[f].nome).join(", ");
    const corpo = [
      `Instala o **time de especialistas da Forja** para usar com ${nomes}, com a sua própria assinatura.`,
      "",
      ...ORDEM_DAS_PERSONAS.map((x) => `- **${PERSONAS[x].cargo}**: ${PERSONAS[x].resumo}`),
      "",
      "O que entra:",
      ...ferramentas.map((f) => `- ${FERRAMENTAS_DO_TIME[f].nome}: ${FERRAMENTAS_DO_TIME[f].arquivos}.`),
      "",
      "Se o repositório já tinha AGENTS.md ou GEMINI.md, o conteúdo foi mantido: só foi incluído o bloco do time, entre os marcadores `forja:time`.",
      "",
      "Os arquivos são texto: edite à vontade para o jeito do seu time. A Forja nunca usa o seu login nessas ferramentas.",
    ].join("\n");
    return await gh.abrirPR(instalacao.installationId, {
      fullName: repo.fullName,
      base: repo.defaultBranch,
      baseSha,
      branch: "forja/time-de-especialistas",
      arquivos,
      titulo: "Time de especialistas da Forja (Dev Sênior, Dev Pleno, QA e Segurança)",
      corpo,
      mensagem: "Adiciona o time de especialistas da Forja",
    });
  } catch (e) {
    if (e instanceof ErroGithub && (e.status === 404 || e.status === 403)) {
      throw new RegraDoAgente("O app Forja Agentes não tem acesso a esse repositório (ou não pode criar branches). Libere o acesso no GitHub e tente de novo.");
    }
    throw e;
  }
}
