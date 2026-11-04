import { and, desc, eq, isNull, schema } from "@forja/db";
import { CallRoom } from "@/components/oficina/call-room";
import { defaultModelFor, listModelOptions } from "@/lib/models";
import { ASSISTANT_NAME, firstName } from "@/lib/persona";
import { getSession } from "@/lib/session";
import { precoMinutoBrlMicros, vozNuvemDisponivel } from "@/lib/voz";

export const metadata = { title: "Call" };

export default async function CallPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto = "nova" } = await searchParams;
  const { db, org, plan, user } = await getSession();
  const [modelos, projetos] = await Promise.all([
    listModelOptions(db, plan?.allowedTiers ?? []),
    db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(and(eq(schema.projects.orgId, org.id), isNull(schema.projects.archivedAt)))
      .orderBy(desc(schema.projects.createdAt)),
  ]);
  const escolhido = projetos.find((p) => p.id === projeto);
  const [nuvem, preco] = await Promise.all([vozNuvemDisponivel(db, org.id), precoMinutoBrlMicros(db)]);

  return (
    <CallRoom
      nome={firstName(user.name)}
      agente={ASSISTANT_NAME}
      projeto={escolhido ? { id: escolhido.id, nome: escolhido.name } : null}
      modelos={modelos.filter((m) => m.allowed).map((m) => ({ id: m.id, nome: m.displayName }))}
      modeloPadrao={defaultModelFor(modelos, ["claude-sonnet-5-5", "gpt-6.1-sol", "claude-haiku-5-5"])}
      emailVerificado={user.emailVerified}
      vozNuvem={{ disponivel: nuvem, precoMinutoBrlMicros: preco }}
    />
  );
}
