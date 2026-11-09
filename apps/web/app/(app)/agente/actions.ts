"use server";

import {
  aplicarMigracoes,
  aprovarTarefa,
  CATEGORIAS,
  type Achado,
  comentarRevisaoNoPR,
  type FerramentaDoTime,
  instalarTimeNoRepositorio,
  type Persona,
  conectorDaOrg,
  criarProjetoSupabase,
  criarTarefa,
  descartarTarefa,
  githubApp,
  pararTarefa,
  publicarPreview,
  RegraDoAgente,
} from "@forja/agent";
import { and, consumeRateLimit, eq, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/components/action-form";
import { rodarTarefa } from "@/lib/agente";
import { canManage, getSession } from "@/lib/session";

const reais = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) : null;
};

export async function criarTarefaAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { error: "Confirme seu e-mail antes de usar o agente." };
  if (!(await consumeRateLimit(db, `agente:criar:${org.id}`, 30, 3600))) return { error: "Muitas tarefas na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { error: "O GitHub ainda não está configurado na Forja. Fale com o suporte." };
  let id: string;
  try {
    const { tarefa } = await criarTarefa(db, gh, {
      org,
      userId: user.id,
      repoFullName: String(f.get("repo") ?? ""),
      pedido: String(f.get("pedido") ?? ""),
      modelId: String(f.get("modelo") ?? ""),
      tetoBrlMicros: reais(f.get("teto")),
      projectId: String(f.get("projeto") ?? "") || null,
      conversationId: String(f.get("conversa") ?? "") || null,
    });
    id = tarefa.id;
  } catch (e) {
    if (e instanceof RegraDoAgente) return { error: e.message };
    console.error(JSON.stringify({ level: "error", msg: "criar tarefa falhou", err: String(e) }));
    return { error: "Não consegui falar com o GitHub agora. Tente de novo em instantes." };
  }
  after(() => rodarTarefa(db, gh, id));
  redirect(`/agente/${id}`);
}

/** Auditoria: o agente só lê o repositório e entrega um relatório (custo medido como qualquer tarefa). */
export async function criarAuditoriaAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { error: "Confirme seu e-mail antes de usar o agente." };
  if (!(await consumeRateLimit(db, `agente:criar:${org.id}`, 30, 3600))) return { error: "Muitas tarefas na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { error: "O GitHub ainda não está configurado na Forja. Fale com o suporte." };
  let id: string;
  try {
    const { tarefa } = await criarTarefa(db, gh, {
      org,
      userId: user.id,
      kind: "auditoria",
      personas: f.getAll("persona").map(String) as Persona[],
      repoFullName: String(f.get("repo") ?? ""),
      pedido: String(f.get("foco") ?? "").slice(0, 2_000),
      modelId: String(f.get("modelo") ?? ""),
      tetoBrlMicros: reais(f.get("teto")),
      projectId: String(f.get("projeto") ?? "") || null,
    });
    id = tarefa.id;
  } catch (e) {
    if (e instanceof RegraDoAgente) return { error: e.message };
    console.error(JSON.stringify({ level: "error", msg: "criar auditoria falhou", err: String(e) }));
    return { error: "Não consegui falar com o GitHub agora. Tente de novo em instantes." };
  }
  after(() => rodarTarefa(db, gh, id));
  redirect(`/agente/${id}`);
}

