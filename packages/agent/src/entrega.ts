/**
 * Entrega do que o agente fez (Sprint 4): preview na Vercel do cliente, migrações no Supabase do
 * cliente e avisos na conversa de onde a tarefa saiu. As credenciais são as dos Conectores.
 */
import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@forja/core/server";
import { and, asc, desc, eq, schema, sql, type Db } from "@forja/db";
import { avisarNaConversa } from "./conversa";
import type { GithubApp } from "./github";
import { analisarMigracao, CAMINHO_DE_MIGRACAO, ErroSupabase, SupabaseApi, sqlDaMigracao, versaoDaMigracao } from "./supabase";
import { RegraDoAgente } from "./tarefas";
import { detectarFramework, ErroVercel, nomeDeProjeto, PREVIEW_FINAL, VercelApi } from "./vercel";

type Tarefa = typeof schema.agentTasks.$inferSelect;
type Conector = typeof schema.connectors.$inferSelect;

export interface FabricasDeApi {
  vercel?: (token: string, teamId: string | null) => VercelApi;
  supabase?: (token: string) => SupabaseApi;
}

async function tarefa(db: Db, orgId: string, taskId: string) {
  const t = await db.query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.id, taskId), eq(schema.agentTasks.orgId, orgId)) });
  if (!t) throw new RegraDoAgente("Tarefa não encontrada.");
  return t;
}

export async function conectorDaOrg(db: Db, orgId: string, tipo: "vercel" | "supabase") {
  return (
    (await db.query.connectors.findFirst({
      where: and(eq(schema.connectors.orgId, orgId), eq(schema.connectors.type, tipo)),
      orderBy: desc(schema.connectors.createdAt),
    })) ?? null
  );
}

const credencial = (c: Conector) => decryptSecret(c.encryptedCredentials);

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

/** Pedido para o agente a partir das últimas mensagens de uma conversa. */
export async function pedidoDaConversa(db: Db, orgId: string, conversationId: string) {
  const conversa = await db.query.conversations.findFirst({
    where: and(eq(schema.conversations.id, conversationId), eq(schema.conversations.orgId, orgId)),
  });
  if (!conversa) return null;
  const projeto = await db.query.projects.findFirst({ where: eq(schema.projects.id, conversa.projectId) });
  const msgs = await db
    .select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversa.id))
    .orderBy(asc(schema.messages.createdAt));
  let texto = "";
  for (const m of msgs.filter((x) => x.content.trim()).reverse()) {
    const bloco = `${m.role === "user" ? "Cliente" : "Assistente"}:\n${m.content.trim()}\n\n`;
    if (texto.length + bloco.length > 14_000) break;
    texto = bloco + texto;
  }
  return {
    conversa,
    projeto: projeto ?? null,
    // a 1ª linha vira o título da tarefa
    pedido: `${conversa.title.trim() || "Pedido da conversa"} (combinado no chat)\n\nImplemente no repositório o que foi combinado nesta conversa${projeto ? ` do projeto "${projeto.name}"` : ""}. Quando a conversa tiver opções em aberto, siga a última decisão do cliente.\n\n---\n${texto.trim()}`,
  };
}

// ---------------------------------------------------------------------------
// Vercel: preview do PR
// ---------------------------------------------------------------------------

/** Estado de quem pegou a publicação e ainda não tem deployment (vale por 2 minutos). */
export const PREPARANDO = "PREPARANDO";

/**
 * Publica o preview da branch do PR na Vercel do cliente. Acha o projeto ligado ao repositório ou
 * cria um (o framework sai do package.json da branch). Erros ficam na tarefa (previewError).
 * Criar projeto novo na conta da Vercel só com `podeCriarProjeto` (dono ou administrador).
 */
