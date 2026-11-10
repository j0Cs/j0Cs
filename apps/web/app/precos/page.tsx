import { PACOTES_DE_RECARGA_CENTAVOS } from "@forja/billing";
import { formatBrlCents, TIER_LABELS, TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { asc, eq, getDb, schema } from "@forja/db";
import { Badge, buttonClass, cx, Marca } from "@forja/ui";
import Link from "next/link";
import { getAuthUser } from "@/lib/session";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata = {
  title: `Preços · ${APP_NAME}`,
  description: "Planos em reais com créditos inclusos todo mês. Claude, GPT, Gemini e Grok num só lugar.",
};

const PERGUNTAS = [
  {
    p: "Como funcionam os créditos?",
    r: "Cada plano inclui créditos em reais todo mês. Cada resposta debita o custo real do modelo usado, e você acompanha tudo em Custos e uso. Os créditos do plano valem até a renovação.",
  },
  {
    p: "E se os créditos acabarem?",
    r: "Você recarrega por Pix ou cartão e o crédito entra na hora. R$ 1 pago vira R$ 1 em créditos. Avisamos por e-mail quando restam 20% e 5%.",
  },
  {
    p: "Como pago a assinatura?",
    r: "Cartão (Visa e Mastercard) ou boleto, cobrado todo mês. Você troca o cartão, baixa as faturas e cancela pelo portal de pagamentos; o plano vale até o fim do mês já pago.",
  },
  {
    p: "Posso mudar de plano?",
    r: "Sim. Para um plano maior vale na hora e você paga só a diferença proporcional. Para um menor, vale na renovação.",
  },
  {
    p: "O que tem no teste grátis?",
    r: `${TRIAL_DAYS} dias com R$ 10 em créditos e os modelos econômicos, sem cartão. Seus projetos continuam salvos quando o teste termina.`,
  },
];

export default async function PrecosPage() {
  const [user, plans] = await Promise.all([
    getAuthUser().catch(() => null),
    getDb().select().from(schema.plans).where(eq(schema.plans.active, true)).orderBy(asc(schema.plans.sortOrder)),
  ]);
  const pagos = plans.filter((p) => p.priceBrlCents > 0 && p.id !== TRIAL_PLAN_ID);
  const destaque = "pro";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Marca size={30} className="text-zinc-900" />
          <span className="font-semibold">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/central" className={buttonClass("primary", "sm")}>
              Abrir a {APP_NAME}
            </Link>
          ) : (
            <>
              <Link href="/entrar" className={buttonClass("ghost", "sm")}>
                Entrar
              </Link>
              <Link href="/cadastro" className={buttonClass("primary", "sm")}>
                Começar grátis
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20">
        <section className="py-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pague em reais pelo que usar</h1>
          <p className="mx-auto mt-3 max-w-2xl text-zinc-600">
            Claude, GPT, Gemini e Grok num só lugar. Cada plano traz créditos todo mês; quando precisar de mais, recarregue por Pix.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pagos.map((p) => {
            const porAssento = Boolean(p.minSeats);
            const ehDestaque = p.id === destaque;
            return (
              <div
                key={p.id}
                className={cx(
                  "flex flex-col rounded-xl border bg-white p-6 shadow-sm",
                  ehDestaque ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  {ehDestaque ? <Badge tone="brand">Mais escolhido</Badge> : null}
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {formatBrlCents(p.priceBrlCents)}
                  <span className="text-sm font-normal text-zinc-500">{porAssento ? "/assento/mês" : "/mês"}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {formatBrlCents(p.includedCreditsBrlCents)} em créditos{porAssento ? " por assento" : ""} todo mês
                </p>
                <p className="mt-4 text-sm text-zinc-600">{p.description}</p>
                <div className="mt-4 flex flex-wrap gap-1">
                  {p.allowedTiers.map((t) => (
                    <Badge key={t}>{TIER_LABELS[t]}</Badge>
                  ))}
                </div>
                <div className="mt-auto pt-6">
                  <Link
                    href={user ? "/plano#planos" : "/cadastro"}
                    className={cx(buttonClass(ehDestaque ? "primary" : "secondary"), "w-full")}
                  >
                    {user ? `Assinar o ${p.name.split(" ")[0]}` : "Começar o teste grátis"}
                  </Link>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
          <p>
            <b className="text-zinc-900">Recargas avulsas</b> por Pix ou cartão:{" "}
            {PACOTES_DE_RECARGA_CENTAVOS.map((v) => formatBrlCents(v)).join(", ")}. O crédito entra na hora.{" "}
            <b className="text-zinc-900">Teste grátis</b>: {TRIAL_DAYS} dias com R$ 10 em créditos, sem cartão.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="mb-4 text-lg font-semibold">Perguntas frequentes</h2>
          <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {PERGUNTAS.map((q) => (
              <div key={q.p} className="p-5">
                <dt className="font-medium text-zinc-900">{q.p}</dt>
                <dd className="mt-1 text-sm text-zinc-600">{q.r}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-center text-xs text-zinc-500">Preços em reais, cobrados mensalmente.</p>
        </section>
      </main>
    </div>
  );
}
