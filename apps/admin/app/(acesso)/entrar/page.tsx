import { Field, inputClass, Notice } from "@forja/ui";
import { ActionForm } from "@/components/action-form";
import { signInAction } from "../actions";

export const metadata = { title: "Entrar" };

export default async function AdminSignIn({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <>
      <h1 className="mb-5 text-lg font-semibold">Entrar no painel</h1>
      {erro === "sem-acesso" ? (
        <div className="mb-4">
          <Notice tone="red">Esta conta não tem acesso ao painel.</Notice>
        </div>
      ) : null}
      <ActionForm action={signInAction} submit="Continuar" pending="Verificando…">
        <Field label="E-mail">
          <input name="email" type="email" autoComplete="username" required className={inputClass} />
        </Field>
        <Field label="Senha">
          <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
      </ActionForm>
    </>
  );
}
