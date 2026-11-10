"use client";

import { Button, Notice } from "@forja/ui";
import { startTransition, useActionState, useEffect, type ReactNode } from "react";

export type EstadoCobranca = { error?: string | null; ok?: string | null; url?: string | null };
type Acao = (prev: EstadoCobranca, formData: FormData) => Promise<EstadoCobranca>;

/**
 * Formulário das ações de cobrança: mostra erro/sucesso no lugar ou leva ao Stripe (checkout,
 * portal, fatura) quando a ação devolve uma URL.
 */
export function FormCobranca({
  action,
  submit,
  pending = "Abrindo…",
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  action: Acao;
  submit: ReactNode;
  pending?: string;
  variant?: "primary" | "secondary" | "brand" | "ghost";
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  useEffect(() => {
    if (state.url) window.location.assign(state.url);
  }, [state.url]);
  const indo = isPending || Boolean(state.url);
  return (
    <form
      className={className ?? "space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {state.error ? <Notice tone="red">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="blue">{state.ok}</Notice> : null}
      <Button type="submit" variant={variant} size={size} disabled={indo} className="w-full">
        {indo ? pending : submit}
      </Button>
    </form>
  );
}
