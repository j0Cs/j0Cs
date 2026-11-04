import { Field, inputClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { requestResetAction } from "../actions";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Recuperar senha</h1>
      <p className="mb-5 text-sm text-zinc-500">Enviaremos um link para criar uma nova senha.</p>
      <ActionForm action={requestResetAction} submit="Enviar link" pending="Enviando…">
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
      </ActionForm>
      <p className="mt-4 text-center text-xs">
        <Link href="/entrar" className="text-zinc-500 hover:text-zinc-900">
          Voltar para entrar
        </Link>
      </p>
    </>
  );
}
