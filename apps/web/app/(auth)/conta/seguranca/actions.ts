"use server";

import { authErrorMessage, caminhoInterno, getWebAuth } from "@forja/auth";
import { consumeRateLimit, getDb } from "@forja/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getAuthUser } from "@/lib/session";

export type Estado2FA = { error?: string | null; qr?: string; secret?: string; backupCodes?: string[] };

const MUITAS = "Muitas tentativas. Espere alguns minutos e tente de novo.";

async function usuarioDentroDoLimite() {
  const user = await getAuthUser();
  if (!user) redirect("/entrar");
  return (await consumeRateLimit(getDb(), `conta:2fa:${user.id}`, 10, 900)) ? user : null;
}

/** Confirma a senha e devolve o QR code e os códigos de backup. A proteção só liga depois do código. */
export async function iniciarDuasEtapasAction(_: Estado2FA, f: FormData): Promise<Estado2FA> {
  if (!(await usuarioDentroDoLimite())) return { error: MUITAS };
  try {
    const res = await getWebAuth().api.enableTwoFactor({ body: { password: String(f.get("password") ?? ""), method: "totp" }, headers: await headers() });
    if (res.method !== "totp") return { error: "Método de verificação inesperado." };
    const secret = new URL(res.totpURI).searchParams.get("secret") ?? undefined;
    return { qr: await QRCode.toDataURL(res.totpURI, { margin: 1, width: 220 }), secret, backupCodes: res.backupCodes };
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
}

export async function confirmarDuasEtapasAction(anterior: Estado2FA, f: FormData): Promise<Estado2FA> {
  if (!(await usuarioDentroDoLimite())) return { ...anterior, error: MUITAS };
  try {
    await getWebAuth().api.verifyTOTP({ body: { code: String(f.get("code") ?? "").replace(/\s/g, "") }, headers: await headers() });
  } catch (err) {
    return { ...anterior, error: authErrorMessage(err) };
  }
  redirect(caminhoInterno(f.get("depois"), "/conta/seguranca?ativada=1"));
}

export async function desligarDuasEtapasAction(_: Estado2FA, f: FormData): Promise<Estado2FA> {
  if (!(await usuarioDentroDoLimite())) return { error: MUITAS };
  try {
    await getWebAuth().api.disableTwoFactor({ body: { password: String(f.get("password") ?? "") }, headers: await headers() });
  } catch (err) {
    return { error: authErrorMessage(err) };
  }
  redirect("/conta/seguranca?desligada=1");
}
