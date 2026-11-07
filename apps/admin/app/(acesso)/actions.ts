"use server";

import { authErrorMessage, getAdminAuth, hashPassword } from "@forja/auth";
import { consumeRateLimit, eq, getDb, schema } from "@forja/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/admin";

type State = { error?: string | null; ok?: string | null };
export type SetupState = State & { qr?: string; secret?: string; backupCodes?: string[] };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Mesma resposta de senha errada: o painel não pode confirmar a senha de contas de clientes. */
const CREDENCIAIS_INVALIDAS = "E-mail ou senha incorretos.";
const MUITAS_TENTATIVAS = "Muitas tentativas. Espere alguns minutos e tente de novo.";

async function rejectNonStaff(platformRole: unknown): Promise<State | null> {
  if (platformRole === "staff") return null;
  await getAdminAuth().api.signOut({ headers: await headers() });
  return { error: CREDENCIAIS_INVALIDAS };
}

/** IP do cliente (a Vercel preenche x-forwarded-for). */
async function ipDoCliente() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

/**
 * Chamadas diretas a auth.api.* não passam pelo limitador do Better Auth: limites próprios.
 * Por IP e pelo par (e-mail, IP): um atacante não consegue travar o login do dono a partir de outro IP.
 */
async function dentroDoLimite(chaves: [string, number, number][]) {
  const db = getDb();
  for (const [chave, limite, janela] of chaves) {
    if (!(await consumeRateLimit(db, chave, limite, janela))) return false;
  }
  return true;
}

export async function signInAction(_: State, f: FormData): Promise<State> {
  let next = "/";
  const ip = await ipDoCliente();
  const email = str(f, "email").toLowerCase();
  if (!(await dentroDoLimite([[`admin:login:ip:${ip}`, 20, 900], [`admin:login:par:${email}|${ip}`, 8, 900]]))) {
    return { error: MUITAS_TENTATIVAS };
  }
  // Só contas staff chegam a ter a senha conferida: para qualquer outro e-mail o painel nem cria
  // sessão (nada de cookie diferente que revele se a senha de um cliente está certa). O hash
  // descartável iguala o tempo de resposta.
  const conta = await getDb().query.users.findFirst({ where: eq(schema.users.email, email), columns: { platformRole: true } });
  if (conta?.platformRole !== "staff") {
    await hashPassword(String(f.get("password") ?? "x"));
    return { error: CREDENCIAIS_INVALIDAS };
  }
  try {
    const res = await getAdminAuth().api.signInEmail({
      body: { email, password: String(f.get("password") ?? "") },
      headers: await headers(),
    });
    if ("twoFactorRedirect" in res && res.twoFactorRedirect) {
      next = "/entrar/2fa";
    } else if ("user" in res) {
      const denied = await rejectNonStaff((res.user as { platformRole?: unknown }).platformRole);
      if (denied) return denied;
    }
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  redirect(next);
}

/** Segunda etapa do login: código do app autenticador ou código de backup. */
export async function verifyTwoFactorAction(_: State, f: FormData): Promise<State> {
  const code = str(f, "code").replace(/\s/g, "");
  if (!(await dentroDoLimite([[`admin:2fa:ip:${await ipDoCliente()}`, 20, 900]]))) return { error: MUITAS_TENTATIVAS };
  try {
    const api = getAdminAuth().api;
    const res =
      code.length > 6
        ? await api.verifyBackupCode({ body: { code }, headers: await headers() })
        : await api.verifyTOTP({ body: { code }, headers: await headers() });
    const denied = await rejectNonStaff((res.user as { platformRole?: unknown }).platformRole);
    if (denied) return denied;
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  redirect("/");
}

/** Configuração inicial do 2FA: confirma a senha e devolve o QR code + códigos de backup. */
export async function startTwoFactorSetup(_: SetupState, f: FormData): Promise<SetupState> {
  await requireStaff({ allowWithout2FA: true });
  try {
    const res = await getAdminAuth().api.enableTwoFactor({
      body: { password: String(f.get("password") ?? ""), method: "totp" },
      headers: await headers(),
    });
    if (res.method !== "totp") return { error: "Método de 2FA inesperado." };
    const { totpURI, backupCodes } = res;
    const secret = new URL(totpURI).searchParams.get("secret") ?? undefined;
    return { qr: await QRCode.toDataURL(totpURI, { margin: 1, width: 220 }), secret, backupCodes };
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
}

export async function confirmTwoFactorSetup(prev: SetupState, f: FormData): Promise<SetupState> {
  await requireStaff({ allowWithout2FA: true });
  try {
    await getAdminAuth().api.verifyTOTP({ body: { code: str(f, "code").replace(/\s/g, "") }, headers: await headers() });
  } catch (err) {
    return { ...prev, error: authErrorMessage(err) };
  }
  redirect("/");
}

export async function signOutAction() {
  await getAdminAuth().api.signOut({ headers: await headers() });
  redirect("/entrar");
}
