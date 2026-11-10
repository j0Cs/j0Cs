import { AvisoAcesso, CampoAcesso, inputAcessoClass } from "@forja/ui";
import { ActionForm } from "@/components/action-form";
import { signInAction } from "../actions";

export const metadata = { title: "Entrar" };

export default async function AdminSignIn({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h1 className="font-display text-[2.4rem] font-extrabold uppercase leading-none tracking-[0.02em] text-aco-100">Entrar no painel</h1>
      <p className="mb-7 mt-2.5 text-sm text-aco-300">Acesso só para a equipe da Forja.</p>
      {erro === "sem-acesso" ? (
        <div className="mb-5">
          <AvisoAcesso tom="erro">Esta conta não tem acesso ao painel.</AvisoAcesso>
        </div>
      ) : null}
      <ActionForm action={signInAction} submit="Continuar" pending="Verificando…" tema="acesso" className="space-y-5">
        <CampoAcesso label="E-mail">
          <input name="email" type="email" autoComplete="username" required className={inputAcessoClass} />
        </CampoAcesso>
        <CampoAcesso label="Senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
    </>
  );
}
