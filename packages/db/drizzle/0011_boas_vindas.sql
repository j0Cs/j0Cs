ALTER TABLE "organizations" ADD COLUMN "document_type" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "document" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "team_size" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "intended_use" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
-- Empresas que já existiam não passam pelas boas-vindas.
UPDATE "organizations" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;
