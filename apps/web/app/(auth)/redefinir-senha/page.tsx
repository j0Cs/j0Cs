import { AvisoAcesso, CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <>
        <TituloDeAcesso>Link expirado</TituloDeAcesso>
        <AvisoAcesso tom="erro">Este link de nova senha é inválido ou já expirou.</AvisoAcesso>
        <p className="mt-5 text-center text-sm">
          <Link href="/recuperar-senha" className={linkAcessoClass(true)}>
            Pedir um link novo
          </Link>
        </p>
      </>
    );
  }
  return (
    <>
      <TituloDeAcesso sub="Depois de salvar, você entra com ela.">Nova senha</TituloDeAcesso>
      <ActionForm action={resetPasswordAction} submit="Salvar senha" pending="Salvando…" tema="acesso" className="space-y-5">
        <input type="hidden" name="token" value={token} />
        <CampoAcesso label="Nova senha" hint="Pelo menos 8 caracteres.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
    </>
  );
}