/** Revisão de QA de um pull request (o código pode ter vindo do Claude Code, Codex etc. do cliente). */
export async function criarRevisaoAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { error: "Confirme seu e-mail antes de usar o agente." };
  const pr = Number(String(f.get("pr") ?? "").replace(/^#/, "").trim());
  if (!Number.isInteger(pr) || pr < 1) return { error: "Informe o número do pull request (ex.: 42)." };
  if (!(await consumeRateLimit(db, `agente:criar:${org.id}`, 30, 3600))) return { error: "Muitas tarefas na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { error: "O GitHub ainda não está configurado na Forja. Fale com o suporte." };
  let id: string;
  try {
    const { tarefa } = await criarTarefa(db, gh, {
      org,
      userId: user.id,
      kind: "revisao",
      pr,
      personas: f.getAll("persona").map(String) as Persona[],
      repoFullName: String(f.get("repo") ?? ""),
      pedido: String(f.get("foco") ?? "").slice(0, 2_000),
      modelId: String(f.get("modelo") ?? ""),
      tetoBrlMicros: reais(f.get("teto")),
      projectId: String(f.get("projeto") ?? "") || null,
    });
    id = tarefa.id;
  } catch (e) {
    if (e instanceof RegraDoAgente) return { error: e.message };
    console.error(JSON.stringify({ level: "error", msg: "criar revisão falhou", err: String(e) }));
    return { error: "Não consegui falar com o GitHub agora. Tente de novo em instantes." };
  }
  after(() => rodarTarefa(db, gh, id));
  redirect(`/agente/${id}`);
}

/** Publica a revisão concluída no pull request, como comentário de revisão. */
export async function comentarNoPRAction(id: string): Promise<{ erro?: string; url?: string }> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { erro: "Confirme seu e-mail antes." };
  if (!(await consumeRateLimit(db, `agente:comentar:${org.id}`, 30, 3600))) return { erro: "Muitas publicações na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { erro: "O GitHub ainda não está configurado na Forja." };
  try {
    const c = await comentarRevisaoNoPR(db, gh, org.id, id);
    revalidatePath(`/agente/${id}`);
    return { url: c.url };
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    console.error(JSON.stringify({ level: "error", msg: "comentar no PR falhou", err: String(e) }));
    return { erro: "Não consegui publicar no GitHub agora. Tente de novo." };
  }
}

/** Abre um PR no repositório do projeto com os arquivos do time para as ferramentas do cliente. */
export async function instalarTimeAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, user, role } = await getSession();
  if (!canManage(role)) return { error: "Só donos e administradores instalam o time no repositório." };
  if (!user.emailVerified) return { error: "Confirme seu e-mail antes." };
  if (!(await consumeRateLimit(db, `agente:time:${org.id}`, 10, 3600))) return { error: "Muitas tentativas na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { error: "O GitHub ainda não está configurado na Forja." };
  try {
    const pr = await instalarTimeNoRepositorio(db, gh, {
      orgId: org.id,
      repoFullName: String(f.get("repo") ?? ""),
      ferramentas: f.getAll("ferramenta").map(String) as FerramentaDoTime[],
    });
    return { ok: `Pull request aberto: ${pr.url}` };
  } catch (e) {
    if (e instanceof RegraDoAgente) return { error: e.message };
    console.error(JSON.stringify({ level: "error", msg: "instalar time falhou", err: String(e) }));
    return { error: "Não consegui abrir o pull request agora. Tente de novo." };
  }
}

/** Da auditoria para a correção: os achados escolhidos viram o pedido de uma tarefa de mudança. */
export async function corrigirAchadosAction(auditoriaId: string, chaves: string[]): Promise<{ erro?: string }> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { erro: "Confirme seu e-mail antes de usar o agente." };
  const t = await db.query.agentTasks.findFirst({ where: and(eq(schema.agentTasks.id, auditoriaId), eq(schema.agentTasks.orgId, org.id)) });
  if (!t || t.kind !== "auditoria") return { erro: "Auditoria não encontrada." };
  const r = (t.report ?? {}) as { varredura?: Achado[]; achados?: Achado[] };
  const escolhidos = chaves
    .slice(0, 15)
    .map((c) => {
      const [origem, i] = c.split(":");
      return (origem === "varredura" ? r.varredura : r.achados)?.[Number(i)];
    })
    .filter((a): a is Achado => Boolean(a));
  if (!escolhidos.length) return { erro: "Escolha pelo menos um achado." };
  const pedido = [
    `Corrija estes pontos encontrados na auditoria de ${t.repoFullName}. Mantenha o estilo do projeto e não mude o que não for preciso.`,
    "",
    ...escolhidos.map(
      (a, n) =>
        `${n + 1}. [${CATEGORIAS[a.categoria]} · ${a.severidade}] ${a.titulo}${a.arquivo ? ` (${a.arquivo}${a.linha ? `:${a.linha}` : ""})` : ""}\n   Problema: ${a.detalhe}\n   O que fazer: ${a.recomendacao}`,
    ),
    "",
    "Segredos expostos: não basta apagar do código. Mova para variáveis de ambiente e diga no resumo que a chave precisa ser trocada no serviço.",
  ].join("\n");
  if (!(await consumeRateLimit(db, `agente:criar:${org.id}`, 30, 3600))) return { erro: "Muitas tarefas na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { erro: "O GitHub ainda não está configurado na Forja." };
  let id: string;
  try {
    const { tarefa } = await criarTarefa(db, gh, { org, userId: user.id, repoFullName: t.repoFullName, pedido, modelId: t.modelId, projectId: t.projectId });
    id = tarefa.id;
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    return { erro: "Não consegui criar a tarefa agora. Tente de novo." };
  }
  after(() => rodarTarefa(db, gh, id));
  redirect(`/agente/${id}`);
}

export async function pararTarefaAction(id: string) {
  const { db, org } = await getSession();
  await pararTarefa(db, org.id, id).catch(() => undefined);
  revalidatePath(`/agente/${id}`);
}

export async function aprovarTarefaAction(id: string): Promise<{ erro?: string; url?: string }> {
  const { db, org, user, role } = await getSession();
  if (!user.emailVerified) return { erro: "Confirme seu e-mail antes." };
  const gh = await githubApp();
  if (!gh) return { erro: "O GitHub ainda não está configurado na Forja." };
  try {
    const pr = await aprovarTarefa(db, gh, org.id, id);
    // Vercel conectada: o preview da branch do PR sai sozinho
    if (await conectorDaOrg(db, org.id, "vercel")) {
      after(() =>
        publicarPreview(db, gh, org.id, id, { podeCriarProjeto: canManage(role) }).catch((err) => {
          if (!(err instanceof RegraDoAgente)) console.error(JSON.stringify({ level: "error", msg: "preview automático falhou", taskId: id, err: String(err) }));
        }),
      );
    }
    revalidatePath(`/agente/${id}`);
    return { url: pr.url };
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    console.error(JSON.stringify({ level: "error", msg: "aprovar tarefa falhou", err: String(e) }));
    return { erro: "Não consegui abrir o PR agora. Tente de novo." };
  }
}

export async function descartarTarefaAction(id: string) {
  const { db, org } = await getSession();
  await descartarTarefa(db, org.id, id).catch(() => undefined);
  revalidatePath(`/agente/${id}`);
}

export async function tetoDiarioAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, role } = await getSession();
  if (!canManage(role)) return { error: "Só donos e administradores mudam o teto diário." };
  const valor = reais(f.get("teto"));
  if (!valor || valor > 5_000_000_000) return { error: "Informe um valor entre R$ 1 e R$ 5.000." };
  await db.update(schema.organizations).set({ agentDailyCapBrlMicros: valor }).where(eq(schema.organizations.id, org.id));
  revalidatePath("/agente");
  return { ok: "Teto diário atualizado." };
}

