"use client";

import { AvisoAcesso, buttonClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { useState, useTransition } from "react";
import { autorizarDesktopAction } from "./actions";

export function AutorizarDesktop({ estado }: { estado: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [ocupado, iniciar] = useTransition();

  if (aberto) {
    return (
      <div className="space-y-4">
        <AvisoAcesso tom="info">Pronto. Volte para o app da Forja: ele já está entrando com a sua conta.</AvisoAcesso>
        <p className="text-sm text-aco-300">
          Nada aconteceu? O app precisa estar instalado e aberto neste computador.{" "}
          <Link href="/baixar" className={linkAcessoClass(true)}>
            Baixar o app
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {erro ? <AvisoAcesso>{erro}</AvisoAcesso> : null}
      <button
        type="button"
        disabled={ocupado}
        className={`${buttonClass("brasa")} w-full py-2.5 text-[15px]`}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await autorizarDesktopAction(estado);
            if (!r.link) return setErro(r.erro ?? "Não consegui autorizar.");
            setAberto(true);
            window.location.href = r.link;
          })
        }
      >
        {ocupado ? "Autorizando…" : "Entrar no app com esta conta"}
      </button>
      <p className="text-sm text-aco-300">Não pediu isso? Feche esta aba. Nada acontece sem a sua confirmação.</p>
    </div>
  );
}
