"use client";

import { AvisoAcesso, Button, cx, Notice } from "@forja/ui";
import { startTransition, useActionState, type ReactNode } from "react";

export type FormState = { error?: string | null; ok?: string | null };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Formulário de server action com mensagem de erro/sucesso e botão com estado de envio.
 * Envia via onSubmit (e não `<form action>`) para o React 19 não limpar os campos
 * quando a ação devolve erro — a pessoa não precisa redigitar o e-mail.
 */
export function ActionForm({
  action,
  submit,
  pending = "Aguarde…",
  variant,
  tema = "claro",
  className,
  children,
}: {
  action: Action;
  submit: string;
  pending?: string;
  variant?: "primary" | "secondary" | "brand" | "brasa" | "aco";
  /** "acesso": telas de login, cadastro e 2FA (tema escuro da oficina). */
  tema?: "claro" | "acesso";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const acesso = tema === "acesso";
  return (
    <form
      className={className ?? "space-y-4"}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {acesso ? (
        <>
          {state.error ? <AvisoAcesso tom="erro">{state.error}</AvisoAcesso> : null}
          {state.ok ? <AvisoAcesso tom="info">{state.ok}</AvisoAcesso> : null}
        </>
      ) : (
        <>
          {state.error ? <Notice tone="red">{state.error}</Notice> : null}
          {state.ok ? <Notice tone="blue">{state.ok}</Notice> : null}
        </>
      )}
      <Button
        type="submit"
        variant={variant ?? (acesso ? "brasa" : "primary")}
        disabled={isPending}
        className={cx("w-full", acesso && "group py-2.5 text-[15px]")}
      >
        {isPending ? pending : submit}
        {acesso && !isPending && (variant ?? "brasa") === "brasa" ? (
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        ) : null}
      </Button>
    </form>
  );
}
