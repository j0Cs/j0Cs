"use client";

import { Notice } from "@forja/ui";
import { useActionState } from "react";
import { resendVerification, type RespostaDoReenvio } from "@/app/(app)/actions";

/** Aviso de e-mail não confirmado, com o botão de reenviar e a resposta do envio. */
export function ConfirmarEmail({ email, tema = "claro" }: { email: string; tema?: "claro" | "oficina" }) {
  const [resposta, enviar, enviando] = useActionState<RespostaDoReenvio>(resendVerification, null);
  if (tema === "oficina") {
    return (
      <form action={enviar} className="rounded-md border border-palha/40 bg-palha/10 px-3 py-2 text-sm text-palha">
        Confirme seu e-mail (<b>{email}</b>) para liberar os modelos de IA.{" "}
        <button disabled={enviando} className="font-semibold underline underline-offset-2 disabled:opacity-60">
          {enviando ? "Enviando…" : "Reenviar e-mail"}
        </button>
        {resposta ? (
          <span role="status" className={`mt-1 block font-medium ${resposta.tom === "erro" ? "text-brasa-claro" : "text-aco-100"}`}>
            {resposta.texto}
          </span>
        ) : null}
      </form>
    );
  }
  return (
    <Notice tone={resposta?.tom === "erro" ? "red" : "amber"}>
      <form action={enviar} className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Confirme seu e-mail (<b>{email}</b>) para usar os modelos de IA.
        </span>
        <button disabled={enviando} className="text-sm font-medium underline disabled:opacity-60">
          {enviando ? "Enviando…" : "Reenviar e-mail"}
        </button>
      </form>
      {resposta ? (
        <p role="status" className="mt-1.5 text-sm font-medium">
          {resposta.texto}
        </p>
      ) : null}
    </Notice>
  );
}
