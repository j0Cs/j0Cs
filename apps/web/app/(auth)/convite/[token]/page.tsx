import { getDb, getInvitation } from "@forja/db";
import { AvisoAcesso, buttonClass, linkAcessoClass } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { getAuthUser } from "@/lib/session";
import { acceptInviteAction } from "../../actions";

export const metadata = { title: "Convite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, user] = await Promise.all([getInvitation(getDb(), token), getAuthUser()]);

  if (!found) {
    return (
      <>
        <TituloDeAcesso>Convite expirado</TituloDeAcesso>
        <AvisoAcesso tom="erro">Este convite é inválido, já foi usado ou expirou. Peça um novo para quem convidou você.</AvisoAcesso>
        <p className="mt-5 text-center text-sm">
          <Link href="/entrar" className={linkAcessoClass(true)}>
            Ir para o login
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <TituloDeAcesso
        sub={
          <>
            Enviado para <b className="font-medium text-aco-100">{found.invite.email}</b> · papel:{" "}
            {found.invite.role === "admin" ? "administrador" : "membro"}
          </>
        }
      >
        {found.orgName}
      </TituloDeAcesso>
      {user ? (
        user.email === found.invite.email ? (
          <ActionForm action={acceptInviteAction} submit="Aceitar convite" pending="Entrando…" tema="acesso">
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        ) : (
          <AvisoAcesso tom="atencao">
            Você está conectado como {user.email}. Saia e entre com {found.invite.email} para aceitar.
          </AvisoAcesso>
        )
      ) : (
        <div className="space-y-3">
          <Link href={`/cadastro?convite=${token}`} className={`${buttonClass("brasa")} w-full py-2.5 text-[15px]`}>
            Criar conta e aceitar <span aria-hidden>→</span>
          </Link>
          <Link href={`/entrar?convite=${token}`} className={`${buttonClass("aco")} w-full py-2.5 text-[15px]`}>
            Já tenho conta
          </Link>
        </div>
      )}
    </>
  );
}
