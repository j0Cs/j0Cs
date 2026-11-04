import "./env";
import { DEFAULT_MODELS, DEFAULT_PLANS, DEFAULT_PRICING_SETTINGS, PROVIDERS, type ProviderId } from "@forja/core";
import { encryptSecret, secretHint } from "@forja/core/server";
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, getDb } from "../client";
import { getPricingSettings, savePricingSettings } from "../mappers";
import {
  memberships,
  models,
  organizations,
  plans,
  projects,
  providerKeys,
  subscriptions,
  users,
} from "../schema";
import { addCredits } from "../store";

/**
 * Seed idempotente: catálogo, planos, configurações e uma conta demo.
 * Rodar de novo atualiza planos; preços de modelos editados no painel são preservados.
 */
const db = getDb();

for (const p of DEFAULT_PLANS) {
  await db
    .insert(plans)
    .values(p)
    .onConflictDoUpdate({
      target: plans.id,
      set: {
        name: p.name,
        description: p.description,
        priceBrlCents: p.priceBrlCents,
        includedCreditsBrlCents: p.includedCreditsBrlCents,
        seats: p.seats,
        maxProjects: p.maxProjects,
        allowedTiers: p.allowedTiers,
        sortOrder: p.sortOrder,
      },
    });
}
console.log(`✔ ${DEFAULT_PLANS.length} planos`);

for (const m of DEFAULT_MODELS) {
  await db.insert(models).values(m).onConflictDoNothing();
}
console.log(`✔ ${DEFAULT_MODELS.length} modelos no catálogo`);

const current = await getPricingSettings(db);
await savePricingSettings(db, { ...DEFAULT_PRICING_SETTINGS, ...current });
console.log("✔ configurações de precificação");

// Chaves de provedor vindas do .env (opcional) → criptografadas no pool da plataforma
if (process.env.ENCRYPTION_KEY) {
  for (const providerId of Object.keys(PROVIDERS) as ProviderId[]) {
    const raw = process.env[PROVIDERS[providerId].envKey];
    if (!raw) continue;
    const exists = await db.query.providerKeys.findFirst({
      where: and(eq(providerKeys.providerId, providerId), isNull(providerKeys.orgId)),
    });
    if (exists) continue;
    await db.insert(providerKeys).values({
      providerId,
      label: "Chave inicial (.env)",
      encryptedKey: encryptSecret(raw),
      keyHint: secretHint(raw),
      priority: 100,
    });
    console.log(`✔ chave ${providerId} cadastrada no pool`);
  }
}

// Conta demo para desenvolvimento
const email = process.env.DEV_USER_EMAIL ?? "demo@forja.dev";
let user = await db.query.users.findFirst({ where: eq(users.email, email) });
if (!user) {
  [user] = await db.insert(users).values({ email, name: "Usuário Demo" }).returning();
}
let org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "demo") });
if (!org) {
  [org] = await db.insert(organizations).values({ name: "Empresa Demo", slug: "demo", planId: "pro" }).returning();
  await db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  await db.insert(subscriptions).values({
    orgId: org!.id,
    planId: "pro",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: end,
  });
  const pro = DEFAULT_PLANS.find((p) => p.id === "pro")!;
  await addCredits(db, {
    orgId: org!.id,
    amountBrlMicros: pro.includedCreditsBrlCents * 10_000,
    kind: "plan_grant",
    description: "Créditos do plano Pro",
  });
  await db.insert(projects).values({
    orgId: org!.id,
    name: "Meu primeiro sistema",
    description: "Projeto de exemplo criado pelo seed.",
    defaultModelId: "claude-opus-5-5",
    instructions: "Responda em português do Brasil. Ao escrever código, use TypeScript.",
    createdBy: user!.id,
  });
  console.log("✔ conta demo (demo@forja.dev / organização 'demo', plano Pro)");
}

await closeDb();
