"use server";

import { authErrorMessage, getAdminAuth } from "@forja/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireStaff } from "@/lib/admin";

type State = { error?: string | null; ok?: string | null };
export type SetupState = State & { qr?: string; secret?: string; backupCodes?: string[] };

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function rejectNonStaff(platformRole: unknown): Promise<State | null> {
  if (platformRole === "staff") return null;
  await getAdminAuth().api.signOut({ headers: await headers() });
  return { error: "Esta conta não tem acesso ao painel." };
}

export async function signInAction(_: State, f: FormData): Promise<State> {
  let next = "/";
  try {
    const res = await getAdminAuth().api.signInEmail({
      body: { email: str(f, "email").toLowerCase(), password: String(f.get("password") ?? "") },
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
