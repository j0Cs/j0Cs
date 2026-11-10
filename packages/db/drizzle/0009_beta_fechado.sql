CREATE TABLE "beta_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"trial_days" integer NOT NULL,
	"credits_brl_cents" integer NOT NULL,
	"stripe_coupon_id" text,
	"offer" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invites_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "beta_invite_id" uuid;--> statement-breakpoint
ALTER TABLE "beta_invites" ENABLE ROW LEVEL SECURITY;