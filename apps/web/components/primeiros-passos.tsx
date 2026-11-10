import { TRIAL_PLAN_ID } from "@forja/core";
import { eq, schema, sql, type Db } from "@forja/db";
import { Card, cx } from "@forja/ui";
import { Check } from "lucide-react";
import Link from "next/link";

/**
 * Guia de primeiros passos: do cadastro à primeira resposta. Some sozinho quando os passos
 * essenciais estão feitos (assinar um plano é opcional enquanto durar o teste).
 */
export async function PrimeirosPassos({ db, org, emailConfirmado }: { db: Db; org: { id: string; planId: string | null }; emailConfirmado: boolean }) {
  const [linha] = await db
    .select({
      projeto: sql<string | null>`(select p.id::text from projects p where p.org_id = ${org.id} and p.archived_at is null order by p.created_at limit 1)`,
      respostas: sql<number>`(select count(*)::int from usage_events e where e.org_id = ${org.id} and e.status = 'ok')`,
      github: sql<number>`(select count(*)::int from github_installations g where g.org_id = ${org.id})`,
      ias: sql<number>`(select count(*)::int from ai_telemetry_sources f where f.org_id = ${org.id} and f.revoked_at is null)`,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, org.id));
  const projeto = linha?.projeto ?? null;
  const passos = [
    { feito: emailConfirmado, titulo: "Confirme seu e-mail", texto: "Abra o link que mandamos. Sem isso os modelos não respondem.", href: null as string | null, acao: "" },
    {
      feito: (linha?.ias ?? 0) > 0,
      titulo: "Conecte uma conta de IA",
      texto: "Claude, ChatGPT, Gemini ou Grok que você já paga: a Forja mostra os tokens e o gasto de cada uma.",
      href: "/assistentes",
      acao: "Conectar",
    },
    { feito: Boolean(projeto), titulo: "Crie o primeiro projeto", texto: "Um projeto guarda as conversas, as instruções e o repositório de um sistema.", href: "#novo-projeto", acao: "Criar projeto" },
    {
      feito: (linha?.respostas ?? 0) > 0,
      titulo: "Faça o primeiro pedido",
      texto: "Descreva o que quer construir, no chat do projeto ou numa call com o Hefesto.",
      href: projeto ? `/projetos/${projeto}` : null,
      acao: "Abrir o chat",
    },
    { feito: (linha?.github ?? 0) > 0, titulo: "Conecte o GitHub", texto: "Com o repositório ligado, o agente abre pull requests e a Forja audita o código.", href: "/agente", acao: "Conectar" },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;
  const proximo = passos.findIndex((p) => !p.feito);
  const assinante = Boolean(org.planId && org.planId !== TRIAL_PLAN_ID);

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Primeiros passos</h2>
          <p className="text-sm text-zinc-500">Da conta criada à primeira resposta em menos de 10 minutos.</p>
        </div>
        <div className="flex items-center gap-3" aria-label={`${feitos} de ${passos.length} passos feitos`}>
          <span className="h-2 w-32 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(feitos / passos.length) * 100}%` }} />
          </span>
          <span className="text-xs tabular-nums text-zinc-500">
            {feitos} de {passos.length}
          </span>
        </div>
      </div>
      <ol className="divide-y divide-zinc-100">
        {passos.map((p, i) => (
          <li key={p.titulo} className={cx("flex items-start gap-3 px-5 py-3.5", p.feito && "opacity-60")}>
            <span
              aria-hidden
              className={cx(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-medium",
                p.feito ? "bg-green-600 text-white" : i === proximo ? "bg-brand-600 text-white" : "border border-zinc-300 text-zinc-500",
              )}
            >
              {p.feito ? <Check size={12} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cx("text-sm font-medium text-zinc-900", p.feito && "line-through")}>{p.titulo}</p>
              {!p.feito ? <p className="text-sm text-zinc-500">{p.texto}</p> : null}
            </div>
            {!p.feito && i === proximo && p.href ? (
              <Link href={p.href} className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700">
                {p.acao}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      {!assinante ? (
        <p className="border-t border-zinc-100 px-5 py-3 text-xs text-zinc-500">
          Você está no teste grátis. Quando quiser continuar,{" "}
          <Link href="/plano" className="font-medium text-zinc-900 underline">
            escolha um plano
          </Link>
          .
        </p>
      ) : null}
    </Card>
  );
}
