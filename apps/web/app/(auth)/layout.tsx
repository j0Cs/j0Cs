import { linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chamada } from "@/components/acesso/chamada";
import { ReguaDeTempera } from "@/components/acesso/regua";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/**
 * Telas de acesso do cliente, no mesmo tema da central: à esquerda a forja (o que é o produto e a
 * régua de têmpera), à direita a bancada com o formulário. No celular, o formulário vem logo
 * depois do título.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="acesso relative min-h-dvh overflow-hidden">
      <div aria-hidden className="oficina-malha pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid min-h-dvh max-w-[90rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(26rem,0.85fr)]">
        <section className="flex flex-col px-6 pt-6 sm:px-10 lg:py-10 lg:pl-14 lg:pr-16">
          <header className="flex items-center justify-between">
            <Link href="/" className={`${linkAcessoClass()} flex items-baseline gap-3 no-underline hover:no-underline`}>
              <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
              <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-aco-300 sm:inline">· oficina de software</span>
            </Link>
            <Link href="/precos" className={`${linkAcessoClass()} font-mono text-[11px] uppercase tracking-[0.2em] lg:hidden`}>
              Planos e preços
            </Link>
          </header>

          <div className="mt-12 lg:my-auto lg:pt-10">
            <Chamada />
            <ReguaDeTempera className="mt-14 hidden max-w-xl sm:block" />
          </div>

          <footer className="mt-10 hidden items-center justify-between gap-6 border-t border-aco-800 pt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300 lg:flex">
            <span>Claude · GPT · Gemini · Grok — cobrado em reais</span>
            <Link href="/precos" className={linkAcessoClass()}>
              Planos e preços →
            </Link>
          </footer>
        </section>

        <main className="flex justify-center px-6 pb-14 pt-10 sm:px-10 lg:items-center lg:border-l lg:border-aco-800 lg:bg-aco-950/45 lg:py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
    </div>
  );
}
