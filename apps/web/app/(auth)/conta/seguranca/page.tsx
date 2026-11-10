import { getWebAuth } from "@forja/auth";
import { AvisoAcesso, linkAcessoClass } from "@forja/ui";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DesligarDuasEtapas, LigarDuasEtapas } from "@/components/acesso/duas-etapas";
import { TituloDeAcesso } from "@/components/acesso/titulo";

export const metadata = { title: "Segurança da conta" };

export default async function SegurancaPage({ searchParams }: { searchParams: Promise<{ ativada?: string; desligada?: string }> }) {
  const sessao = await getWebAuth().api.getSession({ headers: await headers() });
  if (!sessao) redirect("/entrar?next=/conta/seguranca");
  const ligada = Boolean((sessao.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);
  const q = await searchParams;
  return (
    <>
      <TituloDeAcesso
        sub={
          ligada
            ? `A conta ${sessao.user.email} pede um código do seu app autenticador a cada login.`
            : "Com ela, entrar na sua conta pede a senha e um código do seu celular. Quem descobrir só a senha não entra."
        }
      >
        Duas etapas
      </TituloDeAcesso>
      {q.ativada ? (
        <div className="mb-5">
          <AvisoAcesso tom="info">Verificação em duas etapas ativada.</AvisoAcesso>
        </div>
      ) : null}
      {q.desligada ? (
        <div className="mb-5">
          <AvisoAcesso tom="atencao">Verificação em duas etapas desligada.</AvisoAcesso>
        </div>
      ) : null}
      {ligada ? <DesligarDuasEtapas /> : <LigarDuasEtapas />}
      <p className="mt-6 text-center text-sm">
        <Link href="/central" className={linkAcessoClass()}>
          Voltar para a Forja
        </Link>
      </p>
    </>
  );
}