export async function publicarPreview(
  db: Db,
  gh: GithubApp,
  orgId: string,
  taskId: string,
  opts: { podeCriarProjeto: boolean },
  fab: FabricasDeApi = {},
) {
  const t = await tarefa(db, orgId, taskId);
  if (!t.prUrl || !t.branch) throw new RegraDoAgente("Aprove a tarefa e abra o PR antes de publicar o preview.");
  const conector = await conectorDaOrg(db, orgId, "vercel");
  if (!conector) throw new RegraDoAgente("Conecte a Vercel em Conectores para publicar o preview.");
  // reserva atômica: dois cliques (ou o preview automático + um clique) não publicam duas vezes
  const [reservada] = await db
    .update(schema.agentTasks)
    .set({ previewState: PREPARANDO, previewError: null, vercelDeploymentId: null, previewNotified: false })
    .where(
      and(
        eq(schema.agentTasks.id, t.id),
        sql`(${schema.agentTasks.previewState} is null or ${schema.agentTasks.previewState} in ('READY', 'ERROR', 'CANCELED')
          or (${schema.agentTasks.previewState} = ${PREPARANDO} and ${schema.agentTasks.updatedAt} < now() - interval '2 minutes'))`,
      ),
    )
    .returning({ id: schema.agentTasks.id });
  if (!reservada) throw new RegraDoAgente("O preview já está sendo publicado.");

  try {
    const v = (fab.vercel ?? ((tk, time) => new VercelApi(tk, time)))(credencial(conector), (conector.metadata.teamId as string | undefined) ?? null);
    await v.garantirTime();
    const framework = detectarFramework(await gh.arquivo(t.installationId, t.repoFullName, "package.json", t.branch).catch(() => null));

    let projeto = t.vercelProjectId ? await v.projeto(t.vercelProjectId).catch(() => null) : null;
    projeto ??= await v.projetoDoRepo(t.repoFullName);
    if (!projeto) {
      if (!opts.podeCriarProjeto) {
        throw new RegraDoAgente("Este repositório ainda não tem projeto na Vercel. Peça a um dono ou administrador para publicar o primeiro preview.");
      }
      const nome = nomeDeProjeto(t.repoFullName);
      try {
        projeto = await v.criarProjeto({ nome, repo: t.repoFullName, framework });
      } catch (e) {
        if (!(e instanceof ErroVercel) || (e.status !== 409 && !/already exists|conflict/i.test(e.message))) throw e;
        // criado agora por outra publicação, ou nome já usado por outro projeto da conta
        projeto = (await v.projetoDoRepo(t.repoFullName)) ?? (await v.criarProjeto({ nome: `${nome.slice(0, 80)}-forja`, repo: t.repoFullName, framework }));
      }
    }
    const dep = await v.criarPreview({ projeto, repo: t.repoFullName, branch: t.branch, framework });
    await db
      .update(schema.agentTasks)
      .set({
        vercelProjectId: projeto.id,
        vercelDeploymentId: dep.id,
        previewUrl: dep.url ? `https://${dep.url}` : null,
        previewState: dep.readyState || "QUEUED",
        previewError: null,
        previewNotified: false,
      })
      .where(eq(schema.agentTasks.id, t.id));
    return { deploymentId: dep.id, estado: dep.readyState };
  } catch (e) {
    const msg = mensagemDaVercel(e);
    await db.update(schema.agentTasks).set({ previewState: "ERROR", previewError: msg }).where(eq(schema.agentTasks.id, t.id));
    throw new RegraDoAgente(msg);
  }
}

function mensagemDaVercel(e: unknown) {
  if (e instanceof RegraDoAgente) return e.message;
  if (e instanceof ErroVercel) {
    if (e.status === 401 || e.status === 403) return `A Vercel recusou o token (${e.status}). Gere um novo em Conectores.`;
    if (/github/i.test(e.message) && /(install|access|connect|link)/i.test(e.message)) {
      return `A Vercel não tem acesso a este repositório no GitHub. Na Vercel, em Settings → Git, instale o app do GitHub e libere o repositório. (${e.message})`;
    }
    return `A Vercel respondeu: ${e.message}`;
  }
  return "Não consegui falar com a Vercel agora. Tente de novo em instantes.";
}

/**
 * Consulta o preview na Vercel enquanto ele não termina. Quando termina, avisa na conversa (uma
 * vez só: a marca previewNotified é trocada numa atualização condicional).
 */
export async function atualizarPreview(db: Db, t: Tarefa, fab: FabricasDeApi = {}) {
  if (!t.vercelDeploymentId || !t.previewState || PREVIEW_FINAL.has(t.previewState)) return t;
  const conector = await conectorDaOrg(db, t.orgId, "vercel");
  if (!conector) return t;
  let dep;
  try {
    const v = (fab.vercel ?? ((tk, time) => new VercelApi(tk, time)))(credencial(conector), (conector.metadata.teamId as string | undefined) ?? null);
    await v.garantirTime();
    dep = await v.deployment(t.vercelDeploymentId);
  } catch {
    return t; // tenta de novo na próxima consulta
  }
  const estado = dep.readyState || t.previewState;
  const final = PREVIEW_FINAL.has(estado);
  const erro = estado === "ERROR" ? `O build falhou na Vercel${dep.errorMessage ? `: ${dep.errorMessage}` : "."}${dep.inspectorUrl ? ` Log: ${dep.inspectorUrl}` : ""}` : null;
  // só grava se a tarefa ainda aponta para este deployment (uma consulta atrasada não sobrescreve um mais novo)
  const doMesmoDeployment = and(eq(schema.agentTasks.id, t.id), eq(schema.agentTasks.vercelDeploymentId, t.vercelDeploymentId));
  const [nova] = await db
    .update(schema.agentTasks)
    .set({ previewState: estado, previewUrl: dep.url ? `https://${dep.url}` : t.previewUrl, previewError: erro })
    .where(doMesmoDeployment)
    .returning();
  if (!nova) return (await db.query.agentTasks.findFirst({ where: eq(schema.agentTasks.id, t.id) })) ?? t;
  if (final) {
    const [marcou] = await db
      .update(schema.agentTasks)
      .set({ previewNotified: true })
      .where(and(doMesmoDeployment, eq(schema.agentTasks.previewNotified, false)))
      .returning({ id: schema.agentTasks.id });
    if (marcou) {
      const url = dep.url ? `https://${dep.url}` : t.previewUrl;
      await avisarNaConversa(
        db,
        t.conversationId,
        estado === "READY"
          ? `**Preview publicado na Vercel:** ${url}\n\nÉ a versão do pull request [#${t.prNumber}](${t.prUrl}). Confira e, se estiver tudo certo, faça o merge no GitHub.`
          : `**O preview não saiu na Vercel** (${estado === "CANCELED" ? "cancelado" : "erro no build"}). ${erro ?? ""} Veja a tarefa em [Agente](/agente/${t.id}).`,
      );
    }
  }
  return nova ?? t;
}

