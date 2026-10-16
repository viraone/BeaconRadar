import { describe, expect, it } from "vitest";
import type { LeadRow } from "./leads";
import { buildLeadsCsv, canExport } from "./leads";

const lead = (over: Partial<LeadRow>): LeadRow =>
  ({
    id: "l1", playId: "p", workspaceId: "w", company: "Acme, Inc", companyDomain: "acme.com", person: null, title: null,
    email: null, emailStatus: "unknown", emailProvider: null, sourceUrls: ["https://a/1", "https://a/2"], fitReason: "=fit",
    signal: { title: "Marketing Manager", location: "Seattle", postedAt: "2026-10-01T00:00:00Z" }, beliefStage: "problem_awareness",
    createdAt: new Date("2026-10-15T00:00:00Z"), updatedAt: new Date("2026-10-15T00:00:00Z"),
    ...over,
  }) as LeadRow;

describe("canExport", () => {
  it("free cannot, pro can", () => {
    expect(canExport("free")).toBe(false);
    expect(canExport("pro")).toBe(true);
  });
});

describe("buildLeadsCsv", () => {
  it("writes a header, 'not found' for nulls, joined sources, and escapes", () => {
    const { csv, exported, suppressed } = buildLeadsCsv([lead({})], []);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("company,company_domain,person,title,email,email_status,fit_reason,signal_title,signal_location,signal_posted_at,source_urls,found_at");
    expect(lines[1]).toBe('"Acme, Inc",acme.com,not found,not found,not found,unknown,\'=fit,Marketing Manager,Seattle,2026-10-01,https://a/1 https://a/2,2026-10-15T00:00:00.000Z');
    expect(exported).toBe(1);
    expect(suppressed).toBe(0);
  });
  it("drops suppressed leads and counts them", () => {
    const out = buildLeadsCsv([lead({}), lead({ id: "l2", companyDomain: "blocked.io" })], [{ email: null, domain: "blocked.io" }]);
    expect(out.exported).toBe(1);
    expect(out.suppressed).toBe(1);
    expect(out.csv).not.toContain("blocked.io");
  });
});
