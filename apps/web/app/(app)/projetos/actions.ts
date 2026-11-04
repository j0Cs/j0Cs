"use server";

import { and, eq, isNull, schema, sql } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export async function createProject(formData: FormData) {
  const { db, org, plan, user } = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const defaultModelId = String(formData.get("defaultModelId") ?? "") || null;
  const instructions = String(formData.get("instructions") ?? "").trim();
  const repoFullName = String(formData.get("repoFullName") ?? "").trim() || null;
  if (!name) throw new Error("Dê um nome ao projeto.");

  if (plan?.maxProjects != null) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, org.id), isNull(schema.projects.archivedAt)));
    if ((row?.n ?? 0) >= plan.maxProjects) {
      throw new Error(`Seu plano permite até ${plan.maxProjects} projetos ativos.`);
    }
  }

  const [project] = await db
    .insert(schema.projects)
    .values({ orgId: org.id, name, description, defaultModelId, instructions, repoFullName, createdBy: user.id })
    .returning({ id: schema.projects.id });

  revalidatePath("/projetos");
  redirect(`/projetos/${project!.id}`);
}

export async function archiveProject(formData: FormData) {
  const { db, org } = await getSession();
  const id = String(formData.get("id"));
  await db
    .update(schema.projects)
    .set({ archivedAt: new Date() })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.orgId, org.id)));
  revalidatePath("/projetos");
  redirect("/projetos");
}
