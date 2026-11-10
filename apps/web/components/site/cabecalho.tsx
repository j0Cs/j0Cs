import { buttonClass, cx, linkAcessoClass, Marca } from "@forja/ui";
import Link from "next/link";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Forja";

/** Cabeçalho e rodapé das páginas públicas simples (status, suporte). */
export function CabecalhoDoSite() {
  return (
    <header className="relative mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-6">
      <Link href="/" className="flex items-center gap-3">
        <Marca size={34} className="text-aco-100" />
        <span className="font-display text-2xl font-extrabold uppercase tracking-[0.22em] text-aco-100">{APP_NAME}</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm">
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
  );
}

export function RodapeDoSite() {
  return (
    <footer className="relative border-t border-aco-800">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-8 font-mono text-[11px] uppercase tracking-[0.18em] text-aco-300">
        <span>{APP_NAME} · oficina de software</span>
        <span className="flex gap-6">
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
        </span>
      </div>
    </footer>
  );
}
