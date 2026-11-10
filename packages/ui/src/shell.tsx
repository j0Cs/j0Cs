"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { cx, Marca } from "./index";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

/** Layout com barra lateral (vira menu no celular). */
export function Shell({
  brand,
  tagline,
  nav,
  footer,
  children,
}: {
  brand: string;
  tagline?: string;
  nav: NavItem[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5">
        <Marca size={30} className="shrink-0 text-zinc-100" />
        <div>
          <p className="text-sm font-semibold text-white">{brand}</p>
          {tagline ? <p className="text-[11px] text-zinc-400">{tagline}</p> : null}
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {nav.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpen(false)}
              className={cx(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(item.href) ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-zinc-800 px-5 py-4 text-xs text-zinc-400">{footer}</div> : null}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 bg-zinc-950 lg:fixed lg:inset-y-0 lg:block">{sidebar}</aside>

      <div className="sticky top-0 z-20 flex items-center justify-between bg-zinc-950 px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Marca size={22} className="text-zinc-100" />
          {brand}
        </span>
        <button aria-label="Abrir menu" onClick={() => setOpen(true)} className="text-zinc-300">
          <Menu size={20} />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-zinc-950">
            <button aria-label="Fechar menu" onClick={() => setOpen(false)} className="absolute right-3 top-5 text-zinc-400">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
