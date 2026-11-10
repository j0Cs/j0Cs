"use client";

import { cx } from "@forja/ui";
import { usePathname } from "next/navigation";

/** As duas etapas do acesso ao painel: senha e código do app autenticador (ou a ativação dele). */
export function TrilhoDeAcesso() {
  const caminho = usePathname();
  const segunda = caminho.startsWith("/entrar/2fa") || caminho.startsWith("/seguranca");
  const etapas = [
    { n: 1, nome: "Senha" },
    { n: 2, nome: caminho.startsWith("/seguranca") ? "Ativar o app" : "Código do app" },
  ];
  const atual = segunda ? 2 : 1;
  return (
    <ol className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em]" aria-label="Etapas do acesso">
      {etapas.map((e, i) => {
        const feito = e.n < atual;
        const agora = e.n === atual;
        return (
          <li key={e.n} className="flex items-center gap-3" aria-current={agora ? "step" : undefined}>
            {i > 0 ? <span aria-hidden className={cx("h-px w-8", feito || agora ? "bg-brasa/60" : "bg-aco-700")} /> : null}
            <span
              aria-hidden
              className={cx(
                "grid h-5 w-5 place-items-center rounded-full text-[10px]",
                agora && "bg-brasa text-aco-950 shadow-[0_0_14px_2px_rgb(255_106_26/0.45)]",
                feito && "bg-aco-700 text-palha",
                !agora && !feito && "border border-aco-500 text-aco-300",
              )}
            >
              {feito ? "✓" : e.n}
            </span>
            <span className={agora ? "text-aco-100" : "text-aco-300"}>
              {e.nome}
              {feito ? <span className="sr-only"> (feito)</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
