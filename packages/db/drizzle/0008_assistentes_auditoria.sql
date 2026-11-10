CREATE TABLE "ai_telemetry_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by" uuid,
	"tool" text NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_read_tokens" bigint DEFAULT 0 NOT NULL,
	"cache_write_tokens" bigint DEFAULT 0 NOT NULL,
	"reasoning_tokens" bigint DEFAULT 0 NOT NULL,
	"cost_usd_micros" bigint,
	"duration_ms" integer,
	"session_id" text,
	"query_source" text,
	"actor" text,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "kind" text DEFAULT 'mudanca' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_snapshot_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_telemetry_sources" ADD CONSTRAINT "ai_telemetry_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_telemetry_sources" ADD CONSTRAINT "ai_telemetry_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_source_id_ai_telemetry_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."ai_telemetry_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_telemetry_sources_token_idx" ON "ai_telemetry_sources" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "ai_telemetry_sources_org_idx" ON "ai_telemetry_sources" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_usage_events_dedupe_idx" ON "ai_usage_events" USING btree ("source_id","fingerprint");--> statement-breakpoint
CREATE INDEX "ai_usage_events_org_time_idx" ON "ai_usage_events" USING btree ("org_id","occurred_at");--> statement-breakpoint
ALTER TABLE "ai_telemetry_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;