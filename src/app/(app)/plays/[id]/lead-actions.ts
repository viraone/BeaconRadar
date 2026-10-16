"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";

/** Removes a lead. Credits already spent on it are not refunded (it was found). */
export async function deleteLead(leadId: string, playId: string): Promise<{ error?: string } | undefined> {
  const ctx = await requireWorkspace(`/plays/${playId}`);
  await db.delete(schema.leads).where(and(eq(schema.leads.id, leadId), eq(schema.leads.workspaceId, ctx.workspace.id)));
  revalidatePath(`/plays/${playId}`);
  return undefined;
}