/** Previews ainda em andamento das tarefas desta conversa (chamado ao abrir o chat). */
export async function atualizarPreviewsDaConversa(db: Db, orgId: string, conversationId: string, fab: FabricasDeApi = {}) {
  const pendentes = await db
    .select()
    .from(schema.agentTasks)
    .where(
      and(
        eq(schema.agentTasks.orgId, orgId),
        eq(schema.agentTasks.conversationId, conversationId),
        sql`${schema.agentTasks.vercelDeploymentId} is not null`,
        sql`coalesce(${schema.agentTasks.previewState}, '') not in ('READY', 'ERROR', 'CANCELED')`,
      ),
    )
    .limit(5);
  for (const t of pendentes) await atualizarPreview(db, t, fab);
}

// ---------------------------------------------------------------------------
// Supabase: projeto e migrações
// ---------------------------------------------------------------------------

/** Migrações que o agente escreveu (supabase/migrations/*.sql), em ordem. */
export async function migracoesDaTarefa(db: Db, taskId: string) {
  const arquivos = await db
    .select({ path: schema.agentTaskFiles.path, content: schema.agentTaskFiles.content })
    .from(schema.agentTaskFiles)
    .where(eq(schema.agentTaskFiles.taskId, taskId));
  return arquivos
    .filter((a) => a.content !== null && CAMINHO_DE_MIGRACAO.test(a.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((a) => {
      const v = versaoDaMigracao(a.path);
      return { path: a.path, sql: a.content!, versao: v?.versao ?? null, nome: v?.nome ?? null, ...analisarMigracao(a.path, a.content!) };
    });
}

/** Impressão digital do SQL que a tela mostrou: o servidor só aplica se for exatamente o mesmo. */
export const hashDasMigracoes = (migs: { path: string; sql: string }[]) =>
  createHash("sha256")
    .update(JSON.stringify(migs.map((m) => [m.path, m.sql])))
    .digest("hex");

export async function supabaseDaOrg(db: Db, orgId: string, fab: FabricasDeApi = {}) {
  const conector = await conectorDaOrg(db, orgId, "supabase");
  if (!conector) return null;
  return { conector, api: (fab.supabase ?? ((tk) => new SupabaseApi(tk)))(credencial(conector)) };
}

/**
 * Cria um projeto no Supabase do cliente (São Paulo). A senha do banco é gerada pela Forja e fica
 * guardada criptografada no conector (o Supabase não deixa ler a senha depois).
 */
export async function criarProjetoSupabase(db: Db, orgId: string, p: { nome: string; taskId?: string }, fab: FabricasDeApi = {}) {
  const s = await supabaseDaOrg(db, orgId, fab);
  if (!s) throw new RegraDoAgente("Conecte o Supabase em Conectores.");
  const nome = p.nome.trim().slice(0, 60);
  if (nome.length < 3) throw new RegraDoAgente("Dê um nome ao projeto (3 letras ou mais).");
  try {
    const orgs = await s.api.organizacoes();
    if (!orgs.length) throw new RegraDoAgente("O token do Supabase não enxerga nenhuma organização.");
    const { projeto, senha } = await s.api.criarProjeto({ nome, organizacao: orgs[0]!.slug });
    const criados = Array.isArray(s.conector.metadata.projetosCriados) ? (s.conector.metadata.projetosCriados as unknown[]) : [];
    await db
      .update(schema.connectors)
      .set({
        metadata: {
          ...s.conector.metadata,
          projetosCriados: [...criados, { ref: projeto.ref, nome: projeto.nome, senhaDoBanco: encryptSecret(senha), em: new Date().toISOString() }],
        },
      })
      .where(eq(schema.connectors.id, s.conector.id));
    if (p.taskId) await db.update(schema.agentTasks).set({ supabaseProjectRef: projeto.ref }).where(and(eq(schema.agentTasks.id, p.taskId), eq(schema.agentTasks.orgId, orgId)));
    return projeto;
  } catch (e) {
    if (e instanceof RegraDoAgente) throw e;
    if (e instanceof ErroSupabase) throw new RegraDoAgente(`O Supabase respondeu: ${e.message}`);
    throw new RegraDoAgente("Não consegui falar com o Supabase agora. Tente de novo em instantes.");
  }
}

/**
 * Aplica no projeto escolhido as migrações do PR que ainda não estão no histórico do banco, em
 * ordem, parando na primeira que falhar. Só depois da aprovação (PR aberto) e de uma confirmação.
 */
export async function aplicarMigracoes(
  db: Db,
  orgId: string,
  taskId: string,
  p: { ref: string; hash: string; confirmacao: string },
  fab: FabricasDeApi = {},
) {
  const ref = p.ref;
  const t = await tarefa(db, orgId, taskId);
  if (!t.prUrl) throw new RegraDoAgente("Aprove a tarefa e abra o PR antes de mexer no banco.");
  const migracoes = await migracoesDaTarefa(db, t.id);
  if (!migracoes.length) throw new RegraDoAgente("Esta tarefa não tem migrações (arquivos em supabase/migrations).");
  if (p.hash !== hashDasMigracoes(migracoes)) throw new RegraDoAgente("As migrações mudaram desde que a tela abriu. Recarregue e revise de novo.");
  const bloqueada = migracoes.find((m) => m.bloqueio);
  if (bloqueada) throw new RegraDoAgente(`${bloqueada.path}: ${bloqueada.bloqueio}`);
  const s = await supabaseDaOrg(db, orgId, fab);
  if (!s) throw new RegraDoAgente("Conecte o Supabase em Conectores.");

  const resultados: { path: string; ok: boolean; erro?: string; em: string }[] = [];
  try {
    const projetos = await s.api.projetos();
    const projeto = projetos.find((x) => x.ref === ref);
    if (!projeto) throw new RegraDoAgente("Esse projeto não aparece no seu Supabase.");
    if (p.confirmacao.trim() !== projeto.nome.trim()) {
      throw new RegraDoAgente(`Para confirmar, digite o nome do projeto exatamente como no Supabase: ${projeto.nome}`);
    }
    if (projeto.status && projeto.status !== "ACTIVE_HEALTHY") {
      throw new RegraDoAgente(`O projeto ${projeto.nome} ainda não está pronto no Supabase (${projeto.status}). Tente de novo em 1 ou 2 minutos.`);
    }
    const aplicadas = await s.api.versoesAplicadas(ref);
    for (const m of migracoes) {
      const em = new Date().toISOString();
      if (aplicadas.has(m.versao!)) {
        resultados.push({ path: m.path, ok: true, erro: "já estava aplicada", em });
        continue;
      }
      try {
        await s.api.sql(ref, sqlDaMigracao({ versao: m.versao!, nome: m.nome!, sql: m.sql }));
        aplicadas.add(m.versao!);
        resultados.push({ path: m.path, ok: true, em });
      } catch (e) {
        resultados.push({ path: m.path, ok: false, erro: e instanceof Error ? e.message.slice(0, 500) : String(e), em });
        break; // as próximas podem depender desta
      }
    }
  } catch (e) {
    if (e instanceof RegraDoAgente) throw e;
    if (e instanceof ErroSupabase) throw new RegraDoAgente(e.status === 401 ? "O Supabase recusou o token. Gere um novo em Conectores." : `O Supabase respondeu: ${e.message}`);
    throw new RegraDoAgente("Não consegui falar com o Supabase agora. Tente de novo em instantes.");
  }

  await db.update(schema.agentTasks).set({ supabaseProjectRef: ref, migrations: resultados }).where(eq(schema.agentTasks.id, t.id));
  const novas = resultados.filter((r) => r.ok && !r.erro).length;
  const falha = resultados.find((r) => !r.ok);
  await avisarNaConversa(
    db,
    t.conversationId,
    falha
      ? `**Migração falhou no Supabase** (${ref}): \`${falha.path}\`: ${falha.erro}. ${novas ? `${novas} migração(ões) antes dela foram aplicadas.` : "Nada foi aplicado."}`
      : `**Banco atualizado no Supabase** (${ref}): ${novas ? `${novas} migração(ões) aplicada(s)` : "as migrações já estavam aplicadas"}.`,
  );
  return resultados;
}
