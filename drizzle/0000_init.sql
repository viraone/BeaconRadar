CREATE TYPE "public"."belief_stage" AS ENUM('problem_awareness', 'problem_prioritization', 'solution_preference', 'commercial_agreement', 'championship');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'linkedin_connect', 'linkedin_message');--> statement-breakpoint
CREATE TYPE "public"."credit_action" AS ENUM('grant', 'search_result', 'enrich_found', 'verify', 'draft', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('draft', 'blocked', 'approved', 'sent_manually', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('unknown', 'not_found', 'unverified', 'verified', 'suppressed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'stopped', 'completed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."objection_type" AS ENUM('authority', 'no_need', 'status_quo', 'timing', 'price_value', 'no_budget', 'trial_request', 'solution_specific', 'competitor', 'other');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."play_status" AS ENUM('draft', 'queued', 'running', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."play_type" AS ENUM('hiring_signal', 'decision_makers', 'local_business');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('pending', 'analyzing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reply_outcome" AS ENUM('positive', 'neutral', 'negative', 'meeting_booked', 'opt_out', 'wrong_person', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."stop_reason" AS ENUM('replied', 'opted_out', 'suppressed', 'manual');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'done', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TABLE "company_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"domain" text NOT NULL,
	"company_name" text,
	"summary" text,
	"offering" text,
	"icp" jsonb,
	"source_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "profile_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"action" "credit_action" NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"channel" "channel" NOT NULL,
	"reply_text" text,
	"objection_type" "objection_type",
	"outcome" "reply_outcome" NOT NULL,
	"logged_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company" text NOT NULL,
	"company_domain" text,
	"person" text,
	"title" text,
	"email" text,
	"email_status" "email_status" DEFAULT 'unknown' NOT NULL,
	"email_provider" text,
	"source_urls" text[] NOT NULL,
	"fit_reason" text,
	"signal" jsonb,
	"belief_stage" "belief_stage" DEFAULT 'problem_awareness' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_has_source" CHECK (cardinality("leads"."source_urls") >= 1)
);
--> statement-breakpoint
CREATE TABLE "outreach_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid,
	"channel" "channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"belief_stage" "belief_stage" NOT NULL,
	"new_value" jsonb,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"block_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_profile_id" uuid NOT NULL,
	"type" "play_type" NOT NULL,
	"title" text NOT NULL,
	"rationale" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "play_status" DEFAULT 'draft' NOT NULL,
	"credit_estimate" integer DEFAULT 0 NOT NULL,
	"credits_spent" integer DEFAULT 0 NOT NULL,
	"row_limit" integer DEFAULT 30 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"stop_reason" "stop_reason",
	"current_position" integer DEFAULT 1 NOT NULL,
	"next_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"channel" "channel" NOT NULL,
	"wait_days" integer DEFAULT 7 NOT NULL,
	"intent" text,
	CONSTRAINT "sequence_steps_wait_nonneg" CHECK ("sequence_steps"."wait_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text,
	"domain" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppression_one_target" CHECK (("suppression_list"."email" is not null) <> ("suppression_list"."domain" is not null))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"channel" "channel" NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"sender_name" text,
	"sender_company" text,
	"sender_postal_address" text,
	"daily_send_cap" integer DEFAULT 25 NOT NULL,
	"max_contacts_per_company" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_contacts_cap_range" CHECK ("workspaces"."max_contacts_per_company" between 1 and 2),
	CONSTRAINT "workspaces_daily_cap_positive" CHECK ("workspaces"."daily_send_cap" > 0)
);
--> statement-breakpoint
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_replies" ADD CONSTRAINT "lead_replies_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_company_profile_id_company_profiles_id_fk" FOREIGN KEY ("company_profile_id") REFERENCES "public"."company_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression_list" ADD CONSTRAINT "suppression_list_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_profiles_workspace_idx" ON "company_profiles" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_idem_idx" ON "credit_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_ledger_workspace_idx" ON "credit_ledger" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "lead_replies_lead_idx" ON "lead_replies" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "leads_play_idx" ON "leads" USING btree ("play_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_idx" ON "leads" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_dedupe_idx" ON "leads" USING btree ("play_id",coalesce("company_domain", "company"),coalesce("person", ''));--> statement-breakpoint
CREATE INDEX "drafts_lead_idx" ON "outreach_drafts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "plays_workspace_idx" ON "plays" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_lead_sequence_idx" ON "sequence_enrollments" USING btree ("lead_id","sequence_id");--> statement-breakpoint
CREATE INDEX "enrollments_workspace_idx" ON "sequence_enrollments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_position_idx" ON "sequence_steps" USING btree ("sequence_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_email_idx" ON "suppression_list" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "suppression_domain_idx" ON "suppression_list" USING btree ("workspace_id","domain");--> statement-breakpoint
CREATE INDEX "tasks_owner_due_idx" ON "tasks" USING btree ("owner_user_id","status","due_at");