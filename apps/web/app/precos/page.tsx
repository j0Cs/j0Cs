import { PACOTES_DE_RECARGA_CENTAVOS } from "@forja/billing";
import { formatBrlCents, TIER_LABELS, TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { asc, eq, getDb, schema } from "@forja/db";
import { buttonClass, cx, linkAcessoClass, Marca } from "@forja/ui";
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
    <div className="acesso relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-x-0 top-0 h-[50rem]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <Marca size={34} className="text-aco-100" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          {user ? (
            <Link href="/central" className={cx(buttonClass("brasa", "sm"), "px-3.5 py-2 text-sm")}>
              Abrir a {APP_NAME}
            </Link>
          ) : (
            <>
              <Link href="/entrar" className={linkAcessoClass()}>
                Entrar
              </Link>
              <Link href="/cadastro" className={cx(buttonClass("brasa", "sm"), "px-3.5 py-2 text-sm")}>
                Começar grátis
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        <section className="py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">Planos e preços</p>
          <h1 className="mt-3 font-display text-[clamp(2.75rem,7vw,5rem)] font-extrabold uppercase leading-[0.88] text-aco-100">
            Pague em reais <span className="text-brasa">pelo que usar</span>
          </h1>
          <p className="mt-5 max-w-2xl text-aco-300">
            Claude, GPT, Gemini e Grok num só lugar. Cada plano traz créditos todo mês; quando precisar de mais, recarregue por Pix.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {pagos.map((p) => {
            const porAssento = Boolean(p.minSeats);
            const ehDestaque = p.id === destaque;
            return (
              <div key={p.id} className={cx("flex flex-col rounded-lg border bg-aco-850/70 p-6", ehDestaque ? "border-brasa/70" : "border-aco-700")}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.04em] text-aco-100">{p.name}</h2>
                  {ehDestaque ? (
                    <span className="shrink-0 rounded-full border border-brasa/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brasa-claro">
                      Mais escolhido
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-3xl font-semibold tabular-nums text-aco-100">
                  {formatBrlCents(p.priceBrlCents)}
                  <span className="text-sm font-normal text-aco-300">{porAssento ? "/assento/mês" : "/mês"}</span>
                </p>
                <p className="mt-1 text-sm text-aco-100">
                  {formatBrlCents(p.includedCreditsBrlCents)} em créditos{porAssento ? " por assento" : ""} todo mês
                </p>
                <p className="mt-4 text-sm leading-relaxed text-aco-300">{p.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.allowedTiers.map((t) => (
                    <span key={t} className="rounded border border-aco-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-aco-300">
                      {TIER_LABELS[t]}
                    </span>
                  ))}
                </div>
                <div className="mt-auto pt-6">
                  <Link href={user ? "/plano#planos" : "/cadastro"} className={cx(buttonClass(ehDestaque ? "brasa" : "aco"), "w-full py-2.5")}>
                    {user ? `Assinar o ${p.name.split(" ")[0]}` : "Começar o teste grátis"}
                  </Link>
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-6 rounded-lg border border-aco-700 bg-aco-850/70 p-6 text-sm leading-relaxed text-aco-300">
          <p>
            <b className="font-medium text-aco-100">Recargas avulsas</b> por Pix ou cartão:{" "}
            {PACOTES_DE_RECARGA_CENTAVOS.map((v) => formatBrlCents(v)).join(", ")}. O crédito entra na hora.{" "}
            <b className="font-medium text-aco-100">Teste grátis</b>: {TRIAL_DAYS} dias com R$ 10 em créditos, sem cartão.
          </p>
        </section>

        <section className="mx-auto mt-20 max-w-3xl">
          <h2 className="mb-6 font-display text-4xl font-extrabold uppercase leading-none text-aco-100">Perguntas frequentes</h2>
          <dl className="divide-y divide-aco-800 border-y border-aco-800">
            {PERGUNTAS.map((q) => (
              <div key={q.p} className="py-5">
                <dt className="font-medium text-aco-100">{q.p}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-aco-300">{q.r}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">Preços em reais, cobrados mensalmente.</p>
        </section>
      </main>
    </div>
  );
}
