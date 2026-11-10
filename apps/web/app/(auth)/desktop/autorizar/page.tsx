import { estadoValido } from "@forja/auth";
import { AvisoAcesso } from "@forja/ui";
import { redirect } from "next/navigation";
import { TituloDeAcesso } from "@/components/acesso/titulo";
import { getAuthUser } from "@/lib/session";
import { AutorizarDesktop } from "./autorizar";

export const metadata = { title: "Entrar no app" };

/** Segunda etapa do login do app desktop: a pessoa, já logada no navegador, confirma a entrada. */
export default async function AutorizarDesktopPage({ searchParams }: { searchParams: Promise<{ estado?: string | string[] }> }) {
  const bruto = (await searchParams).estado;
  const estado = Array.isArray(bruto) ? bruto[0] : bruto;
  const user = await getAuthUser();
  if (!user) redirect(estadoValido(estado) ? `/entrar?next=${encodeURIComponent(`/desktop/autorizar?estado=${estado}`)}` : "/entrar");

  return (
    <>
      <TituloDeAcesso sub={`O app da Forja neste computador vai entrar como ${user.email}.`}>Entrar no app</TituloDeAcesso>
      {estadoValido(estado) ? (
        <AutorizarDesktop estado={estado} />
      ) : (
        <AvisoAcesso>Este link está incompleto. No app, use Conta → Entrar pelo navegador para começar de novo.</AvisoAcesso>
      )}
    </>
  );
}
