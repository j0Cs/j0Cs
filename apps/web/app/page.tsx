import { formatBrlCents, TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { asc, eq, getDb, schema } from "@forja/db";
import { buttonClass, cx, linkAcessoClass, Marca } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata = {
  title: `${APP_NAME} · Oficina de software com IA`,
  description:
    "Descreva o sistema que você quer. Claude, GPT, Gemini e Grok planejam, escrevem o código, revisam e colocam no ar, cobrado em reais.",
};

/** As etapas da régua de têmpera: o caminho real de um pedido dentro da Forja. */
const ETAPAS = [
  { nome: "Ideia", grau: "220 °C", cor: "bg-palha", texto: "Escreva o pedido no chat ou entre numa call com o Hefesto, o agente de voz. Ele pergunta, debate e fecha o escopo com você." },
  { nome: "Plano", grau: "240 °C", cor: "bg-bronze", texto: "O agente lê o seu repositório e escreve o plano antes de mexer em qualquer arquivo. Você vê o custo subir passo a passo, com teto de gasto." },
  { nome: "Código", grau: "270 °C", cor: "bg-pavao", texto: "As mudanças chegam como diff para você aprovar. Só depois da aprovação o pull request é aberto no seu GitHub." },
  { nome: "Revisão", grau: "300 °C", cor: "bg-revenido", texto: "QA e segurança revisam o pull request, apontam bugs, testes que faltam e vulnerabilidades, e dão um veredito." },
  { nome: "No ar", grau: "1.100 °C", cor: "bg-brasa", texto: "Preview publicado na sua Vercel e migrações aplicadas no seu Supabase, com a sua confirmação. O link volta para a conversa." },
];

const TIME = [
  { cargo: "Dev Sênior", faz: "Explica o projeto, avalia a arquitetura e monta o plano de melhorias por impacto e esforço." },
  { cargo: "Dev Pleno", faz: "Implementa no padrão do seu código, com testes, e aponta melhorias por onde passa." },
  { cargo: "QA Pleno", faz: "Procura bugs e casos de borda, avalia os testes e revisa cada pull request." },
  { cargo: "Cyber Security Pleno", faz: "Encontra vulnerabilidades exploráveis e entrega a correção, com atenção à LGPD." },
];

const MODELOS = ["Claude", "GPT", "Gemini", "Grok"];

function Sobre({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">{children}</p>;
}
function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-3 font-display text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold uppercase leading-[0.9] text-aco-100">{children}</h2>;
}

export default async function Home() {
  const user = await getAuthUser().catch(() => null);
  if (user) redirect("/central");
  const planos = await getDb()
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.active, true))
    .orderBy(asc(schema.plans.sortOrder))
    .then((ps) => ps.filter((p) => p.priceBrlCents > 0 && p.id !== TRIAL_PLAN_ID))
    .catch(() => []);

  return (
    <div className="acesso relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-x-0 top-0 h-[60rem]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <Marca size={34} className="text-aco-100" />
          <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <a href="#como-funciona" className={cx(linkAcessoClass(), "hidden md:inline")}>
            Como funciona
          </a>
          <a href="#time" className={cx(linkAcessoClass(), "hidden md:inline")}>
            O time
          </a>
          <Link href="/precos" className={cx(linkAcessoClass(), "hidden sm:inline")}>
            Preços
          </Link>
          <Link href="/entrar" className={linkAcessoClass()}>
            Entrar
          </Link>
          <Link href="/cadastro" className={cx(buttonClass("brasa", "sm"), "px-3.5 py-2 text-sm")}>
            Começar grátis
          </Link>
        </nav>
      </header>

      <main className="relative">
        {/* abertura */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          <div className="anim-surgir">
            <Sobre>Oficina de software com IA · feita no Brasil</Sobre>
            <h1 className="mt-4 font-display text-[clamp(3.25rem,9vw,7rem)] font-extrabold uppercase leading-[0.84] text-aco-100">
              Descreva o sistema.
              <br />
              <span className="text-brasa">A Forja constrói.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-aco-300">
              Claude, GPT, Gemini e Grok planejam, escrevem o código no seu GitHub, revisam e colocam no ar. Você aprova cada passo e paga em
              reais, por Pix ou cartão.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/cadastro" className={cx(buttonClass("brasa"), "px-6 py-3 text-base")}>
                Começar grátis <span aria-hidden>→</span>
              </Link>
              <Link href="/precos" className={cx(buttonClass("aco"), "px-6 py-3 text-base")}>
                Ver planos e preços
              </Link>
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
              {TRIAL_DAYS} dias grátis · R$ 10 em créditos · sem cartão
            </p>
          </div>

          {/* a bancada: um pedido de exemplo percorrendo as etapas */}
          <figure className="rounded-lg border border-aco-700 bg-aco-850/85 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]">
            <figcaption className="flex items-center justify-between border-b border-aco-700 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
              <span>Tarefa do agente · exemplo</span>
              <span className="text-palha">R$ 0,84 de R$ 20,00</span>
            </figcaption>
            <div className="space-y-4 p-5 text-sm">
              <p className="rounded-md border border-aco-700 bg-aco-950/70 px-4 py-3 text-aco-100">
                “Crie uma página de agendamento para a clínica, com lembrete por WhatsApp e painel do dono.”
              </p>
              <ol className="space-y-2.5">
                {[
                  ["Plano", "5 passos: tabela de horários, página, lembrete, painel, testes"],
                  ["Código", "7 arquivos alterados · diff pronto para você aprovar"],
                  ["Pull request", "aberto no GitHub da clínica"],
                  ["Revisão de QA", "seguir com ajustes · 2 achados"],
                  ["Preview", "publicado na Vercel · link na conversa"],
                ].map(([nome, detalhe], i) => (
                  <li key={nome} className="flex items-start gap-3">
                    <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", ETAPAS[i]!.cor)} />
                    <span>
                      <span className="font-medium text-aco-100">{nome}</span> <span className="text-aco-300">· {detalhe}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </figure>
        </section>

        {/* modelos */}
        <section className="border-y border-aco-800 bg-aco-950/40">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-3 px-6 py-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">Os modelos num só lugar</p>
            <ul className="flex flex-wrap gap-x-10 gap-y-2 font-display text-3xl font-extrabold uppercase tracking-[0.08em] text-aco-100">
              {MODELOS.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="text-sm text-aco-300">Troque de modelo a cada conversa. O custo aparece em reais.</p>
          </div>
        </section>

        {/* a régua de têmpera */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
          <Sobre>Régua de têmpera</Sobre>
          <Titulo>
            Do pedido ao ar, <span className="text-brasa">em cinco calores</span>
          </Titulo>
          <p className="mt-5 max-w-2xl text-aco-300">
            O aço muda de cor conforme esquenta: palha, bronze, roxo, azul. Cada cor marca um ponto da têmpera. Na Forja, cada uma marca uma
            etapa do seu sistema.
          </p>
          <div aria-hidden className="relative mt-12 hidden h-1.5 rounded-full bg-aco-800 lg:block">
            {/* abaixo da dobra: a régua já aparece inteira, sem animação */}
            <div className="regua-faixa absolute inset-0 rounded-full" style={{ animation: "none" }} />
          </div>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:mt-6 lg:grid-cols-5 lg:gap-6">
            {ETAPAS.map((e) => (
              <li key={e.nome}>
                <span aria-hidden className={cx("mb-3 block h-1.5 w-12 rounded-full lg:hidden", e.cor)} />
                <p className="font-mono text-[11px] text-aco-300">{e.grau}</p>
                <h3 className="mt-1 font-display text-2xl font-extrabold uppercase tracking-[0.04em] text-aco-100">{e.nome}</h3>
                <p className="mt-2 text-sm leading-relaxed text-aco-300">{e.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* o time */}
        <section id="time" className="scroll-mt-8 border-y border-aco-800 bg-aco-950/40">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Sobre>Time de especialistas</Sobre>
            <Titulo>
              Quatro papéis, <span className="text-brasa">um parecer cada</span>
            </Titulo>
            <p className="mt-5 max-w-2xl text-aco-300">
              Na auditoria do projeto e na revisão de cada pull request, as IAs da Forja trabalham por papel. Cada achado diz quem encontrou,
              onde está e como corrigir.
            </p>
            <ul className="mt-10 grid gap-px overflow-hidden rounded-lg border border-aco-700 bg-aco-700 sm:grid-cols-2 lg:grid-cols-4">
              {TIME.map((t) => (
                <li key={t.cargo} className="bg-aco-900 p-6">
                  <h3 className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.03em] text-aco-100">{t.cargo}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-aco-300">{t.faz}</p>
                </li>
              ))}
            </ul>

            <div className="mt-10 grid gap-8 rounded-lg border border-aco-700 bg-aco-850/70 p-7 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div>
                <h3 className="font-display text-3xl font-extrabold uppercase leading-none text-aco-100">Já assina Claude Code, Codex ou Gemini?</h3>
                <p className="mt-3 text-sm leading-relaxed text-aco-300">
                  Continue construindo com o seu plano, na sua máquina. A Forja entra como o time e o QA.
                </p>
              </div>
              <ul className="space-y-3 text-sm text-aco-100">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
                  Instala o time de especialistas no seu repositório, pronto para a sua ferramenta.
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
                  Revisa os pull requests que a sua ferramenta abrir e publica o parecer neles.
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
                  Mostra para onde vão os tokens da equipe e como gastar menos.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* preços */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Sobre>Preços</Sobre>
          <Titulo>
            Em reais, <span className="text-brasa">com créditos todo mês</span>
          </Titulo>
          <p className="mt-5 max-w-2xl text-aco-300">
            Cada resposta debita o custo real do modelo usado. Quando os créditos acabam, você recarrega por Pix e o saldo entra na hora.
          </p>
          {planos.length ? (
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {planos.map((p) => (
                <li key={p.id} className={cx("rounded-lg border bg-aco-850/70 p-6", p.id === "pro" ? "border-brasa/70" : "border-aco-700")}>
                  <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.04em] text-aco-100">{p.name}</h3>
                  <p className="mt-3 text-3xl font-semibold tabular-nums text-aco-100">
                    {formatBrlCents(p.priceBrlCents)}
                    <span className="text-sm font-normal text-aco-300">{p.minSeats ? "/assento/mês" : "/mês"}</span>
                  </p>
                  <p className="mt-2 text-sm text-aco-300">
                    {formatBrlCents(p.includedCreditsBrlCents)} em créditos{p.minSeats ? " por assento" : ""} todo mês
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/precos" className={cx(linkAcessoClass(true), "mt-8 inline-block text-sm")}>
            Comparar os planos em detalhe →
          </Link>
        </section>

        {/* fecho */}
        <section className="border-t border-aco-800">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <Marca size={64} className="mx-auto text-aco-100" />
            <p className="mt-6 font-display text-[clamp(2.5rem,7vw,5rem)] font-extrabold uppercase leading-[0.88] text-aco-100">
              Acenda <span className="text-brasa">a forja</span>
            </p>
            <p className="mx-auto mt-5 max-w-lg text-aco-300">
              Crie a conta, descreva o primeiro sistema e veja o plano sair em minutos. O teste dura {TRIAL_DAYS} dias e não pede cartão.
            </p>
            <Link href="/cadastro" className={cx(buttonClass("brasa"), "mt-8 px-7 py-3 text-base")}>
              Começar grátis <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-aco-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
          <span>
            {APP_NAME} · oficina de software
          </span>
          <span className="flex gap-6">
            <Link href="/precos" className={linkAcessoClass()}>
              Preços
            </Link>
            <Link href="/entrar" className={linkAcessoClass()}>
              Entrar
            </Link>
            <Link href="/cadastro" className={linkAcessoClass()}>
              Criar conta
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
