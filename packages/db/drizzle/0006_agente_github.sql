CREATE TABLE "agent_task_files" (
	"task_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_task_files_task_id_path_pk" PRIMARY KEY("task_id","path")
);
--> statement-breakpoint
CREATE TABLE "agent_task_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"kind" text NOT NULL,
	"tool_name" text,
	"summary" text DEFAULT '' NOT NULL,
	"detail" text,
	"is_error" boolean DEFAULT false NOT NULL,
	"charge_brl_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid,
	"created_by" uuid,
	"title" text NOT NULL,
	"request" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"repo_full_name" text NOT NULL,
	"base_branch" text NOT NULL,
	"base_sha" text,
	"model_id" text NOT NULL,
	"status" text DEFAULT 'executando' NOT NULL,
	"budget_brl_micros" bigint DEFAULT 0 NOT NULL,
	"spent_brl_micros" bigint DEFAULT 0 NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" text,
	"summary" text,
	"pr_title" text,
	"stop_reason" text,
	"error" text,
	"branch" text,
	"pr_url" text,
	"pr_number" integer,
	"stop_requested" boolean DEFAULT false NOT NULL,
	"runner_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"installation_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text DEFAULT 'User' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "agent_daily_cap_brl_micros" bigint DEFAULT 100000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "agent_task_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_task_files" ADD CONSTRAINT "agent_task_files_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_task_steps" ADD CONSTRAINT "agent_task_steps_task_id_agent_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_task_steps_tarefa_idx" ON "agent_task_steps" USING btree ("task_id","idx");--> statement-breakpoint
CREATE INDEX "agent_tasks_org_created_idx" ON "agent_tasks" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_tasks_status_idx" ON "agent_tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_org_instalacao" ON "github_installations" USING btree ("org_id","installation_id");--> statement-breakpoint
CREATE INDEX "usage_events_agent_task_idx" ON "usage_events" USING btree ("agent_task_id");--> statement-breakpoint
ALTER TABLE "github_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_task_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_task_files" ENABLE ROW LEVEL SECURITY;
