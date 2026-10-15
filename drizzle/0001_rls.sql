-- Defense in depth: the app talks to Postgres with its own role and checks
-- workspace membership in server code. Enabling RLS with no policies means the
-- Supabase REST API (anon/authenticated roles) cannot read or write these tables.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "suppression_list" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequence_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequence_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outreach_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
