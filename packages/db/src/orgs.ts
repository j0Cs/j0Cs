import { DEFAULT_PLANS, TRIAL_DAYS, TRIAL_PLAN_ID } from "@forja/core";
import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { invitations, memberships, organizations, plans, subscriptions, users } from "./schema";
import { addCredits } from "./store";

export type MemberRole = "owner" | "admin" | "member";

function slugify(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "empresa";
}

/**
 * Cria a organização de um novo cliente já no teste grátis:
 * plano "trial", assinatura de 7 dias e R$ 10 em créditos.
 */
export async function createOrganizationForUser(db: Db, input: { userId: string; name: string }) {
  const trial = DEFAULT_PLANS.find((p) => p.id === TRIAL_PLAN_ID)!;
  let slug = slugify(input.name);
  if (await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) })) {
    slug = `${slug}-${randomBytes(3).toString("hex")}`;
  }

  const org = await db.transaction(async (tx) => {
    const now = new Date();
    const fimDoTeste = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const [created] = await tx
      .insert(organizations)
      .values({ name: input.name.trim(), slug, planId: TRIAL_PLAN_ID, trialEndsAt: fimDoTeste, planCreditsSince: now })
      .returning();
    await tx.insert(memberships).values({ orgId: created!.id, userId: input.userId, role: "owner" });
    await tx.insert(subscriptions).values({
      orgId: created!.id,
      planId: TRIAL_PLAN_ID,
      status: "trialing",
      currentPeriodStart: now,
      currentPeriodEnd: fimDoTeste,
    });
    return created!;
  });

  await addCredits(db, {
    orgId: org.id,
    amountBrlMicros: trial.includedCreditsBrlCents * 10_000,
    kind: "plan_grant",
    description: "Créditos do teste grátis",
  });
  return org;
}

export async function listUserOrganizations(db: Db, userId: string) {
  return db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt);
}

export async function listMembers(db: Db, orgId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(memberships.createdAt);
}

export async function listPendingInvitations(db: Db, orgId: string) {
  return db
    .select()
    .from(invitations)
    .where(and(eq(invitations.orgId, orgId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
    .orderBy(invitations.createdAt);
}

/** Assentos usados (membros + convites pendentes) e o limite do plano. */
export async function seatUsage(db: Db, orgId: string) {
  const [org] = await db
    .select({ planSeats: plans.seats })
    .from(organizations)
    .leftJoin(plans, eq(plans.id, organizations.planId))
    .where(eq(organizations.id, orgId));
  const [sub] = await db
    .select({ seats: subscriptions.seats })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), sql`${subscriptions.status} in ('trialing','active')`))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);
  const [members] = await db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.orgId, orgId));
  const pending = (await listPendingInvitations(db, orgId)).length;
  const limit = Math.max(org?.planSeats ?? 1, sub?.seats ?? 1);
  return { used: (members?.n ?? 0) + pending, limit };
}

export class OrgError extends Error {}

export async function createInvitation(
  db: Db,
  input: { orgId: string; email: string; role: MemberRole; invitedBy: string },
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OrgError("E-mail inválido.");
  if (input.role === "owner") throw new OrgError("Convites podem ser só para admin ou membro.");

  const existing = await db
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.orgId, input.orgId), eq(users.email, email)));
  if (existing.length) throw new OrgError("Essa pessoa já faz parte da equipe.");

  const { used, limit } = await seatUsage(db, input.orgId);
  if (used >= limit) {
    throw new OrgError(`Seu plano tem ${limit} assento(s) e todos estão em uso. Aumente os assentos para convidar mais pessoas.`);
  }

  const [invite] = await db
    .insert(invitations)
    .values({
      orgId: input.orgId,
      email,
      role: input.role,
      token: randomBytes(24).toString("base64url"),
      invitedBy: input.invitedBy,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning();
  return invite!;
}

export async function getInvitation(db: Db, token: string) {
  const [row] = await db
    .select({ invite: invitations, orgName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.token, token))
    .limit(1);
  if (!row || row.invite.acceptedAt || row.invite.expiresAt < new Date()) return null;
  return row;
}

/** Aceita o convite: o e-mail da conta precisa ser o mesmo do convite. */
export async function acceptInvitation(db: Db, input: { token: string; userId: string; email: string }) {
  const found = await getInvitation(db, input.token);
  if (!found) throw new OrgError("Convite inválido ou expirado.");
  if (found.invite.email !== input.email.toLowerCase()) {
    throw new OrgError(`Este convite foi enviado para ${found.invite.email}. Entre com esse e-mail para aceitar.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(memberships)
      .values({ orgId: found.invite.orgId, userId: input.userId, role: found.invite.role })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, found.invite.id));
  });
  return found.invite.orgId;
}

export async function removeMember(db: Db, input: { orgId: string; userId: string }) {
  const owners = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, input.orgId), eq(memberships.role, "owner")));
  if (owners.length === 1 && owners[0]!.userId === input.userId) {
    throw new OrgError("A organização precisa de pelo menos um dono.");
  }
  await db.delete(memberships).where(and(eq(memberships.orgId, input.orgId), eq(memberships.userId, input.userId)));
}

export async function revokeInvitation(db: Db, input: { orgId: string; invitationId: string }) {
  await db.delete(invitations).where(and(eq(invitations.orgId, input.orgId), eq(invitations.id, input.invitationId)));
}
