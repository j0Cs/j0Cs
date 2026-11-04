"use server";

import { and, eq, schema } from "@forja/db";
import { redirect } from "next/navigation";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { garantirProjeto } from "@/lib/projects";
import { getSession } from "@/lib/session";

/** Garante um projeto: usa o escolhido ou cria um novo respeitando o limite do plano. */
export async function ensureProject(projetoId: string, nomeSugerido: string) {
  const { db, org, plan, user } = await getSession();
  const r = await garantirProjeto(db, { orgId: org.id, userId: user.id, maxProjects: plan?.maxProjects }, projetoId, nomeSugerido);
  if ("erro" in r) redirect("/central?aviso=limite-projetos");
  return r.id;
}

/**
 * Modo escrever: grava o pedido como primeira mensagem de uma conversa nova e abre o chat,
 * que pede a resposta ao modelo. (Nada de "?q=" na URL: um link externo não dispara gasto.)
 */
export async function comecarEscrevendo(formData: FormData) {
  const pedido = String(formData.get("pedido") ?? "").trim().slice(0, 4000);
  if (!pedido) redirect("/central");
  const id = await ensureProject(String(formData.get("projeto") ?? "nova"), pedido);
  const { db, org, plan, user } = await getSession();
  const projeto = await db.query.projects.findFirst({ where: and(eq(schema.projects.id, id), eq(schema.projects.orgId, org.id)) });
  const modelos = await listModelOptions(db, plan?.allowedTiers ?? []);
  const modelId = projeto?.defaultModelId ?? defaultModelFor(modelos);
  const [conversa] = await db
    .insert(schema.conversations)
    .values({ orgId: org.id, projectId: id, title: pedido.length > 60 ? `${pedido.slice(0, 57)}…` : pedido, modelId, createdBy: user.id })
    .returning({ id: schema.conversations.id });
  await db.insert(schema.messages).values({ conversationId: conversa!.id, role: "user", content: pedido });
  redirect(`/projetos/${id}?c=${conversa!.id}&responder=1`);
}

/** Entrada na call: garante o projeto onde a conversa será registrada. */
export async function prepararCall(projeto: string) {
  return ensureProject(projeto, "Ideia em call");
}

/** Fim da call: grava a especificação como instruções do projeto e abre o projeto. */
export async function concluirCall(input: { projectId: string; spec: import("@/lib/call").CallSpec }) {
  const { db, org } = await getSession();
  const { specToInstructions } = await import("@/lib/call");
  const instrucoes = specToInstructions(input.spec);
  const titulo = input.spec.titulo.trim().slice(0, 80);
  await db
    .update(schema.projects)
    .set({
      ...(titulo ? { name: titulo } : {}),
      description: input.spec.resumo.slice(0, 280),
      ...(instrucoes ? { instructions: instrucoes } : {}),
    })
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.orgId, org.id)));
  redirect(`/projetos/${input.projectId}`);
}
