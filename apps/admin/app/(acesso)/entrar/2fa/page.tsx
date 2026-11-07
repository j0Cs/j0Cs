import { Field, inputClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { verifyTwoFactorAction } from "../../actions";

export const metadata = { title: "Verificação em duas etapas" };

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Verificação em duas etapas</h1>
      <p className="mb-5 text-sm text-zinc-500">Digite o código de 6 dígitos do seu app autenticador (ou um código de backup).</p>
      <ActionForm action={verifyTwoFactorAction} submit="Verificar" pending="Verificando…">
        <Field label="Código">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required className={`${inputClass} text-center text-lg tracking-widest`} />
        </Field>
      </ActionForm>
      <p className="mt-4 text-center text-xs">
        <Link href="/entrar" className="text-zinc-500">
          Voltar
        </Link>
      </p>
    </>
  );
}
