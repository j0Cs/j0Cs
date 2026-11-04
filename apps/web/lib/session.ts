import { getWebAuth } from "@forja/auth";
import { eq, getDb, listUserOrganizations, schema } from "@forja/db";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const ACTIVE_ORG_COOKIE = "forja_org";

/** Usuário logado (ou null), sem exigir organização. */
export const getAuthUser = cache(async () => {
  const session = await getWebAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
});

/**
 * Sessão completa da área logada: usuário + organização ativa + plano + papel.
 * Sem login → /entrar. Sem organização → /onboarding.
 */
export const getSession = cache(async () => {
  const user = await getAuthUser();
  if (!user) redirect("/entrar");
  const ctx = await loadOrgContext(user);
  if (!ctx) redirect("/onboarding");
  return ctx;
});

/** Variante para rotas de API: devolve null em vez de redirecionar. */
export async function getApiSession() {
  const user = await getAuthUser();
  if (!user) return null;
  return loadOrgContext(user);
}

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;

async function loadOrgContext(user: AuthUser) {
  const db = getDb();
  const orgs = await listUserOrganizations(db, user.id);
  if (orgs.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  const active = orgs.find((o) => o.org.id === preferred) ?? orgs[0]!;
  const plan = active.org.planId
    ? await db.query.plans.findFirst({ where: eq(schema.plans.id, active.org.planId) })
    : undefined;
  return {
    db,
    user: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified },
    org: active.org,
    role: active.role,
    plan,
    orgs,
  };
}

export const canManage = (role: string) => role === "owner" || role === "admin";
