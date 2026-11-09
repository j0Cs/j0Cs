import type { ReactNode } from "react";

/** Título do formulário nas telas de acesso. */
export function TituloDeAcesso({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-[2.6rem] font-extrabold uppercase leading-none tracking-[0.02em] text-aco-100">{children}</h1>
      {sub ? <p className="mt-2.5 text-sm leading-relaxed text-aco-300">{sub}</p> : null}
    </div>
  );
}

/** Divisória "ou" entre o login social e o formulário. */
export function DivisoriaOu() {
  return (
    <div className="my-6 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">
      <span className="h-px flex-1 bg-aco-800" /> ou <span className="h-px flex-1 bg-aco-800" />
    </div>
  );
}
