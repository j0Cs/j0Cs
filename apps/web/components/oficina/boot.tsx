"use client";

import { useEffect, useState } from "react";

/**
 * Sequência de ignição: aparece uma vez por sessão, dura ~1,6 s e some.
 * Não aparece para quem pediu menos movimento no sistema.
 */
export function Ignicao({ linhas }: { linhas: string[] }) {
  const [visivel, setVisivel] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let jaViu = false;
    try {
      jaViu = sessionStorage.getItem("forja_ignicao") === "1";
    } catch {
      // armazenamento bloqueado: segue sem a animação
      jaViu = true;
    }
    if (jaViu || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setN(0);
    setVisivel(true);
    const timers = linhas.map((_, i) => setTimeout(() => setN(i + 1), 180 + i * 260));
    timers.push(
      setTimeout(() => {
        setVisivel(false);
        // só marca como vista quando termina: no StrictMode o efeito roda duas vezes e a
        // primeira execução é desfeita na hora (a sobreposição não pode ficar presa na tela)
        try {
          sessionStorage.setItem("forja_ignicao", "1");
        } catch {
          // sem armazenamento: tudo bem
        }
      }, 420 + linhas.length * 260),
    );
    return () => {
      timers.forEach(clearTimeout);
      setVisivel(false);
    };
  }, [linhas]);

  if (!visivel) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-aco-950/95 transition-opacity" aria-hidden>
      <div className="w-[min(90vw,420px)] font-mono text-xs leading-6 text-aco-300">
        {linhas.slice(0, n).map((l, i) => (
          <p key={l} className="anim-surgir">
            <span className="text-brasa">›</span> {l}
            {i === n - 1 ? <span className="anim-cintilar ml-1 inline-block h-3 w-1.5 translate-y-0.5 bg-brasa" style={{ animation: "cintilar .8s infinite" }} /> : null}
          </p>
        ))}
      </div>
    </div>
  );
}
