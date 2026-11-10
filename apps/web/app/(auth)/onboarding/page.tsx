import { getDb, listUserOrganizations } from "@forja/db";
import { CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { getAuthUser } from "@/lib/session";
import { createOrgAction } from "../actions";

export const metadata = { title: "Sua empresa" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ nova?: string; fundador?: string }> }) {
  const { nova, fundador } = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect("/entrar");
  const orgs = await listUserOrganizations(getDb(), user.id);
  if (orgs.length > 0 && !nova) redirect("/central");

  return (
    <>
      <TituloDeAcesso
        sub={
          orgs.length
            ? "Cada organização tem seus próprios projetos, equipe, plano e créditos."
            : "Só falta o nome da sua empresa. Você começa com 7 dias grátis e R$ 10 em créditos."
        }
      >
        {orgs.length ? "Nova organização" : `Olá, ${user.name.split(" ")[0]}`}
      </TituloDeAcesso>
      <ActionForm action={createOrgAction} submit="Continuar" pending="Criando…" tema="acesso" className="space-y-5">
        {fundador && !orgs.length ? <input type="hidden" name="fundador" value={fundador.slice(0, 20)} /> : null}
        <CampoAcesso label="Empresa" hint="Se você é autônomo, use seu nome.">
          <input name="company" autoComplete="organization" required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
      {orgs.length ? (
        <p className="mt-5 text-center text-sm">
          <Link href="/equipe" className={linkAcessoClass()}>
            Cancelar
          </Link>
        </p>
      ) : null}
    </>
  );
}