export async function publicarPreviewAction(id: string): Promise<{ erro?: string }> {
  const { db, org, role } = await getSession();
  const gh = await githubApp();
  if (!gh) return { erro: "O GitHub ainda não está configurado na Forja." };
  if (!(await consumeRateLimit(db, `agente:preview:${org.id}`, 20, 3600))) return { erro: "Muitos previews na última hora. Tente mais tarde." };
  try {
    // projeto novo na conta da Vercel só por dono ou administrador; membros publicam em projeto existente
    await publicarPreview(db, gh, org.id, id, { podeCriarProjeto: canManage(role) });
    return {};
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    console.error(JSON.stringify({ level: "error", msg: "preview falhou", taskId: id, err: String(e) }));
    return { erro: "Não consegui falar com a Vercel agora. Tente de novo." };
  }
}

/** Criar banco e aplicar migrações mexem na conta do cliente: só donos e administradores. */
export async function criarProjetoSupabaseAction(id: string, nome: string): Promise<{ erro?: string; ref?: string }> {
  const { db, org, role } = await getSession();
  if (!canManage(role)) return { erro: "Só donos e administradores criam projetos no Supabase." };
  if (!(await consumeRateLimit(db, `agente:supabase-criar:${org.id}`, 5, 3600))) return { erro: "Muitos projetos criados na última hora." };
  try {
    const p = await criarProjetoSupabase(db, org.id, { nome, taskId: id });
    revalidatePath(`/agente/${id}`);
    return { ref: p.ref };
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    return { erro: "Não consegui criar o projeto no Supabase agora." };
  }
}

export async function aplicarMigracoesAction(
  id: string,
  ref: string,
  hash: string,
  confirmacao: string,
): Promise<{ erro?: string; resultados?: { path: string; ok: boolean; erro?: string }[] }> {
  const { db, org, role } = await getSession();
  if (!canManage(role)) return { erro: "Só donos e administradores aplicam migrações no banco." };
  if (!/^[a-z0-9]{10,40}$/.test(ref)) return { erro: "Escolha um projeto do Supabase." };
  if (!(await consumeRateLimit(db, `agente:migracoes:${org.id}`, 30, 3600))) return { erro: "Muitas tentativas na última hora." };
  try {
    const resultados = await aplicarMigracoes(db, org.id, id, { ref, hash: String(hash), confirmacao: String(confirmacao) });
    revalidatePath(`/agente/${id}`);
    return { resultados };
  } catch (e) {
    if (e instanceof RegraDoAgente) return { erro: e.message };
    console.error(JSON.stringify({ level: "error", msg: "migrações falharam", taskId: id, err: String(e) }));
    return { erro: "Não consegui falar com o Supabase agora." };
  }
}
