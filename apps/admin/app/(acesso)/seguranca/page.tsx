import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/admin";
import { TwoFactorSetup } from "./setup";

export const metadata = { title: "Ativar 2FA" };

export default async function SecurityPage() {
  const user = await requireStaff({ allowWithout2FA: true });
  if (user.twoFactorEnabled) redirect("/");
  return (
    <>
      <h1 className="font-display text-[2.4rem] font-extrabold uppercase leading-none tracking-[0.02em] text-aco-100">Ative o 2FA</h1>
      <p className="mb-7 mt-2.5 text-sm leading-relaxed text-aco-300">
        Obrigatório no painel: ele dá acesso às chaves de API e aos dados de todos os clientes. Use Google Authenticator, 1Password, Authy
        ou outro app de códigos.
      </p>
      <TwoFactorSetup />
    </>
  );
}
