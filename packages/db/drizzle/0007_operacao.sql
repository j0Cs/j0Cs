CREATE TABLE "cost_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" text NOT NULL,
	"provider_id" "provider_id" NOT NULL,
	"recorded_usd_micros" bigint DEFAULT 0 NOT NULL,
	"reported_usd_micros" bigint,
	"diff_percent_x100" integer,
	"status" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'aviso' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "vercel_project_id" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "vercel_deployment_id" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "preview_url" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "preview_state" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "preview_error" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "preview_notified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "supabase_project_ref" text;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "migrations" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_reconciliations_dia_provedor" ON "cost_reconciliations" USING btree ("day","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_alerts_aberto_unico" ON "owner_alerts" USING btree ("dedupe_key") WHERE "owner_alerts"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "owner_alerts_created_idx" ON "owner_alerts" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_reconciliations" ENABLE ROW LEVEL SECURITY;
