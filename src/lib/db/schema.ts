import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------- enums ----------
export const planEnum = pgEnum("plan", ["free", "pro"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "member"]);
export const profileStatusEnum = pgEnum("profile_status", ["pending", "analyzing", "ready", "failed"]);
export const playTypeEnum = pgEnum("play_type", ["hiring_signal", "decision_makers", "local_business"]);
export const playStatusEnum = pgEnum("play_status", ["draft", "queued", "running", "completed", "partial", "failed"]);
export const emailStatusEnum = pgEnum("email_status", ["unknown", "not_found", "unverified", "verified", "suppressed"]);
export const creditActionEnum = pgEnum("credit_action", ["grant", "search_result", "enrich_found", "verify", "draft", "refund", "adjustment"]);
export const channelEnum = pgEnum("channel", ["email", "linkedin_connect", "linkedin_message"]);
export const beliefStageEnum = pgEnum("belief_stage", ["problem_awareness", "problem_prioritization", "solution_preference", "commercial_agreement", "championship"]);
export const draftStatusEnum = pgEnum("draft_status", ["draft", "blocked", "approved", "sent_manually", "discarded"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["active", "stopped", "completed"]);
export const stopReasonEnum = pgEnum("stop_reason", ["replied", "opted_out", "suppressed", "manual"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "done", "skipped", "cancelled"]);
export const objectionTypeEnum = pgEnum("objection_type", ["authority", "no_need", "status_quo", "timing", "price_value", "no_budget", "trial_request", "solution_specific", "competitor", "other"]);
export const replyOutcomeEnum = pgEnum("reply_outcome", ["positive", "neutral", "negative", "meeting_booked", "opt_out", "wrong_person", "bounced"]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------- identity ----------
/** Mirrors auth.users (same id). Created on first authenticated request. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name"),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("free"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  senderName: text("sender_name"),
  senderCompany: text("sender_company"),
  senderPostalAddress: text("sender_postal_address"),
  dailySendCap: integer("daily_send_cap").notNull().default(25),
  maxContactsPerCompany: integer("max_contacts_per_company").notNull().default(2),
  ...timestamps,
}, (t) => [
  check("workspaces_contacts_cap_range", sql`${t.maxContactsPerCompany} between 1 and 2`),
  check("workspaces_daily_cap_positive", sql`${t.dailySendCap} > 0`),
]);

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: memberRoleEnum("role").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);

// ---------- profile & plays ----------
export type Icp = {
  industries: string[];
  companySizes: string[];
  geographies: string[];
  buyerTitles: string[];
  painPoints: string[];
  buyingSignals: string[];
  disqualifiers: string[];
};

export const companyProfiles = pgTable("company_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  siteUrl: text("site_url").notNull(),
  domain: text("domain").notNull(),
  companyName: text("company_name"),
  summary: text("summary"),
  offering: text("offering"),
  icp: jsonb("icp").$type<Icp>(),
  sourceUrls: text("source_urls").array().notNull().default(sql`'{}'::text[]`),
  status: profileStatusEnum("status").notNull().default("pending"),
  error: text("error"),
  ...timestamps,
}, (t) => [index("company_profiles_workspace_idx").on(t.workspaceId)]);

export const plays = pgTable("plays", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  companyProfileId: uuid("company_profile_id").notNull().references(() => companyProfiles.id, { onDelete: "cascade" }),
  type: playTypeEnum("type").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale"),
  params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
  status: playStatusEnum("status").notNull().default("draft"),
  creditEstimate: integer("credit_estimate").notNull().default(0),
  creditsSpent: integer("credits_spent").notNull().default(0),
  rowLimit: integer("row_limit").notNull().default(30),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("plays_workspace_idx").on(t.workspaceId)]);

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  playId: uuid("play_id").notNull().references(() => plays.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  company: text("company").notNull(),
  companyDomain: text("company_domain"),
  person: text("person"),
  title: text("title"),
  email: text("email"),
  emailStatus: emailStatusEnum("email_status").notNull().default("unknown"),
  emailProvider: text("email_provider"),
  /** Every lead must cite at least one source. Enforced by DB constraint. */
  sourceUrls: text("source_urls").array().notNull(),
  fitReason: text("fit_reason"),
  signal: jsonb("signal").$type<Record<string, unknown>>(),
  beliefStage: beliefStageEnum("belief_stage").notNull().default("problem_awareness"),
  ...timestamps,
}, (t) => [
  check("leads_has_source", sql`cardinality(${t.sourceUrls}) >= 1`),
  index("leads_play_idx").on(t.playId),
  index("leads_workspace_idx").on(t.workspaceId),
  uniqueIndex("leads_dedupe_idx").on(t.playId, sql`coalesce(${t.companyDomain}, ${t.company})`, sql`coalesce(${t.person}, '')`),
]);

