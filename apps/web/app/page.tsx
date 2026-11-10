import { formatBrlCents, PLAN_KIND_LABELS, TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { asc, eq, getDb, schema } from "@forja/db";
import { buttonClass, cx, linkAcessoClass, Marca } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bancada } from "@/components/site/bancada";
import { AssinaturaRampin, SecaoRampin } from "@/components/site/rampin";
import { CabecalhoFixo, Revelar } from "@/components/site/revelar";
import { getAuthUser } from "@/lib/session";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

export const metadata = {
  title: `${APP_NAME} · Suas IAs numa só oficina`,
  description:
    "Conecte o Claude, o ChatGPT, o Gemini e o Grok que você já paga e veja para onde vai cada token. Ou deixe a Forja construir, revisar e colocar no ar. Um produto Rampin Technology.",
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

const FAIXA = ["Claude", "ChatGPT", "Gemini", "Grok", "Claude Code", "Codex", "Gemini CLI", "Grok Build", "GitHub", "Vercel", "Supabase"];

const ACHADOS = [
  "Arquitetura: fila de e-mails acoplada ao pedido · impacto alto, esforço médio",
  "src/agenda/slots.ts:48 · horário duplicado quando dois clientes confirmam juntos",
  "Falta teste para cancelamento depois do lembrete enviado",
  "api/agenda/[id] sem checar o dono do registro (IDOR) · CWE-639",
];

const FORMAS = [
  {
    linha: "gestao" as const,
    sobre: "Você já paga uma IA",
    titulo: "Gestão das suas contas",
    texto: "Continue no Claude Code, no Codex, no Gemini CLI ou no Grok Build, com a sua assinatura. A Forja cuida do resto.",
    itens: ["Tokens e gasto por ferramenta, modelo, dia e pessoa", "Recomendações para gastar menos, com o número que justificou cada uma", "Time de especialistas instalado no seu repositório", "Auditoria do projeto e revisão de QA dos pull requests"],
    acao: "Começar pela Gestão",
  },
  {
    linha: "construcao" as const,
    sobre: "Você quer delegar",
    titulo: "A Forja constrói",
    texto: "Descreva o sistema por texto ou por voz. O agente escreve o código no seu GitHub com os nossos modelos, pagos em créditos.",
    itens: ["Plano antes de tocar em qualquer arquivo, com teto de gasto", "Diff para você aprovar e pull request no seu GitHub", "Preview na sua Vercel e migrações no seu Supabase", "Tudo da Gestão incluído"],
    acao: "Começar a construir",
  },
];

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
  const aPartirDe = (linha: "gestao" | "construcao") => {
    const precos = planos.filter((p) => (p.kind === "gestao") === (linha === "gestao")).map((p) => p.priceBrlCents);
    return precos.length ? Math.min(...precos) : null;
  };

  return (
    <div className="acesso relative min-h-dvh overflow-x-clip">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-x-0 top-0 h-[60rem]" />

      <CabecalhoFixo className="cabecalho-fixo sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Marca size={34} className="text-aco-100" />
            <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <a href="#formas" className={cx(linkAcessoClass(), "hidden md:inline")}>
              Duas formas de usar
            </a>
            <a href="#como-funciona" className={cx(linkAcessoClass(), "hidden lg:inline")}>
              Como funciona
            </a>
            <a href="#time" className={cx(linkAcessoClass(), "hidden lg:inline")}>
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
        </div>
      </CabecalhoFixo>

      <main className="relative">
        {/* abertura */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:pt-14">
          <div className="anim-surgir">
            <AssinaturaRampin />
            <h1 className="mt-5 font-display text-[clamp(3.25rem,9vw,7rem)] font-extrabold uppercase leading-[0.84] text-aco-100">
              Suas IAs,
              <br />
              <span className="text-brasa">uma só oficina.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-aco-300">
              Conecte o Claude, o ChatGPT, o Gemini e o Grok que você já paga e veja para onde vai cada token. Ou deixe a Forja construir: o agente escreve o código no seu
              GitHub, o time revisa e o sistema vai ao ar. Tudo em reais.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/cadastro" className={cx(buttonClass("brasa"), "px-6 py-3 text-base")}>
                Começar grátis <span aria-hidden>→</span>
              </Link>
              <a href="#formas" className={cx(buttonClass("aco"), "px-6 py-3 text-base")}>
                Ver as duas formas de usar
              </a>
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
              {TRIAL_DAYS} dias grátis · R$ 10 em créditos · sem cartão
            </p>
          </div>
          <div className="anim-surgir [animation-delay:180ms]">
            <Bancada />
          </div>
        </section>

        {/* faixa rolante */}
        <section aria-label="Modelos, ferramentas e serviços que a Forja conecta" className="overflow-hidden border-y border-aco-800 bg-aco-950/40 py-5">
          <ul className="faixa-rolante font-display text-2xl font-extrabold uppercase tracking-[0.08em] text-aco-100 sm:text-3xl">
            {[...FAIXA, ...FAIXA].map((m, i) => (
              <li key={`${m}-${i}`} aria-hidden={i >= FAIXA.length} className="flex items-center whitespace-nowrap">
                <span className="px-7">{m}</span>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brasa" />
              </li>
            ))}
          </ul>
        </section>

        {/* duas formas de usar */}
        <section id="formas" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Revelar>
            <Sobre>Duas formas de usar</Sobre>
            <Titulo>
              Com a sua conta <span className="text-brasa">ou com a nossa</span>
            </Titulo>
            <p className="mt-5 max-w-2xl text-aco-300">
              Quem já assina uma IA não precisa pagar tokens duas vezes. Quem quer delegar a construção paga só pelo que o agente usar.
            </p>
          </Revelar>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {FORMAS.map((f, i) => {
              const preco = aPartirDe(f.linha);
              return (
                <Revelar key={f.linha} atraso={i * 120} className={cx("cartao-vivo flex flex-col rounded-lg border bg-aco-850/70 p-7", f.linha === "construcao" ? "border-brasa/40" : "border-aco-700")}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">{f.sobre}</p>
                  <h3 className="mt-2 font-display text-4xl font-extrabold uppercase leading-none text-aco-100">{f.titulo}</h3>
                  <p className="mt-3 text-aco-300">{f.texto}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-aco-100">
                    {f.itens.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", f.linha === "construcao" ? "bg-brasa" : "bg-revenido")} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-7">
                    {preco !== null ? (
                      <p className="text-sm text-aco-300">
                        a partir de <b className="text-2xl font-semibold tabular-nums text-aco-100">{formatBrlCents(preco)}</b>/mês
                      </p>
                    ) : (
                      <span />
                    )}
                    <Link href="/cadastro" className={cx(buttonClass(f.linha === "construcao" ? "brasa" : "aco"), "px-5 py-2.5")}>
                      {f.acao} <span aria-hidden>→</span>
                    </Link>
                  </div>
                </Revelar>
              );
            })}
          </div>
          <Revelar atraso={200}>
            <Link href="/precos" className={cx(linkAcessoClass(true), "mt-8 inline-block text-sm")}>
              Comparar todos os planos ({PLAN_KIND_LABELS.gestao.nome} e {PLAN_KIND_LABELS.construcao.nome}) →
            </Link>
          </Revelar>
        </section>

        {/* a régua de têmpera */}
        <section id="como-funciona" className="scroll-mt-24 border-y border-aco-800 bg-aco-950/40">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <Revelar>
              <Sobre>Régua de têmpera</Sobre>
              <Titulo>
                Do pedido ao ar, <span className="text-brasa">em cinco calores</span>
              </Titulo>
              <p className="mt-5 max-w-2xl text-aco-300">
                O aço muda de cor conforme esquenta: palha, bronze, roxo, azul. Cada cor marca um ponto da têmpera. Na Forja, cada uma marca uma etapa do seu sistema.
              </p>
            </Revelar>
            <Revelar className="mt-12 hidden lg:block">
              <div aria-hidden className="relative h-1.5 rounded-full bg-aco-800">
                <div className="regua-faixa regua-viva absolute inset-0 rounded-full" style={{ animation: "none" }} />
              </div>
            </Revelar>
            <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:mt-6 lg:grid-cols-5 lg:gap-6">
              {ETAPAS.map((e, i) => (
                <Revelar como="li" key={e.nome} atraso={i * 110}>
                  <span aria-hidden className={cx("mb-3 block h-1.5 w-12 rounded-full lg:hidden", e.cor)} />
                  <p className="font-mono text-[11px] text-aco-300">{e.grau}</p>
                  <h3 className="mt-1 font-display text-2xl font-extrabold uppercase tracking-[0.04em] text-aco-100">{e.nome}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-aco-300">{e.texto}</p>
                </Revelar>
              ))}
            </ol>
          </div>
        </section>

        {/* o time */}
        <section id="time" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24">
          <Revelar>
            <Sobre>Time de especialistas</Sobre>
            <Titulo>
              Quatro papéis, <span className="text-brasa">um parecer cada</span>
            </Titulo>
            <p className="mt-5 max-w-2xl text-aco-300">
              Na auditoria do projeto e na revisão de cada pull request, as IAs da Forja trabalham por papel. Cada achado diz quem encontrou, onde está e como corrigir.
            </p>
          </Revelar>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIME.map((t, i) => (
              <Revelar como="li" key={t.cargo} atraso={i * 100} className="cartao-vivo flex flex-col rounded-lg border border-aco-700 bg-aco-900 p-6">
                <h3 className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.03em] text-aco-100">{t.cargo}</h3>
                <p className="mt-3 text-sm leading-relaxed text-aco-300">{t.faz}</p>
                <p className="mt-auto border-t border-aco-800 pt-4 font-mono text-[11px] leading-relaxed text-aco-300">
                  <span className="text-palha">exemplo de achado</span>
                  <br />
                  {ACHADOS[i]}
                </p>
              </Revelar>
            ))}
          </ul>
        </section>

        {/* app para computador */}
        <section className="border-y border-aco-800 bg-aco-950/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
            <Revelar>
              <Sobre>App para macOS e Windows</Sobre>
              <Titulo>
                A Forja na <span className="text-brasa">sua máquina</span>
              </Titulo>
              <p className="mt-5 max-w-xl text-aco-300">
                O app acha o Claude Code, o Codex e o Gemini CLI instalados e liga a medição de uso com um clique, mostrando antes o que muda. Também lê uma pasta de
                projeto e instala o time nos arquivos, sem enviar o seu código para fora.
              </p>
              <Link href="/baixar" className={cx(buttonClass("aco"), "mt-7 px-6 py-3 text-base")}>
                Baixar o app <span aria-hidden>↓</span>
              </Link>
            </Revelar>
            <Revelar atraso={150}>
              <div className="overflow-hidden rounded-lg border border-aco-700 bg-aco-850/85 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]">
                <div className="flex items-center gap-1.5 border-b border-aco-700 px-4 py-3">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-aco-700" />
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-aco-700" />
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-aco-700" />
                  <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.16em] text-aco-300">Forja · Este computador</span>
                </div>
                <ul className="divide-y divide-aco-800 text-sm">
                  {[
                    ["Claude Code", "~/.claude/settings.json", "enviando para a Forja", "text-revenido"],
                    ["Codex", "~/.codex/config.toml", "enviando para a Forja", "text-revenido"],
                    ["Gemini CLI", "~/.gemini/settings.json", "ligar com um clique", "text-brasa-claro"],
                  ].map(([nome, arquivo, estado, cor]) => (
                    <li key={nome} className="flex items-center justify-between gap-4 px-5 py-3.5">
                      <span>
                        <span className="block font-medium text-aco-100">{nome}</span>
                        <span className="font-mono text-[11px] text-aco-300">{arquivo}</span>
                      </span>
                      <span className={cx("font-mono text-[11px] uppercase tracking-[0.12em]", cor)}>{estado}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Revelar>
          </div>
        </section>

        {/* quem faz */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <Revelar>
            <SecaoRampin />
          </Revelar>
        </section>

        {/* fechamento */}
        <section className="relative overflow-hidden border-t border-aco-800 bg-aco-950/40">
          <div aria-hidden className="brasas pointer-events-none absolute inset-0">
            {[8, 19, 31, 44, 57, 68, 79, 91].map((x, i) => (
              <span key={x} style={{ left: `${x}%`, "--duracao": `${6 + (i % 4) * 1.3}s`, "--espera": `${i * 0.9}s`, "--desvio": `${i % 2 ? -26 : 22}px` } as React.CSSProperties} />
            ))}
          </div>
          <Revelar className="relative mx-auto max-w-6xl px-6 py-24 text-center">
            <Marca size={64} className="mx-auto text-aco-100" />
            <p className="mt-6 font-display text-[clamp(2.5rem,7vw,5rem)] font-extrabold uppercase leading-[0.88] text-aco-100">
              Acenda <span className="text-brasa">a forja</span>
            </p>
            <p className="mx-auto mt-5 max-w-lg text-aco-300">
              Crie a conta, conecte a sua primeira IA ou descreva o primeiro sistema. O teste dura {TRIAL_DAYS} dias e não pede cartão.
            </p>
            <Link href="/cadastro" className={cx(buttonClass("brasa"), "mt-8 px-7 py-3 text-base")}>
              Começar grátis <span aria-hidden>→</span>
            </Link>
          </Revelar>
        </section>
      </main>

      <footer className="relative border-t border-aco-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-5 px-6 py-8 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
          <div className="space-y-2">
            <p>{APP_NAME} · oficina de software</p>
            <AssinaturaRampin />
          </div>
          <span className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/baixar" className={linkAcessoClass()}>
              Baixar o app
            </Link>
            <Link href="/status" className={linkAcessoClass()}>
              Status
            </Link>
            <Link href="/suporte" className={linkAcessoClass()}>
              Suporte
            </Link>
            <Link href="/precos" className={linkAcessoClass()}>
              Preços
            </Link>
            <Link href="/entrar" className={linkAcessoClass()}>
              Entrar
            </Link>
          </span>
        </div>
        <p className="mx-auto max-w-6xl px-6 pb-8 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
          © {new Date().getFullYear()} Rampin Technology. Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
