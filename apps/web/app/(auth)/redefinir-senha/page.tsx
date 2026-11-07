import { Field, inputClass, Notice } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <>
        <Notice tone="red">Link inválido ou expirado.</Notice>
        <p className="mt-4 text-center text-sm">
          <Link href="/recuperar-senha" className="font-medium">
            Pedir um novo link
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1 className="mb-5 text-lg font-semibold">Criar nova senha</h1>
      <ActionForm action={resetPasswordAction} submit="Salvar senha" pending="Salvando…">
        <input type="hidden" name="token" value={token} />
        <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        </Field>
      </ActionForm>
    </>
  );
}
