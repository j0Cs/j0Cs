"use server";

import { lerDocumento, lerTelefone } from "@forja/core";
import { and, eq, ne, schema } from "@forja/db";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { canManage, getSession } from "@/lib/session";

const TAMANHOS = ["1", "2-5", "6-20", "21+"] as const;
const USOS = ["gestao", "construcao", "ambos"] as const;

/** Etapa 1: quem é a empresa. Só dono e administrador preenchem; o documento vale para uma conta só. */
export async function salvarEmpresaAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, role } = await getSession();
  if (!canManage(role)) redirect("/boas-vindas?etapa=3");
  const documento = lerDocumento(String(f.get("documento") ?? ""));
  if (!documento) return { error: "Confira o CPF ou CNPJ: os dígitos não fecham." };
  const telefone = lerTelefone(String(f.get("telefone") ?? ""));
  if (!telefone) return { error: "Informe um telefone com DDD, como (11) 98765-4321." };
  const tamanho = TAMANHOS.find((t) => t === f.get("tamanho"));
  if (!tamanho) return { error: "Escolha o tamanho da equipe." };

  const outra = await db.query.organizations.findFirst({
    where: and(eq(schema.organizations.document, documento.valor), ne(schema.organizations.id, org.id)),
    columns: { id: true },
  });
  if (outra) return { error: "Já existe uma conta com este documento. Se for a sua empresa, peça um convite a quem criou ou fale com o suporte." };

  await db
    .update(schema.organizations)
    .set({ documentType: documento.tipo, document: documento.valor, phone: telefone, teamSize: tamanho })
    .where(eq(schema.organizations.id, org.id));
  redirect("/boas-vindas?etapa=2");
}

/** Etapa 2: como vai usar (com as contas de IA dela, com a Forja construindo, ou os dois). */
export async function salvarUsoAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, role } = await getSession();
  const uso = USOS.find((u) => u === f.get("uso"));
  if (!uso) return { error: "Escolha uma das opções." };
  if (canManage(role)) await db.update(schema.organizations).set({ intendedUse: uso }).where(eq(schema.organizations.id, org.id));
  redirect("/boas-vindas?etapa=3");
}

/** Última etapa: marca as boas-vindas como feitas e leva ao primeiro lugar útil. */
export async function concluirBoasVindasAction() {
  const { db, org, role } = await getSession();
  // quem foi convidado não preenche os dados da empresa: isso é de quem administra
  if (!org.document && canManage(role)) redirect("/boas-vindas?etapa=1");
  if (!org.onboardedAt) await db.update(schema.organizations).set({ onboardedAt: new Date() }).where(eq(schema.organizations.id, org.id));
  redirect(org.intendedUse === "construcao" ? "/projetos" : "/assistentes");
}
