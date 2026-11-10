"use server";

import { conectarRepositorio, desconectarRepositorio, githubApp, RegraDoAgente } from "@forja/agent";
import { consumeRateLimit } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { getSession } from "@/lib/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ler(projectId: string, repoFullName: string): Promise<FormState> {
  const { db, org } = await getSession();
  if (!UUID.test(projectId)) return { error: "Projeto não encontrado." };
  if (!(await consumeRateLimit(db, `projeto:estrutura:${org.id}`, 30, 3600))) return { error: "Muitas leituras na última hora. Tente mais tarde." };
  const gh = await githubApp();
  if (!gh) return { error: "O GitHub ainda não está configurado na Forja." };
  try {
    await conectarRepositorio(db, gh, { orgId: org.id, projectId, repoFullName });
  } catch (e) {
    if (e instanceof RegraDoAgente) return { error: e.message };
    console.error(JSON.stringify({ level: "error", msg: "ler estrutura falhou", err: String(e) }));
    return { error: "Não consegui ler o repositório agora. Tente de novo." };
  }
  revalidatePath(`/projetos/${projectId}`);
  redirect(`/projetos/${projectId}/repositorio?ok=1`);
}

export async function conectarRepositorioAction(_: FormState, f: FormData): Promise<FormState> {
  return ler(String(f.get("projeto") ?? ""), String(f.get("repo") ?? ""));
}

export async function atualizarEstruturaAction(_: FormState, f: FormData): Promise<FormState> {
  return ler(String(f.get("projeto") ?? ""), String(f.get("repo") ?? ""));
}

export async function desconectarRepositorioAction(f: FormData) {
  const { db, org } = await getSession();
  const projectId = String(f.get("projeto") ?? "");
  if (!UUID.test(projectId)) return;
  await desconectarRepositorio(db, { orgId: org.id, projectId });
  revalidatePath(`/projetos/${projectId}`);
  redirect(`/projetos/${projectId}/repositorio`);
}
