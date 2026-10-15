import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import { PLANS } from "@/config/credits";
import { requireAuthUser, type AuthUser } from "./server";

export type WorkspaceContext = {
  user: AuthUser;
  workspace: typeof schema.workspaces.$inferSelect;
  role: "owner" | "member";
};

/**
 * Ensures a `users` row exists for the signed-in user and that they belong to a
 * workspace. First login creates a personal workspace and the signup credit grant.
 * Idempotent: safe to call on every request.
 */
export async function ensureUserAndWorkspace(user: AuthUser): Promise<WorkspaceContext> {
  return db.transaction(async (tx) => {
    await tx
      .insert(schema.users)
      .values({ id: user.id, email: user.email })
      .onConflictDoUpdate({ target: schema.users.id, set: { email: user.email, updatedAt: sql`now()` } });

    const existing = await tx
      .select({ workspace: schema.workspaces, role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
      .where(eq(schema.workspaceMembers.userId, user.id))
      .orderBy(schema.workspaceMembers.createdAt)
      .limit(1);

    if (existing[0]) return { user, workspace: existing[0].workspace, role: existing[0].role };

    const name = `${user.email.split("@")[0]}'s workspace`;
    const [workspace] = await tx.insert(schema.workspaces).values({ name }).returning();
    await tx.insert(schema.workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

    const grant = PLANS[workspace.plan].signupGrant;
    if (grant > 0) {
      await tx
        .insert(schema.creditLedger)
        .values({
          workspaceId: workspace.id,
          delta: grant,
          action: "grant",
          reason: "Signup grant",
          idempotencyKey: `grant:signup:${workspace.id}`,
        })
        .onConflictDoNothing();
    }
    return { user, workspace, role: "owner" };
  });
}

/** Use at the top of any authed page or action. Redirects to /login when signed out. */
export async function requireWorkspace(next?: string): Promise<WorkspaceContext> {
  const user = await requireAuthUser(next);
  return ensureUserAndWorkspace(user);
}

export async function getCreditBalance(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${schema.creditLedger.delta}), 0)::int` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.workspaceId, workspaceId));
  return row?.balance ?? 0;
}

export async function assertMember(workspaceId: string, userId: string) {
  const [m] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(and(eq(schema.workspaceMembers.workspaceId, workspaceId), eq(schema.workspaceMembers.userId, userId)))
    .limit(1);
  if (!m) throw new Error("Not a member of this workspace");
  return m.role;
}
