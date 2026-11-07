"use server";

import { authErrorMessage, caminhoInterno, getWebAuth } from "@forja/auth";
import { acceptInvitation, consumeRateLimit, createOrganizationForUser, getDb, OrgError, refundRateLimit } from "@forja/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { ACTIVE_ORG_COOKIE, getAuthUser } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Só aceita caminhos internos para o "voltar para" (regra única em @forja/auth, com testes). */
const safeNext = (v: string) => caminhoInterno(v);

const LIMITE_NOME = 80;

/** IP do cliente (a Vercel preenche x-forwarded-for). */
async function ipDoCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/** Limites próprios: chamadas diretas a auth.api.* não passam pelo limitador do Better Auth. */
async function dentroDoLimite(chaves: [string, number, number][]) {
  const db = getDb();
  for (const [chave, limite, janela] of chaves) {
    if (!(await consumeRateLimit(db, chave, limite, janela))) return false;
  }
  return true;
}
const MUITAS = { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };

/**
 * Login: o limite por conta conta só FALHAS, por par (e-mail, IP) e com um teto global maior
 * por e-mail. Assim um atacante de um IP não trava a conta de outra pessoa, e adivinhar senha
 * a partir de muitos IPs continua limitado. A tentativa é RESERVADA antes (UPSERT atômico, nada
 * de "conferir e depois somar", que rajadas simultâneas furam) e devolvida quando dá certo.
 * Chaves com prefixos distintos ("par:"/"conta:") e separador "|": um e-mail terminado em ":<ip>"
 * não cai no balde de outra pessoa.
 */
const FALHAS_POR_PAR = 8;
const FALHAS_POR_EMAIL = 50;
const JANELA_LOGIN = 900;
/** Formato mínimo de e-mail: antes de qualquer limite (e-mail inválido não ocupa balde de ninguém). */
const EMAIL_VALIDO = /^[^\s@:|]+@[^\s@:|]+\.[^\s@:|]+$/;

async function setActiveOrg(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function signInAction(_: FormState, f: FormData): Promise<FormState> {
  const ip = await ipDoCliente();
  const email = str(f, "email").toLowerCase();
  if (!EMAIL_VALIDO.test(email)) return { error: "E-mail ou senha incorretos." };
  const db = getDb();
  const par = `login:falhas:par:${email}|${ip}`;
  const conta = `login:falhas:conta:${email}`;
  if (!(await dentroDoLimite([[`login:ip:${ip}`, 30, JANELA_LOGIN]]))) return MUITAS;
  const parOk = await consumeRateLimit(db, par, FALHAS_POR_PAR, JANELA_LOGIN);
  const contaOk = await consumeRateLimit(db, conta, FALHAS_POR_EMAIL, JANELA_LOGIN);
  if (!parOk || !contaOk) {
    await Promise.all([refundRateLimit(db, par), refundRateLimit(db, conta)]); // recusada nem chegou a tentar
    return MUITAS;
  }
  try {
    await getWebAuth().api.signInEmail({
      body: { email, password: String(f.get("password") ?? ""), rememberMe: true },
      headers: await headers(),
    });
  } catch (err) {
    return { error: authErrorMessage(err) }; // a falha fica contada
  }
  await Promise.all([refundRateLimit(db, par), refundRateLimit(db, conta)]); // deu certo: não é falha
  redirect(safeNext(str(f, "next")));
}

export async function signUpAction(_: FormState, f: FormData): Promise<FormState> {
  const name = str(f, "name").slice(0, LIMITE_NOME);
  const company = str(f, "company").slice(0, LIMITE_NOME);
  const invite = str(f, "invite");
  if (!name) return { error: "Informe seu nome." };
  if (!(await dentroDoLimite([[`cadastro:ip:${await ipDoCliente()}`, 10, 3600]]))) return MUITAS;
  if (!invite && !company) return { error: "Informe o nome da empresa (ou o seu, se for autônomo)." };

  let userId: string;
  let email: string;
  try {
    const res = await getWebAuth().api.signUpEmail({
      body: { name, email: str(f, "email").toLowerCase(), password: String(f.get("password") ?? ""), callbackURL: "/central" },
      headers: await headers(),
    });
    userId = res.user.id;
    email = res.user.email;
  } catch (err) {
    return { error: authErrorMessage(err) };
  }

  const db = getDb();
  try {
    const orgId = invite
      ? await acceptInvitation(db, { token: invite, userId, email })
      : (await createOrganizationForUser(db, { userId, name: company })).id;
    await setActiveOrg(orgId);
  } catch (err) {
    if (err instanceof OrgError) return { error: err.message };
    throw err;
  }
  redirect("/central");
}

/**
 * E-mails para um endereço: por par (e-mail, IP) e um teto por endereço, em baldes separados para
 * link mágico e redefinição de senha (esgotar um não fecha o outro caminho de volta para a conta).
 */
const limitesDeEmail = (fluxo: "magico" | "senha", email: string, ip: string): [string, number, number][] => [
  [`email:ip:${ip}`, 10, 900],
  [`email:${fluxo}:par:${email}|${ip}`, 3, 900],
  [`email:${fluxo}:conta:${email}`, 10, 900],
];

export async function magicLinkAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  if (!EMAIL_VALIDO.test(email)) return { error: "Informe um e-mail válido." };
  if (!(await dentroDoLimite(limitesDeEmail("magico", email, await ipDoCliente())))) return MUITAS;
  try {
    await getWebAuth().api.signInMagicLink({
      body: { email, callbackURL: safeNext(str(f, "next")) },
      headers: await headers(),
    });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  return { ok: "Se existir uma conta com esse e-mail, enviamos um link de acesso. Ele vale por 5 minutos." };
}

export async function githubAction(f: FormData) {
  const res = await getWebAuth().api.signInSocial({
    body: { provider: "github", callbackURL: safeNext(str(f, "next")), newUserCallbackURL: "/onboarding" },
    headers: await headers(),
  });
  if (res.url) redirect(res.url);
}

export async function requestResetAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  if (!EMAIL_VALIDO.test(email)) return { error: "Informe um e-mail válido." };
  if (!(await dentroDoLimite(limitesDeEmail("senha", email, await ipDoCliente())))) return MUITAS;
  try {
    await getWebAuth().api.requestPasswordReset({
      body: { email, redirectTo: "/redefinir-senha" },
      headers: await headers(),
    });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  return { ok: "Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha." };
}

export async function resetPasswordAction(_: FormState, f: FormData): Promise<FormState> {
  try {
    await getWebAuth().api.resetPassword({
      body: { token: str(f, "token"), newPassword: String(f.get("password") ?? "") },
      headers: await headers(),
    });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  redirect("/entrar?senha=ok");
}

/** Primeira organização (cadastro via GitHub/link mágico) ou uma organização adicional. */
export async function createOrgAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await getAuthUser();
  if (!user) redirect("/entrar");
  const name = str(f, "company").slice(0, LIMITE_NOME);
  if (!name) return { error: "Informe o nome da empresa." };
  const org = await createOrganizationForUser(getDb(), { userId: user.id, name });
  await setActiveOrg(org.id);
  redirect("/central");
}

export async function acceptInviteAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await getAuthUser();
  const token = str(f, "token");
  if (!user) redirect(`/entrar?convite=${encodeURIComponent(token)}`);
  try {
    const orgId = await acceptInvitation(getDb(), { token, userId: user.id, email: user.email });
    await setActiveOrg(orgId);
  } catch (err) {
    if (err instanceof OrgError) return { error: err.message };
    throw err;
  }
  redirect("/central");
}
