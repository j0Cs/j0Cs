"use server";

import { getWebAuth } from "@forja/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, getAuthUser, getSession } from "@/lib/session";

export async function signOut() {
  await getWebAuth().api.signOut({ headers: await headers() });
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/entrar");
}

export async function switchOrg(formData: FormData) {
  const { orgs } = await getSession();
  const id = String(formData.get("orgId"));
  if (orgs.some((o) => o.org.id === id)) {
    (await cookies()).set(ACTIVE_ORG_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  redirect("/projetos");
}

export async function resendVerification() {
  const user = await getAuthUser();
  if (!user || user.emailVerified) return;
  await getWebAuth().api.sendVerificationEmail({ body: { email: user.email, callbackURL: "/projetos" }, headers: await headers() });
}
