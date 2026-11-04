import { eq, getDb, schema } from "@forja/db";
import { connection } from "next/server";
import { cache } from "react";

/**
 * Sessão do usuário.
 *
 * ⚠️ PROVISÓRIO (Sprint 0): usa a conta demo do seed. Na Sprint 1 entra o login
 * real (Better Auth: e-mail + GitHub OAuth + organizações + 2FA) — só este arquivo muda.
 */
export const getSession = cache(async () => {
  await connection(); // tudo que depende de sessão é dinâmico
  const db = getDb();
  const email = process.env.DEV_USER_EMAIL ?? "demo@forja.dev";
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user) throw new Error("Usuário demo não encontrado. Rode `pnpm db:seed`.");

  const membership = await db.query.memberships.findFirst({ where: eq(schema.memberships.userId, user.id) });
  if (!membership) throw new Error("Usuário sem organização.");

  const org = await db.query.organizations.findFirst({ where: eq(schema.organizations.id, membership.orgId) });
  if (!org) throw new Error("Organização não encontrada.");

  const plan = org.planId ? await db.query.plans.findFirst({ where: eq(schema.plans.id, org.planId) }) : undefined;
  return { db, user, org, plan, role: membership.role };
});
