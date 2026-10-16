"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/workspace";
import { db, schema } from "@/lib/db/client";
import { normalizeDomain, normalizeEmail } from "@/lib/outreach/suppression";

export type SettingsResult = { error?: string; ok?: boolean; message?: string } | undefined;

const senderSchema = z.object({
  senderName: z.string().trim().min(1, "Your name is required.").max(120),
  senderCompany: z.string().trim().min(1, "Company name is required.").max(120),
  senderPostalAddress: z.string().trim().min(8, "A postal address is required by CAN-SPAM.").max(300),
  dailySendCap: z.coerce.number().int().min(1).max(200),
  maxContactsPerCompany: z.coerce.number().int().min(1).max(2),
});

export async function updateSender(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  const ctx = await requireWorkspace("/settings");
  if (ctx.role !== "owner") return { error: "Only the workspace owner can change sender settings." };
  const parsed = senderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  await db.update(schema.workspaces).set({ ...parsed.data, updatedAt: new Date() }).where(eq(schema.workspaces.id, ctx.workspace.id));
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

/** Paste one email or domain per line (commas also fine). */
export async function addSuppression(_prev: SettingsResult, formData: FormData): Promise<SettingsResult> {
  const ctx = await requireWorkspace("/settings");
  const raw = String(formData.get("entries") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200) || "Added manually";
  const items = raw.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return { error: "Enter at least one email or domain." };
  const rows: Array<{ workspaceId: string; email: string | null; domain: string | null; reason: string }> = [];
  const bad: string[] = [];
  for (const item of items) {
    if (item.includes("@")) {
      const email = normalizeEmail(item);
      if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) rows.push({ workspaceId: ctx.workspace.id, email, domain: null, reason });
      else bad.push(item);
    } else {
      const domain = normalizeDomain(item.replace(/^https?:\/\//, "").split("/")[0]);
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) rows.push({ workspaceId: ctx.workspace.id, email: null, domain, reason });
      else bad.push(item);
    }
  }
  if (rows.length) await db.insert(schema.suppressionList).values(rows).onConflictDoNothing();
  revalidatePath("/settings");
  return { ok: true, message: `Added ${rows.length}.${bad.length ? ` Ignored ${bad.length} invalid: ${bad.slice(0, 3).join(", ")}` : ""}` };
}

export async function removeSuppression(id: string): Promise<SettingsResult> {
  const ctx = await requireWorkspace("/settings");
  await db.delete(schema.suppressionList).where(and(eq(schema.suppressionList.id, id), eq(schema.suppressionList.workspaceId, ctx.workspace.id)));
  revalidatePath("/settings");
  return { ok: true };
}
