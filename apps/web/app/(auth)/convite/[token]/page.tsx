import { getDb, getInvitation } from "@forja/db";
import { buttonClass, Notice } from "@forja/ui";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getAuthUser } from "@/lib/session";
import { acceptInviteAction } from "../../actions";

export const metadata = { title: "Convite" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [found, user] = await Promise.all([getInvitation(getDb(), token), getAuthUser()]);

  if (!found) {
    return (
      <>
        <Notice tone="red">Este convite é inválido, já foi usado ou expirou. Peça um novo para quem convidou você.</Notice>
        <p className="mt-4 text-center text-sm">
          <Link href="/entrar">Ir para o login</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold">Convite para {found.orgName}</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Enviado para <b>{found.invite.email}</b> · papel: {found.invite.role === "admin" ? "administrador" : "membro"}
      </p>
      {user ? (
        user.email === found.invite.email ? (
          <ActionForm action={acceptInviteAction} submit="Aceitar convite" pending="Entrando…" variant="brand">
            <input type="hidden" name="token" value={token} />
          </ActionForm>
        ) : (
          <Notice tone="amber">
            Você está conectado como {user.email}. Saia e entre com {found.invite.email} para aceitar.
          </Notice>
        )
      ) : (
        <div className="space-y-2">
          <Link href={`/cadastro?convite=${token}`} className={`${buttonClass("brand")} w-full`}>
            Criar conta e aceitar
          </Link>
          <Link href={`/entrar?convite=${token}`} className={`${buttonClass("secondary")} w-full`}>
            Já tenho conta
          </Link>
        </div>
      )}
    </>
  );
}
