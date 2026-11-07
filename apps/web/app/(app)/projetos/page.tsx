import { formatBrlMicros } from "@forja/core";
import { and, desc, eq, isNull, schema, sql } from "@forja/db";
import { Badge, Button, Card, CardHeader, EmptyState, Field, inputClass, PageHeader } from "@forja/ui";
import { FolderGit2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { listModelOptions } from "@/lib/models";
import { getSession } from "@/lib/session";
import { createProject } from "./actions";

export const metadata = { title: "Projetos" };

export default async function ProjectsPage() {
  const { db, org, plan } = await getSession();

  const stats = db
    .select({
      projectId: schema.usageEvents.projectId,
      spent: sql<number>`coalesce(sum(${schema.usageEvents.chargeBrlMicros}), 0)::bigint`.mapWith(Number).as("spent"),
    })
    .from(schema.usageEvents)
    .where(eq(schema.usageEvents.orgId, org.id))
    .groupBy(schema.usageEvents.projectId)
    .as("s");

  const [projects, models] = await Promise.all([
    db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        repoFullName: schema.projects.repoFullName,
        defaultModel: schema.models.displayName,
        createdAt: schema.projects.createdAt,
        conversations: sql<number>`(select count(*)::int from conversations c where c.project_id = ${schema.projects.id})`.mapWith(Number),
        spent: sql<number>`coalesce(${stats.spent}, 0)`.mapWith(Number),
      })
      .from(schema.projects)
      .leftJoin(schema.models, eq(schema.models.id, schema.projects.defaultModelId))
      .leftJoin(stats, eq(stats.projectId, schema.projects.id))
      .where(and(eq(schema.projects.orgId, org.id), isNull(schema.projects.archivedAt)))
      .orderBy(desc(schema.projects.createdAt)),
    listModelOptions(db, plan?.allowedTiers ?? []),
  ]);

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Cada projeto guarda conversas, instruções fixas, repositório e o custo acumulado."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {projects.length === 0 ? (
            <Card>
              <EmptyState title="Nenhum projeto ainda" description="Crie o primeiro projeto ao lado para começar a conversar com os modelos." />
            </Card>
          ) : (
            projects.map((p) => (
              <Link key={p.id} href={`/projetos/${p.id}`} className="block">
                <Card className="px-5 py-4 transition hover:border-zinc-300 hover:shadow">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900">{p.name}</p>
                      {p.description ? <p className="mt-0.5 truncate text-sm text-zinc-500">{p.description}</p> : null}
                    </div>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-700">{formatBrlMicros(p.spent)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {p.defaultModel ? <Badge tone="brand">{p.defaultModel}</Badge> : null}
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={12} /> {p.conversations} conversas
                    </span>
                    {p.repoFullName ? (
                      <span className="inline-flex items-center gap-1">
                        <FolderGit2 size={12} /> {p.repoFullName}
                      </span>
                    ) : null}
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>

        <Card>
          <CardHeader
            title="Novo projeto"
            description={plan?.maxProjects != null ? `Seu plano permite ${plan.maxProjects} projetos ativos.` : "Projetos ilimitados no seu plano."}
          />
          <form action={createProject} className="space-y-4 p-5">
            <Field label="Nome">
              <input name="name" required className={inputClass} placeholder="Ex.: ERP da loja" />
            </Field>
            <Field label="Descrição">
              <input name="description" className={inputClass} placeholder="Opcional" />
            </Field>
            <Field label="Modelo padrão">
              <select name="defaultModelId" className={inputClass} defaultValue="claude-opus-5-5">
                {models.map((m) => (
                  <option key={m.id} value={m.id} disabled={!m.allowed}>
                    {m.displayName}
                    {m.allowed ? "" : " (upgrade)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Repositório GitHub" hint="owner/repo — a integração completa chega com o GitHub App.">
              <input name="repoFullName" className={inputClass} placeholder="minha-empresa/meu-app" />
            </Field>
            <Field label="Instruções do projeto" hint="Vão em todas as conversas (e ficam em cache, então custam pouco).">
              <textarea name="instructions" rows={3} className={inputClass} placeholder="Stack, padrões de código, regras de negócio..." />
            </Field>
            <Button type="submit" className="w-full">
              Criar projeto
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
