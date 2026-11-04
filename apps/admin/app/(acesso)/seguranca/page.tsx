import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { TwoFactorSetup } from "./setup";

export const metadata = { title: "Ativar 2FA" };

export default async function SecurityPage() {
  const user = await requireStaff({ allowWithout2FA: true });
  if (user.twoFactorEnabled) redirect("/");
  return (
    <>
      <h1 className="text-lg font-semibold">Ative a verificação em duas etapas</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Obrigatória para o painel: ele dá acesso às chaves de API e aos dados de todos os clientes. Use Google Authenticator, 1Password,
        Authy ou similar.
      </p>
      <TwoFactorSetup />
    </>
  );
}
