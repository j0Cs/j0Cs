import { buttonClass, cx } from "@forja/ui";
import { CabecalhoDoSite, RodapeDoSite } from "@/components/site/cabecalho";

export const metadata = { title: "Suporte", description: "Fale com a equipe da Forja por e-mail ou WhatsApp." };

/** Canais definidos por variável de ambiente (SUPORTE_EMAIL e SUPORTE_WHATSAPP, só dígitos com DDI). */
function canais() {
  const email = (process.env.SUPORTE_EMAIL || "").trim();
  const whats = (process.env.SUPORTE_WHATSAPP || "").replace(/\D/g, "");
  return { email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null, whats: whats.length >= 10 ? whats : null };
}

export default function SuportePage() {
  const { email, whats } = canais();
  return (
    <div className="acesso relative flex min-h-dvh flex-col">
      <CabecalhoDoSite />
      <main className="relative mx-auto w-full max-w-4xl flex-1 px-6 pb-24 pt-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">Suporte</p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,7vw,4.5rem)] font-extrabold uppercase leading-[0.9] text-aco-100">
          Fale com <span className="text-brasa">quem constrói</span>
        </h1>
        <p className="mt-4 max-w-2xl text-aco-300">
          No beta, quem responde é a própria equipe da Forja, em português. Dias úteis, das 9h às 18h (Brasília).
        </p>

        {email || whats ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {whats ? (
              <div className="rounded-lg border border-aco-700 bg-aco-850/70 p-6">
                <h2 className="font-display text-2xl font-extrabold uppercase text-aco-100">WhatsApp</h2>
                <p className="mt-2 text-sm text-aco-300">O caminho mais rápido para dúvidas e travamentos.</p>
                <a href={`https://wa.me/${whats}`} target="_blank" rel="noreferrer" className={cx(buttonClass("brasa"), "mt-5 py-2.5")}>
                  Abrir conversa <span aria-hidden>→</span>
                </a>
              </div>
            ) : null}
            {email ? (
              <div className="rounded-lg border border-aco-700 bg-aco-850/70 p-6">
                <h2 className="font-display text-2xl font-extrabold uppercase text-aco-100">E-mail</h2>
                <p className="mt-2 text-sm text-aco-300">Para cobrança, notas fiscais e pedidos com mais detalhe.</p>
                <a href={`mailto:${email}`} className={cx(buttonClass("aco"), "mt-5 py-2.5")}>
                  {email}
                </a>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-10 rounded-r-md border-l-2 border-palha bg-palha/10 px-4 py-3 text-sm text-palha">
            Os canais de suporte estão sendo configurados. Enquanto isso, responda o e-mail de boas-vindas que você recebeu ao criar a conta.
          </p>
        )}

        <h2 className="mt-14 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">Para a gente resolver mais rápido</h2>
        <ul className="mt-3 space-y-2 text-sm text-aco-100">
          <li className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
            Diga o e-mail da sua conta e o nome do projeto.
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
            Conte o que você tentou fazer e a mensagem que apareceu (uma captura de tela ajuda).
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brasa" />
            Antes, veja se há instabilidade na{" "}
            <a href="/status" className="font-medium text-brasa-claro underline-offset-4 hover:underline">
              página de status
            </a>
            .
          </li>
        </ul>
      </main>
      <RodapeDoSite />
    </div>
  );
}
