import { formatBrlCents } from "@forja/core";
import { getBetaInvite, getDb, getInvitation } from "@forja/db";
import { AvisoAcesso, CampoAcesso, inputAcessoClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { getAuthUser } from "@/lib/session";
import { signUpAction } from "../actions";

export const metadata = { title: "Criar conta" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ convite?: string; fundador?: string }> }) {
  const { convite, fundador } = await searchParams;
  if (await getAuthUser()) redirect(convite ? `/convite/${convite}` : "/central");
  const invite = convite ? await getInvitation(getDb(), convite) : null;
  const beta = fundador && !convite ? await getBetaInvite(getDb(), fundador) : null;

  return (
    <>
      <TituloDeAcesso
        sub={
          invite ? (
            <>
              Você foi convidado para <b className="font-medium text-aco-100">{invite.orgName}</b>.
            </>
          ) : (
            "Comece grátis, sem cartão de crédito."
          )
        }
      >
        Criar conta
      </TituloDeAcesso>
      {beta ? (
        <div className="mb-5">
          <AvisoAcesso tom="info">
            <b className="font-medium">Convite de fundador para {beta.label}.</b> {beta.trialDays} dias de teste com{" "}
            {formatBrlCents(beta.creditsBrlCents)} em créditos, sem cartão.
            {beta.offer ? <> Na assinatura: {beta.offer}.</> : null}
          </AvisoAcesso>
        </div>
      ) : fundador && !convite ? (
        <div className="mb-5">
          <AvisoAcesso tom="atencao">Este convite de fundador não vale mais. Você ainda pode criar a conta com o teste grátis normal.</AvisoAcesso>
        </div>
      ) : null}
      {convite && !invite ? (
        <div className="mb-5">
          <AvisoAcesso tom="atencao">Convite inválido ou expirado. Você ainda pode criar uma conta própria.</AvisoAcesso>
        </div>
      ) : null}
      <ActionForm action={signUpAction} submit="Criar conta" pending="Criando…" tema="acesso" className="space-y-5">
        {invite ? <input type="hidden" name="invite" value={convite} /> : null}
        {beta ? <input type="hidden" name="fundador" value={beta.code} /> : null}
        <CampoAcesso label="Seu nome">
          <input name="name" autoComplete="name" required className={inputAcessoClass} />
        </CampoAcesso>
        {!invite ? (
          <CampoAcesso label="Empresa" hint="Se você é autônomo, use seu nome.">
            <input name="company" autoComplete="organization" required className={inputAcessoClass} />
          </CampoAcesso>
        ) : null}
        <CampoAcesso label="E-mail">
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={invite?.invite.email}
            readOnly={Boolean(invite)}
            className={inputAcessoClass}
          />
        </CampoAcesso>
        <CampoAcesso label="Senha" hint="Pelo menos 8 caracteres.">
          <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputAcessoClass} />
        </CampoAcesso>
      </ActionForm>
      <p className="mt-5 text-center text-sm text-aco-300">
        Já tem conta?{" "}
        <Link href={convite ? `/entrar?convite=${convite}` : "/entrar"} className={linkAcessoClass(true)}>
          Entrar
        </Link>
      </p>
    </>
  );
}
