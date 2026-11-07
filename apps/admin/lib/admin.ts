import { getAdminAuth } from "@forja/auth";
import { getDb } from "@forja/db";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

export const getAdminSession = cache(async () => {
  await connection();
  return getAdminAuth().api.getSession({ headers: await headers() });
});

/**
 * Exige usuário da equipe ("staff") com 2FA ativo. Chamado em TODA página e server
 * action do painel — o proxy só faz uma checagem otimista do cookie.
 */
export async function requireStaff(opts: { allowWithout2FA?: boolean } = {}) {
  const session = await getAdminSession();
  if (!session) redirect("/entrar");
  if (session.user.platformRole !== "staff") redirect("/entrar?erro=sem-acesso");
  if (!session.user.twoFactorEnabled && !opts.allowWithout2FA) redirect("/seguranca");
  return session.user;
}

/** Banco liberado só depois de validar a equipe. */
export async function adminDb() {
  await requireStaff();
  return getDb();
}

export const num = (v: FormDataEntryValue | null, fallback = 0) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};
