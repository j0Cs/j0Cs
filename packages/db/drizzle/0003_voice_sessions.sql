CREATE TABLE "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid,
	"project_id" uuid,
	"conversation_id" uuid,
	"provider_id" "provider_id" NOT NULL,
	"provider_key_id" uuid,
	"provider_session_id" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_pulse_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billed_seconds" integer DEFAULT 0 NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text
);
--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_sessions_status_idx" ON "voice_sessions" USING btree ("status","last_pulse_at");--> statement-breakpoint
CREATE INDEX "voice_sessions_org_idx" ON "voice_sessions" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "voice_sessions" ENABLE ROW LEVEL SECURITY;
