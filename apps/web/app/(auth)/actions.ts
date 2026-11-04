"use server";

import { authErrorMessage, getWebAuth } from "@forja/auth";
import { acceptInvitation, consumeRateLimit, createOrganizationForUser, getDb, OrgError } from "@forja/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { ACTIVE_ORG_COOKIE, getAuthUser } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Só aceita caminhos internos para o "voltar para" (evita redirecionamento aberto).
 * Rejeita "//x", "/\\x" e caracteres de controle, que navegadores tratam como outro host.
 */
function safeNext(v: string) {
  if (!v.startsWith("/") || /[\\\s]/.test(v)) return "/central";
  try {
    const u = new URL(v, "http://interno.invalid");
    return u.origin === "http://interno.invalid" ? u.pathname + u.search + u.hash : "/central";
  } catch {
    return "/central";
  }
}

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

async function setActiveOrg(orgId: string) {
  (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function signInAction(_: FormState, f: FormData): Promise<FormState> {
  const ip = await ipDoCliente();
  const email = str(f, "email").toLowerCase();
  if (!(await dentroDoLimite([[`login:ip:${ip}`, 30, 900], [`login:email:${email}`, 10, 900]]))) return MUITAS;
  try {
    await getWebAuth().api.signInEmail({
      body: { email: str(f, "email"), password: String(f.get("password") ?? ""), rememberMe: true },
      headers: await headers(),
    });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
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

export async function magicLinkAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase();
  if (!(await dentroDoLimite([[`email:ip:${await ipDoCliente()}`, 10, 900], [`email:para:${email}`, 3, 900]]))) return MUITAS;
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
  if (!(await dentroDoLimite([[`email:ip:${await ipDoCliente()}`, 10, 900], [`email:para:${email}`, 3, 900]]))) return MUITAS;
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
