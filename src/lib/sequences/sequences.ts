import { and, asc, eq } from "drizzle-orm";
import { DEFAULT_SEQUENCE } from "@/config/outreach";
import { db, schema } from "@/lib/db/client";

export type SequenceWithSteps = typeof schema.sequences.$inferSelect & { steps: Array<typeof schema.sequenceSteps.$inferSelect> };

/** Every workspace gets the default sequence on first use. Idempotent. */
export async function ensureDefaultSequence(workspaceId: string): Promise<SequenceWithSteps> {
  const existing = await listSequences(workspaceId);
  const def = existing.find((s) => s.isDefault) ?? existing[0];
  if (def) return def;
  return db.transaction(async (tx) => {
    const [seq] = await tx.insert(schema.sequences).values({ workspaceId, name: DEFAULT_SEQUENCE.name, isDefault: true }).returning();
    const steps = await tx
      .insert(schema.sequenceSteps)
      .values(DEFAULT_SEQUENCE.steps.map((s) => ({ sequenceId: seq.id, position: s.position, channel: s.channel, waitDays: s.waitDays, intent: s.intent })))
      .returning();
    return { ...seq, steps };
  });
}

export async function listSequences(workspaceId: string): Promise<SequenceWithSteps[]> {
  const seqs = await db.select().from(schema.sequences).where(eq(schema.sequences.workspaceId, workspaceId)).orderBy(asc(schema.sequences.createdAt));
  if (seqs.length === 0) return [];
  const steps = await db.select().from(schema.sequenceSteps).orderBy(asc(schema.sequenceSteps.position));
  return seqs.map((s) => ({ ...s, steps: steps.filter((st) => st.sequenceId === s.id) }));
}

export async function getSequence(workspaceId: string, id: string): Promise<SequenceWithSteps | null> {
  const [seq] = await db.select().from(schema.sequences).where(and(eq(schema.sequences.id, id), eq(schema.sequences.workspaceId, workspaceId))).limit(1);
  if (!seq) return null;
  const steps = await db.select().from(schema.sequenceSteps).where(eq(schema.sequenceSteps.sequenceId, id)).orderBy(asc(schema.sequenceSteps.position));
  return { ...seq, steps };
}

export async function updateStep(workspaceId: string, stepId: string, patch: { waitDays?: number; intent?: string; channel?: "email" | "linkedin_connect" | "linkedin_message" }) {
  const [step] = await db
    .select({ id: schema.sequenceSteps.id, sequenceId: schema.sequenceSteps.sequenceId, position: schema.sequenceSteps.position })
    .from(schema.sequenceSteps)
    .innerJoin(schema.sequences, eq(schema.sequences.id, schema.sequenceSteps.sequenceId))
    .where(and(eq(schema.sequenceSteps.id, stepId), eq(schema.sequences.workspaceId, workspaceId)))
    .limit(1);
  if (!step) throw new Error("Step not found.");
  if (patch.waitDays !== undefined && step.position === 1 && patch.waitDays !== 0) throw new Error("The first step is always due immediately.");
  await db.update(schema.sequenceSteps).set(patch).where(eq(schema.sequenceSteps.id, stepId));
}

export async function addStep(workspaceId: string, sequenceId: string, input: { channel: "email" | "linkedin_connect" | "linkedin_message"; waitDays: number; intent: string }) {
  const seq = await getSequence(workspaceId, sequenceId);
  if (!seq) throw new Error("Sequence not found.");
  if (seq.steps.length >= 6) throw new Error("A sequence can have at most 6 steps.");
  const position = (seq.steps.at(-1)?.position ?? 0) + 1;
  await db.insert(schema.sequenceSteps).values({ sequenceId, position, channel: input.channel, waitDays: position === 1 ? 0 : input.waitDays, intent: input.intent });
}

export async function removeLastStep(workspaceId: string, sequenceId: string) {
  const seq = await getSequence(workspaceId, sequenceId);
  if (!seq) throw new Error("Sequence not found.");
  if (seq.steps.length <= 1) throw new Error("A sequence needs at least one step.");
  const last = seq.steps.at(-1)!;
  await db.delete(schema.sequenceSteps).where(eq(schema.sequenceSteps.id, last.id));
}
