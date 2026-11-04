"use server";

import { encryptSecret, secretHint } from "@forja/core/server";
import { and, eq, schema } from "@forja/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CONNECTORS, verifyConnector, type ConnectorType } from "@/lib/connectors";
import { getSession } from "@/lib/session";

export async function connect(formData: FormData) {
  const { db, org } = await getSession();
  const type = String(formData.get("type")) as ConnectorType;
  const credential = String(formData.get("credential") ?? "").trim();
  const def = CONNECTORS.find((c) => c.type === type && c.available);
  if (!def || !credential) redirect(`/conectores?erro=${encodeURIComponent("Preencha a credencial.")}`);

  const result = await verifyConnector(type, credential);
  if (!result.ok) redirect(`/conectores?erro=${encodeURIComponent(`${def.name}: ${result.error}`)}`);

  await db.insert(schema.connectors).values({
    orgId: org.id,
    type,
    name: result.account ? `${def.name} · ${result.account}` : def.name,
    encryptedCredentials: encryptSecret(credential),
    credentialHint: secretHint(credential),
    metadata: { account: result.account ?? null, verifiedAt: new Date().toISOString() },
  });
  revalidatePath("/conectores");
  redirect("/conectores?ok=1");
}

export async function disconnect(formData: FormData) {
  const { db, org } = await getSession();
  await db
    .delete(schema.connectors)
    .where(and(eq(schema.connectors.id, String(formData.get("id"))), eq(schema.connectors.orgId, org.id)));
  revalidatePath("/conectores");
}
