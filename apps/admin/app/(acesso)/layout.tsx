import type { ReactNode } from "react";
import { TrilhoDeAcesso } from "@/components/trilho";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/** Acesso ao painel do dono: a mesma oficina, mais austera, com as duas etapas à vista. */
export default function AccessLayout({ children }: { children: ReactNode }) {
  return (
    <div className="acesso acesso-dono relative min-h-dvh overflow-hidden">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
        <header className="flex items-center justify-between gap-4">
          <p className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300">· painel do dono</span>
          </p>
          <span className="rounded-full border border-brasa/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brasa-claro">
            Restrito
          </span>
        </header>

        <main className="my-auto py-12">
          <TrilhoDeAcesso />
          <div className="relative mt-6 overflow-hidden rounded-lg border border-aco-700 bg-aco-850/85 p-7 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.8)]">
            <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brasa via-brasa/60 to-transparent" />
            {children}
          </div>
        </main>

        <footer className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-aco-300">
          Verificação em duas etapas obrigatória · tentativas limitadas por IP
        </footer>
      </div>
    </div>
  );
}
