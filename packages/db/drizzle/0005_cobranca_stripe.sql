ALTER TYPE "public"."subscription_status" ADD VALUE 'incomplete';--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"payment_intent_id" text,
	"amount_brl_cents" integer NOT NULL,
	"credits_brl_micros" bigint DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"method" text,
	"refunded_brl_cents" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hosted_url" text,
	"failure_message" text,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"event_created_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "past_due_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plan_credits_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "low_balance_notified" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "min_seats" integer;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "amount_brl_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_org_created_idx" ON "payments" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_intent_idx" ON "payments" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_referencia_unica" ON "credit_ledger" USING btree ("kind","reference_id") WHERE "credit_ledger"."reference_id" is not null and "credit_ledger"."kind" in ('plan_grant', 'topup', 'refund', 'expiry');--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_billing_customer_unico" ON "organizations" USING btree ("billing_customer_id") WHERE "organizations"."billing_customer_id" is not null;--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_externa_unica" ON "subscriptions" USING btree ("billing_provider","external_id") WHERE "subscriptions"."external_id" is not null;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- teste grátis: o fim vem da assinatura "trial" criada no cadastro
UPDATE "organizations" o SET "trial_ends_at" = s."current_period_end"
  FROM "subscriptions" s
  WHERE s."org_id" = o."id" AND s."plan_id" = 'trial' AND o."trial_ends_at" IS NULL;--> statement-breakpoint
-- o plano Equipe é cobrado por assento, com no mínimo 3
UPDATE "plans" SET "min_seats" = 3 WHERE "id" = 'equipe' AND "min_seats" IS NULL;--> statement-breakpoint
UPDATE "subscriptions" s SET "amount_brl_cents" = p."price_brl_cents" * s."seats"
  FROM "plans" p
  WHERE p."id" = s."plan_id" AND s."amount_brl_cents" = 0;
