import { getDb, listUserOrganizations } from "@forja/db";
import { Field, inputClass } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { getAuthUser } from "@/lib/session";
import { createOrgAction } from "../actions";

export const metadata = { title: "Sua empresa" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect("/entrar");
  const orgs = await listUserOrganizations(getDb(), user.id);
  if (orgs.length > 0 && !nova) redirect("/projetos");

  return (
    <>
      <h1 className="text-lg font-semibold">{orgs.length ? "Nova organização" : `Bem-vindo, ${user.name.split(" ")[0]}!`}</h1>
      <p className="mb-5 text-sm text-zinc-500">
        {orgs.length
          ? "Cada organização tem seus próprios projetos, equipe, plano e créditos."
          : "Só falta o nome da sua empresa. Você começa com 7 dias grátis e R$ 10 em créditos."}
      </p>
      <ActionForm action={createOrgAction} submit="Continuar" pending="Criando…" variant="brand">
        <Field label="Empresa" hint="Se você é autônomo, use seu nome.">
          <input name="company" autoComplete="organization" required className={inputClass} />
        </Field>
      </ActionForm>
      {orgs.length ? (
        <p className="mt-4 text-center text-xs">
          <Link href="/equipe" className="text-zinc-500">
            Cancelar
          </Link>
        </p>
      ) : null}
    </>
  );
}
