const SITE = "https://rampintechnology.com.br/";

/** Assinatura curta: "um produto Rampin Technology", com a marca da empresa. */
export function AssinaturaRampin({ className = "" }: { className?: string }) {
  return (
    <a
      href={SITE}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300 transition-colors hover:text-aco-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-revenido ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/rampin-technology.png" alt="" width={22} height={22} className="h-[22px] w-[22px] opacity-90" />
      <span>
        um produto <span className="text-aco-100">Rampin Technology</span>
      </span>
    </a>
  );
}

/** Quem está por trás: a empresa que faz a Forja. */
export function SecaoRampin() {
  return (
    <div className="grid gap-10 rounded-lg border border-aco-700 bg-aco-850/70 p-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-14 lg:p-10">
      <a href={SITE} target="_blank" rel="noreferrer" className="flex items-center gap-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-revenido">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rampin-technology.png" alt="Rampin Technology" width={112} height={112} className="h-28 w-28" />
      </a>
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-aco-300">Quem faz a Forja</p>
        <h2 className="mt-3 font-display text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold uppercase leading-[0.9] text-aco-100">
          Um produto <span className="text-revenido">Rampin Technology</span>
        </h2>
        <p className="mt-4 max-w-2xl text-aco-300">
          A Rampin Technology constrói sistemas e sites sob medida, automações com N8N e soluções Microsoft para empresas. A Forja nasceu dentro desses projetos: é o
          jeito de trabalhar com IA que usamos com os nossos clientes, agora aberto para a sua equipe. Da mesma casa do George, o assistente financeiro no WhatsApp.
        </p>
        <a
          href={SITE}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block text-sm font-medium text-brasa-claro underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-revenido"
        >
          Conhecer a Rampin Technology →
        </a>
      </div>
    </div>
  );
}