// ---------- credits ----------
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** positive = grant, negative = spend */
  delta: integer("delta").notNull(),
  action: creditActionEnum("action").notNull(),
  reason: text("reason").notNull(),
  refType: text("ref_type"),
  refId: uuid("ref_id"),
  /** Deterministic per charge so retries never double-charge. */
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("credit_ledger_idem_idx").on(t.idempotencyKey),
  index("credit_ledger_workspace_idx").on(t.workspaceId),
]);

// ---------- outreach ----------
export const suppressionList = pgTable("suppression_list", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email"),
  domain: text("domain"),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("suppression_one_target", sql`(${t.email} is not null) <> (${t.domain} is not null)`),
  uniqueIndex("suppression_email_idx").on(t.workspaceId, t.email),
  uniqueIndex("suppression_domain_idx").on(t.workspaceId, t.domain),
]);

export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  channel: channelEnum("channel").notNull(),
  /** Days after the previous step is marked done. 0 for the first step. */
  waitDays: integer("wait_days").notNull().default(7),
  intent: text("intent"),
}, (t) => [
  uniqueIndex("sequence_steps_position_idx").on(t.sequenceId, t.position),
  check("sequence_steps_wait_nonneg", sql`${t.waitDays} >= 0`),
]);

export const sequenceEnrollments = pgTable("sequence_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  sequenceId: uuid("sequence_id").notNull().references(() => sequences.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  status: enrollmentStatusEnum("status").notNull().default("active"),
  stopReason: stopReasonEnum("stop_reason"),
  currentPosition: integer("current_position").notNull().default(1),
  nextDueAt: timestamp("next_due_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [
  uniqueIndex("enrollments_lead_sequence_idx").on(t.leadId, t.sequenceId),
  index("enrollments_workspace_idx").on(t.workspaceId),
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => sequenceSteps.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  channel: channelEnum("channel").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  status: taskStatusEnum("status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("tasks_owner_due_idx").on(t.ownerUserId, t.status, t.dueAt)]);

export const outreachDrafts = pgTable("outreach_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  beliefStage: beliefStageEnum("belief_stage").notNull(),
  /** Required on follow-ups: { type: "angle" | "proof" | "resource", detail: string } */
  newValue: jsonb("new_value").$type<{ type: "angle" | "proof" | "resource"; detail: string }>(),
  status: draftStatusEnum("status").notNull().default("draft"),
  blockReasons: text("block_reasons").array().notNull().default(sql`'{}'::text[]`),
  model: text("model"),
  ...timestamps,
}, (t) => [index("drafts_lead_idx").on(t.leadId)]);

export const leadReplies = pgTable("lead_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  enrollmentId: uuid("enrollment_id").references(() => sequenceEnrollments.id, { onDelete: "set null" }),
  channel: channelEnum("channel").notNull(),
  replyText: text("reply_text"),
  objectionType: objectionTypeEnum("objection_type"),
  outcome: replyOutcomeEnum("outcome").notNull(),
  loggedBy: uuid("logged_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("lead_replies_lead_idx").on(t.leadId)]);

// ---------- jobs queue ----------
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  status: jobStatusEnum("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lastError: text("last_error"),
  ...timestamps,
}, (t) => [index("jobs_claim_idx").on(t.status, t.runAfter)]);
