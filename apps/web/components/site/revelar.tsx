"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Revela o conteúdo quando ele entra na tela. O estado escondido só é aplicado depois de montar e
 * só no que está abaixo da dobra: sem JavaScript, ou com movimento reduzido, tudo aparece direto.
 */
export function Revelar({ children, atraso = 0, className, como: Tag = "div" }: { children: ReactNode; atraso?: number; className?: string; como?: "div" | "li" | "section" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
      el.dataset.revelar = "visivel";
      return;
    }
    el.dataset.revelar = "espera";
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          el.dataset.revelar = "visivel";
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    // @ts-expect-error a ref serve aos três elementos
    <Tag ref={ref} data-revelar="" className={className} style={{ "--atraso": `${atraso}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Marca o cabeçalho quando a página rolou (para ele ganhar fundo). */
export function CabecalhoFixo({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const ao = () => {
      if (ref.current) ref.current.dataset.rolou = window.scrollY > 12 ? "sim" : "nao";
    };
    ao();
    window.addEventListener("scroll", ao, { passive: true });
    return () => window.removeEventListener("scroll", ao);
  }, []);
  return (
    <header ref={ref} className={className}>
      {children}
    </header>
  );
}
