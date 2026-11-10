import { CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { verifyTwoFactorAction } from "../../actions";

export const metadata = { title: "Verificação em duas etapas" };

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="font-display text-[2.4rem] font-extrabold uppercase leading-none tracking-[0.02em] text-aco-100">Código do app</h1>
      <p className="mb-7 mt-2.5 text-sm leading-relaxed text-aco-300">Digite os 6 dígitos do seu app autenticador ou um código de backup.</p>
      <ActionForm action={verifyTwoFactorAction} submit="Verificar" pending="Verificando…" tema="acesso" className="space-y-5">
        <CampoAcesso label="Código">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            className={`${inputAcessoClass} text-center font-mono text-2xl tracking-[0.5em]`}
          />
        </CampoAcesso>
      </ActionForm>
      <p className="mt-5 text-center text-sm">
        <Link href="/entrar" className={linkAcessoClass()}>
          Voltar
        </Link>
      </p>
    </>
  );
}
