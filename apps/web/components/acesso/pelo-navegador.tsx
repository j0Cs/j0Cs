"use client";

import { buttonClass } from "@forja/ui";
import { useEffect, useState } from "react";
import { DivisoriaOu } from "./titulo";
import "@/lib/desktop";

/** Só aparece dentro do app desktop: entra com a conta que já está aberta no navegador. */
export function EntrarPeloNavegador() {
  const [noApp, setNoApp] = useState(false);
  const [pedido, setPedido] = useState(false);
  useEffect(() => setNoApp(Boolean(window.forjaDesktop)), []);
  if (!noApp) return null;
  return (
    <>
      <button
        type="button"
        className={`${buttonClass("aco")} w-full py-2.5 text-[15px]`}
        onClick={() => {
          setPedido(true);
          void window.forjaDesktop?.entrarPeloNavegador();
        }}
      >
        Entrar pelo navegador
      </button>
      {pedido ? <p className="mt-2 text-sm text-aco-300">Abri o navegador. Confirme lá e volte para cá.</p> : null}
      <DivisoriaOu />
    </>
  );
}
