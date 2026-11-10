"use server";

import { emailConfigurado, getWebAuth } from "@forja/auth";
import { consumeRateLimit, getDb } from "@forja/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, getAuthUser, getSession } from "@/lib/session";

export async function signOut() {
  await getWebAuth().api.signOut({ headers: await headers() });
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/entrar");
}

export async function switchOrg(formData: FormData) {
  const { orgs } = await getSession();
  const id = String(formData.get("orgId"));
  if (orgs.some((o) => o.org.id === id)) {
    (await cookies()).set(ACTIVE_ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/central");
}

export type RespostaDoReenvio = { tom: "ok" | "erro"; texto: string } | null;

/** Reenvia a confirmação de e-mail e conta o que aconteceu (o botão mostra a resposta). */
export async function resendVerification(_anterior?: RespostaDoReenvio): Promise<RespostaDoReenvio> {
  const user = await getAuthUser();
  if (!user) return { tom: "erro", texto: "Sua sessão acabou. Entre de novo." };
  if (user.emailVerified) return { tom: "ok", texto: "Seu e-mail já está confirmado. Recarregue a página." };
  if (!(await emailConfigurado())) {
    return { tom: "erro", texto: "O envio de e-mails está fora do ar no momento. Já estamos cuidando disso; fale com o suporte se tiver pressa." };
  }
  // chamada direta ao Better Auth não passa pelo limitador dele: limita aqui
  if (!(await consumeRateLimit(getDb(), `email:verificacao:${user.id}`, 3, 900))) {
    return { tom: "erro", texto: "Você já pediu 3 vezes. Espere 15 minutos e veja também a caixa de spam." };
  }
  try {
    await getWebAuth().api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/central" }, headers: await headers() });
    return { tom: "ok", texto: `Enviamos um novo link para ${user.email}. Ele pode levar alguns minutos; veja também o spam.` };
  } catch {
    return { tom: "erro", texto: "Não consegui enviar agora. Tente de novo em instantes." };
  }
}
