import { and, asc, desc, eq, schema } from "@forja/db";
import { Badge, buttonClass, cx } from "@forja/ui";
import { FolderGit2, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { usageMeta } from "@/lib/format";
import { getSession } from "@/lib/session";
import { archiveProject } from "../actions";
import { Chat } from "./chat";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string; responder?: string }>;
}) {
  const [{ id }, { c, responder }] = await Promise.all([params, searchParams]);
  const { db, org, plan } = await getSession();

  const project = await db.query.projects.findFirst({
    where: and(eq(schema.projects.id, id), eq(schema.projects.orgId, org.id)),
  });
  if (!project) notFound();

  const [conversations, models] = await Promise.all([
    db
      .select({ id: schema.conversations.id, title: schema.conversations.title, modelId: schema.conversations.modelId })
      .from(schema.conversations)
      .where(eq(schema.conversations.projectId, project.id))
      .orderBy(desc(schema.conversations.updatedAt))
      .limit(50),
    listModelOptions(db, plan?.allowedTiers ?? []),
  ]);

  const active = c ? conversations.find((x) => x.id === c) : undefined;
  const rows = active
    ? await db
        .select({ message: schema.messages, usage: schema.usageEvents })
        .from(schema.messages)
        .leftJoin(schema.usageEvents, eq(schema.usageEvents.id, schema.messages.usageEventId))
        .where(eq(schema.messages.conversationId, active.id))
        .orderBy(asc(schema.messages.createdAt))
    : [];
  const history = rows.map(({ message, usage }) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    modelId: message.modelId,
    meta: usage ? usageMeta(usage.chargeBrlMicros, usage) : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/projetos" className="text-xs text-zinc-500 hover:text-zinc-800">
            ← Projetos
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {project.repoFullName ? (
              <span className="inline-flex items-center gap-1">
                <FolderGit2 size={12} /> {project.repoFullName}
              </span>
            ) : null}
            {project.instructions ? <Badge>Instruções do projeto ativas</Badge> : null}
          </div>
        </div>
        <form action={archiveProject}>
          <input type="hidden" name="id" value={project.id} />
          <button className={buttonClass("ghost", "sm")}>Arquivar projeto</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-1">
          <Link href={`/projetos/${project.id}`} className={cx(buttonClass("secondary", "sm"), "mb-2 w-full")}>
            <Plus size={14} /> Nova conversa
          </Link>
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/projetos/${project.id}?c=${conv.id}`}
              className={cx(
                "block truncate rounded-lg px-3 py-2 text-sm",
                conv.id === active?.id ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100",
              )}
            >
              {conv.title}
            </Link>
          ))}
        </aside>

        <Chat
          key={active?.id ?? "nova"}
          projectId={project.id}
          conversationId={active?.id ?? null}
          initialMessages={history}
          models={models}
          defaultModelId={active?.modelId ?? project.defaultModelId ?? defaultModelFor(models)}
          responderPendente={Boolean(responder && active && history.at(-1)?.role === "user")}
        />
      </div>
    </div>
  );
}
