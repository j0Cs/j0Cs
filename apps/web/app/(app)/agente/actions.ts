"use server";

import { aprovarTarefa, criarTarefa, descartarTarefa, githubApp, pararTarefa, RegraDoAgente } from "@forja/agent";
import { consumeRateLimit, eq, schema } from "@forja/db";
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

export async function pararTarefaAction(id: string) {
  const { db, org } = await getSession();
  await pararTarefa(db, org.id, id).catch(() => undefined);
  revalidatePath(`/agente/${id}`);
}

export async function aprovarTarefaAction(id: string): Promise<{ erro?: string; url?: string }> {
  const { db, org, user } = await getSession();
  if (!user.emailVerified) return { erro: "Confirme seu e-mail antes." };
  const gh = await githubApp();
  if (!gh) return { erro: "O GitHub ainda não está configurado na Forja." };
  try {
    const pr = await aprovarTarefa(db, gh, org.id, id);
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
