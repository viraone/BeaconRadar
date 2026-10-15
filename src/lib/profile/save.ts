import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db/client";
import type { NormalizedSite } from "./url";

/** Creates or reuses the profile for this site in the workspace. `created` tells the caller whether to start analysis. */
export async function saveSiteUrl(workspaceId: string, site: NormalizedSite) {
  const [existing] = await db
    .select()
    .from(schema.companyProfiles)
    .where(and(eq(schema.companyProfiles.workspaceId, workspaceId), eq(schema.companyProfiles.domain, site.domain)))
    .limit(1);
  if (existing) return { profile: existing, created: false };

  const [created] = await db
    .insert(schema.companyProfiles)
    .values({ workspaceId, siteUrl: site.siteUrl, domain: site.domain, status: "pending" })
    .returning();
  return { profile: created, created: true };
}

export async function listProfiles(workspaceId: string) {
  return db
    .select()
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.workspaceId, workspaceId))
    .orderBy(desc(schema.companyProfiles.createdAt));
}

export async function getProfile(workspaceId: string, id: string) {
  const [p] = await db
    .select()
    .from(schema.companyProfiles)
    .where(and(eq(schema.companyProfiles.workspaceId, workspaceId), eq(schema.companyProfiles.id, id)))
    .limit(1);
  return p ?? null;
}
