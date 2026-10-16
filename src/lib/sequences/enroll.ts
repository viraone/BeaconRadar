import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { isSuppressed, loadSuppression } from "@/lib/outreach/suppression";
import { checkCompanyCap } from "./limits";
import { getSequence } from "./sequences";

export type EnrollOutcome = { leadId: string; company: string; person: string | null; ok: boolean; reason?: string; taskId?: string };

function companyKey(lead: { companyDomain: string | null; company: string }): string {
  return (lead.companyDomain ?? lead.company).toLowerCase();
}

/**
 * Enroll leads in a sequence. Each lead needs a person, must not be suppressed,
 * and the company must be under its contact cap. Creates the step-1 task (due now).
 * Returns per-lead outcomes so the UI can say exactly why something was skipped.
 */
export async function enrollLeads(input: { workspaceId: string; userId: string; sequenceId: string; leadIds: string[] }): Promise<EnrollOutcome[]> {
  const seq = await getSequence(input.workspaceId, input.sequenceId);
  if (!seq || seq.steps.length === 0) throw new Error("Sequence not found or has no steps.");
  const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, input.workspaceId)).limit(1);
  if (!workspace) throw new Error("Workspace not found.");
  const leads = input.leadIds.length
    ? await db.select().from(schema.leads).where(and(eq(schema.leads.workspaceId, input.workspaceId), inArray(schema.leads.id, input.leadIds)))
    : [];
  const suppression = await loadSuppression(input.workspaceId);

  // who is already in a sequence, per company (active + completed count toward the cap)
  const existing = await db
    .select({ leadId: schema.sequenceEnrollments.leadId, sequenceId: schema.sequenceEnrollments.sequenceId, company: schema.leads.company, companyDomain: schema.leads.companyDomain, person: schema.leads.person })
    .from(schema.sequenceEnrollments)
    .innerJoin(schema.leads, eq(schema.leads.id, schema.sequenceEnrollments.leadId))
    .where(and(eq(schema.sequenceEnrollments.workspaceId, input.workspaceId), ne(schema.sequenceEnrollments.status, "stopped")));
  const contactsByCompany = new Map<string, Set<string>>();
  for (const e of existing) {
    const k = companyKey(e);
    if (!contactsByCompany.has(k)) contactsByCompany.set(k, new Set());
    contactsByCompany.get(k)!.add((e.person ?? e.leadId).toLowerCase());
  }
  const enrolledLeadIds = new Set(existing.filter((e) => e.sequenceId === seq.id).map((e) => e.leadId));

  const outcomes: EnrollOutcome[] = [];
  for (const lead of leads) {
    const base = { leadId: lead.id, company: lead.company, person: lead.person };
    if (!lead.person) {
      outcomes.push({ ...base, ok: false, reason: "needs a contact name" });
      continue;
    }
    if (isSuppressed({ email: lead.email, companyDomain: lead.companyDomain }, suppression)) {
      outcomes.push({ ...base, ok: false, reason: "on the suppression list" });
      continue;
    }
    const k = companyKey(lead);
    const contacts = contactsByCompany.get(k) ?? new Set<string>();
    const cap = checkCompanyCap({
      enrolledContacts: contacts.has(lead.person.toLowerCase()) ? contacts.size - 1 : contacts.size,
      leadAlreadyEnrolled: enrolledLeadIds.has(lead.id),
      maxContactsPerCompany: workspace.maxContactsPerCompany,
    });
    if (!cap.ok) {
      outcomes.push({ ...base, ok: false, reason: cap.reason });
      continue;
    }

    const first = seq.steps[0];
    const now = new Date();
    const taskId = await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .insert(schema.sequenceEnrollments)
        .values({ sequenceId: seq.id, leadId: lead.id, workspaceId: input.workspaceId, ownerUserId: input.userId, status: "active", currentPosition: 1, nextDueAt: now })
        .returning();
      const [task] = await tx
        .insert(schema.tasks)
        .values({ enrollmentId: enrollment.id, stepId: first.id, leadId: lead.id, workspaceId: input.workspaceId, ownerUserId: input.userId, channel: first.channel, dueAt: now, status: "pending" })
        .returning();
      return task.id;
    });
    contacts.add(lead.person.toLowerCase());
    contactsByCompany.set(k, contacts);
    enrolledLeadIds.add(lead.id);
    outcomes.push({ ...base, ok: true, taskId });
  }
  return outcomes;
}
