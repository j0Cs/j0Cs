ALTER TYPE "public"."usage_status" ADD VALUE 'aborted';--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_sessions" ALTER COLUMN "status" SET DEFAULT 'connecting';--> statement-breakpoint
CREATE UNIQUE INDEX "voice_sessions_um_por_usuario" ON "voice_sessions" USING btree ("user_id") WHERE "voice_sessions"."status" <> 'closed';--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
