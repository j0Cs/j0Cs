"use client";

import { Button, Notice } from "@forja/ui";
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
  variant = "primary",
  className,
  children,
}: {
  action: Action;
  submit: string;
  pending?: string;
  variant?: "primary" | "secondary" | "brand";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
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
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="blue">{state.ok}</Notice> : null}
      <Button type="submit" variant={variant} disabled={isPending} className="w-full">
        {isPending ? pending : submit}
      </Button>
    </form>
  );
}
