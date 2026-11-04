import { getDb, getInvitation } from "@forja/db";
import { Field, inputClass, Notice } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { getAuthUser } from "@/lib/session";
import { signUpAction } from "../actions";

export const metadata = { title: "Criar conta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  const { convite } = await searchParams;
  if (await getAuthUser()) redirect(convite ? `/convite/${convite}` : "/central");
  const invite = convite ? await getInvitation(getDb(), convite) : null;

  return (
    <>
      <h1 className="text-lg font-semibold">Criar conta</h1>
      <p className="mb-5 text-sm text-zinc-500">
        {invite ? (
          <>
            Você foi convidado para <b>{invite.orgName}</b>.
          </>
        ) : (
          "7 dias grátis com R$ 10 em créditos. Sem cartão."
        )}
      </p>
      {convite && !invite ? (
        <div className="mb-4">
          <Notice tone="red">Convite inválido ou expirado. Você ainda pode criar uma conta própria.</Notice>
        </div>
      ) : null}
      <ActionForm action={signUpAction} submit="Criar conta" pending="Criando…" variant="brand">
        {invite ? <input type="hidden" name="invite" value={convite} /> : null}
        <Field label="Seu nome">
          <input name="name" autoComplete="name" required className={inputClass} />
        </Field>
        {!invite ? (
          <Field label="Empresa" hint="Se você é autônomo, use seu nome.">
            <input name="company" autoComplete="organization" required className={inputClass} />
          </Field>
        ) : null}
        <Field label="E-mail">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={invite?.invite.email}
            readOnly={Boolean(invite)}
            className={inputClass}
          />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
        </Field>
      </ActionForm>
      <p className="mt-4 text-center text-xs text-zinc-500">
        Já tem conta?{" "}
        <Link href={convite ? `/entrar?convite=${convite}` : "/entrar"} className="font-medium text-zinc-900">
          Entrar
        </Link>
      </p>
    </>
  );
}
