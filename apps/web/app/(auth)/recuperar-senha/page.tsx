import { CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { requestResetAction } from "../actions";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return (
    <>
      <TituloDeAcesso sub="Informe o e-mail da sua conta para receber o link.">Recuperar senha</TituloDeAcesso>
      <ActionForm action={requestResetAction} submit="Enviar link" pending="Enviando…" tema="acesso" className="space-y-5">
        <CampoAcesso label="E-mail">
          <input name="email" type="email" autoComplete="email" required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
      <p className="mt-5 text-center text-sm">
        <Link href="/entrar" className={linkAcessoClass()}>
          Voltar para entrar
        </Link>
      </p>
    </>
  );
}
