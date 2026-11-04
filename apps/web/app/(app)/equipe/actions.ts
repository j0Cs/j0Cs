"use server";

import { consumeRateLimit, createInvitation, OrgError, removeMember, revokeInvitation, type MemberRole } from "@forja/db";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/action-form";
import { sendInviteEmail } from "@/lib/invites";
import { canManage, getSession } from "@/lib/session";

export async function inviteAction(_: FormState, f: FormData): Promise<FormState> {
  const { db, org, role, user } = await getSession();
  if (!canManage(role)) return { error: "Só donos e administradores podem convidar." };
  if (!(await consumeRateLimit(db, `convite:org:${org.id}`, 20, 3600))) {
    return { error: "Limite de convites por hora atingido. Tente mais tarde." };
  }
  const inviteRole: MemberRole = String(f.get("role")) === "admin" ? "admin" : "member";
  try {
    const invite = await createInvitation(db, { orgId: org.id, email: String(f.get("email") ?? ""), role: inviteRole, invitedBy: user.id });
    await sendInviteEmail({ to: invite.email, orgName: org.name, inviter: user.name, token: invite.token });
    revalidatePath("/equipe");
    return { ok: `Convite enviado para ${invite.email}.` };
  } catch (err) {
    if (err instanceof OrgError) return { error: err.message };
    throw err;
  }
}

export async function removeMemberAction(f: FormData) {
  const { db, org, role } = await getSession();
  if (!canManage(role)) return;
  try {
    await removeMember(db, { orgId: org.id, userId: String(f.get("userId")) });
  } catch (err) {
    if (!(err instanceof OrgError)) throw err;
  }
  revalidatePath("/equipe");
}

export async function revokeInviteAction(f: FormData) {
  const { db, org, role } = await getSession();
  if (!canManage(role)) return;
  await revokeInvitation(db, { orgId: org.id, invitationId: String(f.get("id")) });
  revalidatePath("/equipe");
}
