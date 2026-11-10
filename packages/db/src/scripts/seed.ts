import { createHash } from "node:crypto";
import { somenteEmProducao } from "./env";
import { DEFAULT_MODELS, DEFAULT_PLANS, DEFAULT_PRICING_SETTINGS, PROVIDERS, type ProviderId } from "@forja/core";
import { encryptSecret, secretHint } from "@forja/core/server";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import { closeDb, getDb } from "../client";
import { getPricingSettings, savePricingSettings } from "../mappers";
import {
  accounts,
  memberships,
  models,
  organizations,
  plans,
  projects,
  providerKeys,
  sessions,
  settings,
  subscriptions,
  users,
} from "../schema";
import { addCredits } from "../store";

/**
 * Seed idempotente: catálogo, planos, configurações e uma conta demo.
 * Roda a cada deploy do painel, então só CRIA o que falta: planos e modelos editados no
 * painel são preservados. Para reaplicar os planos padrão do código: SEED_RESET_PLANS=1.
 */
somenteEmProducao("seed");

const db = getDb();

const reaplicarPlanos = process.env.SEED_RESET_PLANS === "1";
for (const p of DEFAULT_PLANS) {
  if (!reaplicarPlanos) {
    await db.insert(plans).values(p).onConflictDoNothing();
    continue;
  }
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
        kind: p.kind,
        minSeats: p.minSeats ?? null,
        maxProjects: p.maxProjects,
        allowedTiers: p.allowedTiers,
        sortOrder: p.sortOrder,
      },
    });
}
console.log(`✔ ${DEFAULT_PLANS.length} planos ${reaplicarPlanos ? "reaplicados" : "garantidos (edições do painel preservadas)"}`);

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

/** Cria (ou reaproveita) um usuário com login por e-mail e senha. */
async function ensureUser(input: { email: string; name: string; password: string; platformRole?: string }) {
  let u = await db.query.users.findFirst({ where: eq(users.email, input.email) });
  if (!u) {
    [u] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, emailVerified: true, platformRole: input.platformRole ?? "customer" })
      .returning();
  } else if (!u.emailVerified) {
    // contas criadas pelo seed são confiáveis: e-mail já confirmado
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, u.id));
  }
  const credential = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, u!.id), eq(accounts.providerId, "credential")),
  });
  if (!credential) {
    await db.insert(accounts).values({
      userId: u!.id,
      providerId: "credential",
      accountId: u!.id,
      password: await hashPassword(input.password),
    });
  }
  return u!;
}

/** Banco no próprio computador (Docker do `pnpm db:up`)? Só nele a conta demo pode existir. */
function bancoLocal(): boolean {
  try {
    const host = new URL(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || process.env.POSTGRES_URL || "").hostname;
    return ["localhost", "127.0.0.1", "::1", "[::1]", "postgres"].includes(host);
  } catch {
    return false;
  }
}

// Valores de exemplo do .env.example: credenciais públicas no repositório, nunca viram conta staff.
const SENHA_DE_EXEMPLO = "troque-esta-senha";
const EMAIL_DE_EXEMPLO = "voce@suaempresa.com.br";

// Equipe do dono (painel admin). Na primeira entrada o painel exige configurar o 2FA.
if (process.env.ADMIN_PASSWORD === SENHA_DE_EXEMPLO || process.env.ADMIN_EMAIL?.toLowerCase() === EMAIL_DE_EXEMPLO) {
  console.warn("↷ conta do painel NÃO criada: ADMIN_EMAIL/ADMIN_PASSWORD ainda são os valores de exemplo do .env.example");
} else if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const staff = await ensureUser({
    email: process.env.ADMIN_EMAIL.toLowerCase(),
    name: "Administrador",
    password: process.env.ADMIN_PASSWORD,
    platformRole: "staff",
  });
  console.log(`✔ conta do painel do dono: ${staff.email}`);
  await trocaDeEmergencia(staff.id);
}

/**
 * Troca de emergência da senha do dono, sem e-mail e sem a senha passar por conversa:
 *   1. na Vercel (forja-admin → Settings → Environment Variables), edite ADMIN_PASSWORD com a senha nova
 *      (14 caracteres ou mais) e crie ADMIN_PASSWORD_RESET com um texto novo (ex.: a data de hoje);
 *   2. publique o painel de novo (Redeploy).
 * Vale para o painel e para o app (é a mesma conta). Aplica UMA vez por valor de ADMIN_PASSWORD_RESET,
 * encerra as sessões abertas e mantém o 2FA. Depois, pode apagar ADMIN_PASSWORD_RESET.
 */
async function trocaDeEmergencia(userId: string) {
  const pedido = process.env.ADMIN_PASSWORD_RESET?.trim();
  if (!pedido) return;
  const nova = process.env.ADMIN_PASSWORD ?? "";
  if (nova.length < 14) {
    console.warn("↷ troca de senha NÃO aplicada: ADMIN_PASSWORD precisa ter pelo menos 14 caracteres");
    return;
  }
  const marca = createHash("sha256").update(`troca:${pedido}`).digest("hex");
  const anterior = await db.query.settings.findFirst({ where: eq(settings.key, "admin_password_reset") });
  if ((anterior?.value as { marca?: string } | undefined)?.marca === marca) {
    console.log("↷ troca de senha já aplicada para este ADMIN_PASSWORD_RESET (use um valor novo para trocar de novo)");
    return;
  }
  const r = await db
    .update(accounts)
    .set({ password: await hashPassword(nova), updatedAt: new Date() })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .returning({ id: accounts.id });
  if (!r.length) {
    console.warn("↷ troca de senha NÃO aplicada: a conta do dono não tem senha cadastrada");
    return;
  }
  await db.delete(sessions).where(eq(sessions.userId, userId));
  const valor = { marca, aplicadaEm: new Date().toISOString() };
  await db
    .insert(settings)
    .values({ key: "admin_password_reset", value: valor })
    .onConflictDoUpdate({ target: settings.key, set: { value: valor, updatedAt: new Date() } });
  console.log("✔ senha do dono trocada pelo ADMIN_PASSWORD (pedido de troca aplicado); sessões encerradas, 2FA mantido");
}

// Conta demo (senha pública no README): SÓ com opt-in explícito, NUNCA em build da Vercel e só
// num banco local (rodar o seed do seu computador contra produção não cria a conta demo lá).
// Não dependa de NODE_ENV: no comando de build da Vercel ele pode não estar definido.
if (process.env.SEED_DEMO !== "1" || process.env.VERCEL || !bancoLocal()) {
  if (process.env.SEED_DEMO === "1" && !bancoLocal()) console.warn("↷ conta demo NÃO criada: o banco não é local");
  await closeDb();
  process.exit(0);
}
const email = process.env.DEV_USER_EMAIL ?? "demo@forja.dev";
const user = await ensureUser({ email, name: "Usuário Demo", password: process.env.DEV_USER_PASSWORD ?? "demo12345" });
let org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "demo") });
if (!org) {
  [org] = await db.insert(organizations).values({ name: "Empresa Demo", slug: "demo", planId: "pro", onboardedAt: new Date() }).returning();
  await db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);
  await db.insert(subscriptions).values({
    orgId: org!.id,
    planId: "pro",
    status: "active",
    seats: 3, // demo com 3 assentos para testar convites de equipe
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
  console.log(`✔ conta demo: ${email} / senha ${process.env.DEV_USER_PASSWORD ?? "demo12345"} (plano Pro)`);
}

await closeDb();
