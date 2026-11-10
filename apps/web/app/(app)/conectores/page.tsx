import { CATEGORIAS_DE_CONECTOR, instalacaoDaOrg, type CategoriaDeConector } from "@forja/agent";
import { desc, eq, schema } from "@forja/db";
import { Badge, Button, buttonClass, Card, CardHeader, Field, inputClass, Notice, PageHeader } from "@forja/ui";
import Link from "next/link";
import { CONNECTORS } from "@/lib/connectors";
import { getSession } from "@/lib/session";
import { connect, disconnect } from "./actions";

export const metadata = { title: "Conectores" };

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const { db, org } = await getSession();
  const [connected, instalacao] = await Promise.all([
    db.select().from(schema.connectors).where(eq(schema.connectors.orgId, org.id)).orderBy(desc(schema.connectors.createdAt)),
    instalacaoDaOrg(db, org.id),
  ]);

  return (
    <>
      <PageHeader
        title="Conectores"
        description="Ligue os serviços onde ficam o código, o deploy, os bancos e o gasto com IA. Cada credencial é testada no serviço antes de ser guardada, criptografada (AES-256-GCM)."
      />
      <div className="mb-4 space-y-2">
        {erro ? <Notice tone="red">{erro}</Notice> : null}
        {ok ? <Notice tone="blue">Conector adicionado e verificado.</Notice> : null}
      </div>

      {(Object.keys(CATEGORIAS_DE_CONECTOR) as CategoriaDeConector[]).map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-900">{CATEGORIAS_DE_CONECTOR[cat].titulo}</h2>
          <p className="mb-3 text-sm text-zinc-500">{CATEGORIAS_DE_CONECTOR[cat].descricao}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {CONNECTORS.filter((d) => d.categoria === cat).map((def) => {
              const mine = connected.filter((c) => c.type === def.type);
              const ligado = def.type === "github" ? Boolean(instalacao) : mine.length > 0;
              return (
                <Card key={def.type}>
                  <CardHeader
                    title={def.name}
                    description={def.description}
                    actions={
                      def.available ? (
                        ligado ? <Badge tone="green">Conectado</Badge> : <Badge>Disponível</Badge>
                      ) : (
                        <Badge tone="amber">Em breve</Badge>
                      )
                    }
                  />
                  <div className="space-y-3 p-5">
                    {def.available && def.uso && !def.href ? <p className="text-xs text-zinc-500">{def.uso}</p> : null}
                    {mine.map((c) => (
                      <div key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                        <span className="truncate">
                          {c.name} <span className="text-xs text-zinc-400">{c.credentialHint}</span>
                        </span>
                        <form action={disconnect}>
                          <input type="hidden" name="id" value={c.id} />
                          <Button variant="ghost" size="sm">
                            Remover
                          </Button>
                        </form>
                      </div>
                    ))}
                    {def.href ? (
                      instalacao ? (
                        <p className="text-sm text-zinc-600">
                          Conta <b>{instalacao.accountLogin}</b> ligada pelo app Forja Agentes.{" "}
                          <Link href={def.href} className="font-medium underline">
                            Gerenciar em Agente
                          </Link>
                        </p>
                      ) : (
                        <Link href={def.href} className={buttonClass("secondary", "sm")}>
                          Conectar em Agente
                        </Link>
                      )
                    ) : def.available ? (
                      <form action={connect} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <input type="hidden" name="type" value={def.type} />
                        <div className="flex-1">
                          <Field label={def.credentialLabel} hint={def.credentialHint}>
                            <input name="credential" type="password" autoComplete="off" required className={inputClass} />
                          </Field>
                        </div>
                        <Button type="submit" variant="secondary" className="sm:mb-5">
                          Conectar
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
