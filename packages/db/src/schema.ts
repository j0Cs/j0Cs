import type { ModelPricing, ModelTier } from "@forja/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/*
 * Modelo de dados multi-tenant: tudo que pertence a um cliente tem `org_id`.
 * Dinheiro sempre em inteiros (micro-reais / micro-dólares / centavos) — ver @forja/core/types.
 */

export const providerIdEnum = pgEnum("provider_id", ["anthropic", "openai", "google", "xai"]);
export const modelTierEnum = pgEnum("model_tier", ["economico", "intermediario", "avancado", "premium"]);
export const orgStatusEnum = pgEnum("org_status", ["active", "suspended"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["trialing", "active", "past_due", "canceled"]);
export const usageStatusEnum = pgEnum("usage_status", ["ok", "refused", "error", "aborted"]);
export const ledgerKindEnum = pgEnum("ledger_kind", ["plan_grant", "topup", "usage", "adjustment", "refund", "expiry"]);
export const keyStatusEnum = pgEnum("key_status", ["active", "disabled"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/*
 * Tabelas de autenticação (Better Auth). Os nomes dos campos em TypeScript seguem o
 * que a biblioteca espera (emailVerified, userId...); as colunas ficam em snake_case.
 */
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** "staff" = equipe do dono da plataforma (acesso ao painel admin). */
  platformRole: text("platform_role").notNull().default("customer"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** "credential" = e-mail e senha; "github" = login social. */
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_idx").on(t.userId), index("two_factors_secret_idx").on(t.secret)],
);

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceBrlCents: integer("price_brl_cents").notNull(),
  includedCreditsBrlCents: integer("included_credits_brl_cents").notNull(),
  seats: integer("seats").notNull().default(1),
  maxProjects: integer("max_projects"),
  allowedTiers: modelTierEnum("allowed_tiers").array().notNull().$type<ModelTier[]>(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: orgStatusEnum("status").notNull().default("active"),
  planId: text("plan_id").references(() => plans.id),
  /** Saldo atual (cache da soma do extrato, atualizado na mesma transação). */
  creditBalanceBrlMicros: money("credit_balance_brl_micros"),
  billingCustomerId: text("billing_customer_id"),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

/** Convites para entrar numa organização (link com token, válido por 7 dias). */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull().default("member"),
    token: text("token").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId: text("plan_id").notNull().references(() => plans.id),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  seats: integer("seats").notNull().default(1),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  /** stripe | asaas | manual */
  billingProvider: text("billing_provider").notNull().default("manual"),
  externalId: text("external_id"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Catálogo e chaves (gestão do dono)
// ---------------------------------------------------------------------------

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  providerId: providerIdEnum("provider_id").notNull(),
  displayName: text("display_name").notNull(),
  tier: modelTierEnum("tier").notNull(),
  description: text("description").notNull().default(""),
  contextWindow: integer("context_window"),
  pricing: jsonb("pricing").notNull().$type<ModelPricing>(),
  markupPercent: integer("markup_percent").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerKeys = pgTable(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: providerIdEnum("provider_id").notNull(),
    /** null = chave da plataforma (pool do dono); preenchido = BYOK do cliente. */
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    status: keyStatusEnum("status").notNull().default("active"),
    /** Menor = tentada primeiro. */
    priority: integer("priority").notNull().default(100),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("provider_keys_provider_idx").on(t.providerId, t.status, t.priority)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Área do cliente
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    defaultModelId: text("default_model_id").references(() => models.id),
    /** Instruções fixas do projeto (vão no system prompt e ficam em cache). */
    instructions: text("instructions").notNull().default(""),
    repoFullName: text("repo_full_name"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    modelId: text("model_id").notNull().references(() => models.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversations_project_idx").on(t.projectId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    modelId: text("model_id"),
    usageEventId: uuid("usage_event_id"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const connectors = pgTable(
  "connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    /** github | vercel | supabase | postgres | netlify | railway ... */
    type: text("type").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("connected"),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    credentialHint: text("credential_hint").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("connectors_org_idx").on(t.orgId)],
);

// ---------------------------------------------------------------------------
// Medição e cobrança
// ---------------------------------------------------------------------------

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    projectId: uuid("project_id"),
    conversationId: uuid("conversation_id"),
    modelId: text("model_id").notNull(),
    servedModelId: text("served_model_id").notNull(),
    providerId: providerIdEnum("provider_id").notNull(),
    providerKeyId: uuid("provider_key_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** O que a plataforma paga ao provedor. */
    costUsdMicros: money("cost_usd_micros"),
    /** O que foi debitado do cliente. */
    chargeBrlMicros: money("charge_brl_micros"),
    pricingSnapshot: jsonb("pricing_snapshot").notNull().$type<Record<string, unknown>>(),
    latencyMs: integer("latency_ms").notNull().default(0),
    status: usageStatusEnum("status").notNull(),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [
    index("usage_events_org_created_idx").on(t.orgId, t.createdAt),
    index("usage_events_created_idx").on(t.createdAt),
  ],
);

/** Extrato imutável de créditos: o saldo é a soma. Nunca apague ou edite linhas. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    amountBrlMicros: bigint("amount_brl_micros", { mode: "number" }).notNull(),
    kind: ledgerKindEnum("kind").notNull(),
    referenceId: text("reference_id"),
    description: text("description").notNull().default(""),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_org_created_idx").on(t.orgId, t.createdAt)],
);

/**
 * Chamadas de voz em nuvem (cobradas por segundo). O servidor cria a sessão no provedor,
 * cobra a cada "pulso" do navegador e encerra (hangup) quando o saldo acaba ou o pulso some.
 */
export const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    providerId: providerIdEnum("provider_id").notNull(),
    providerKeyId: uuid("provider_key_id"),
    providerSessionId: text("provider_session_id").notNull(),
    model: text("model").notNull(),
    /** connecting → active → closing (desligamento pendente no provedor) → closed */
    status: text("status").notNull().default("connecting"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastPulseAt: timestamp("last_pulse_at", { withTimezone: true }).notNull().defaultNow(),
    billedSeconds: integer("billed_seconds").notNull().default(0),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endReason: text("end_reason"),
  },
  (t) => [
    index("voice_sessions_status_idx").on(t.status, t.lastPulseAt),
    index("voice_sessions_org_idx").on(t.orgId),
    // no máximo UMA call em nuvem por pessoa (connecting/active/closing)
    uniqueIndex("voice_sessions_um_por_usuario").on(t.userId).where(sql`${t.status} <> 'closed'`),
  ],
);

/** Limite de tentativas (login, e-mails, convites) — as chamadas diretas ao Better Auth não passam pelo limitador dele. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});
