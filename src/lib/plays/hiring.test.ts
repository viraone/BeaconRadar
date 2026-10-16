import { describe, expect, it } from "vitest";
import { mockLlm } from "@/lib/llm/llm";
import { MockAtsClient } from "@/lib/research/ats/mock";
import { MockSearch } from "@/lib/research/search/mock";
import { buildQueries, companyFromBoard, hiringPlay, roleTokens, titleMatchesRole } from "./hiring";
import type { PlayRunContext } from "./types";

describe("role matching", () => {
  it("drops seniority and filler words", () => {
    expect(roleTokens("Senior Marketing Manager")).toEqual(["marketing"]);
    expect(roleTokens("Head of Community")).toEqual(["community"]);
  });
  it.each([
    ["Growth Marketing Manager", "Marketing Manager", true],
    ["Events Marketing Manager", "Marketing Manager", true],
    ["Community Manager", "Marketing Manager", false],
    ["Line Cook", "Cook", true],
    ["Software Engineer", "Marketing Manager", false],
    ["Operations Managers", "Operations Manager", true],
  ])("%s vs %s -> %s", (title, role, expected) => {
    expect(titleMatchesRole(title, role)).toBe(expected);
  });
});

describe("params", () => {
  it("normalizes and validates", () => {
    expect(hiringPlay.parseParams({ roles: [" Marketing Manager ", "Marketing Manager", "Community Manager"] })).toEqual({ roles: ["Marketing Manager", "Community Manager"] });
    expect(() => hiringPlay.parseParams({ roles: [] })).toThrow();
    expect(() => hiringPlay.parseParams({})).toThrow();
    expect(buildQueries({ roles: ["Marketing Manager"], location: "Seattle" })).toEqual(['"Marketing Manager" Seattle job']);
  });
  it("derives a company name from a board slug", () => {
    expect(companyFromBoard({ source: "lever", board: "mock-fit_studios" })).toBe("Mock Fit Studios");
  });
});

function ctx(maxLeads: number): PlayRunContext {
  return {
    play: {} as PlayRunContext["play"],
    icp: {} as PlayRunContext["icp"],
    maxLeads,
    search: new MockSearch(),
    ats: new MockAtsClient(),
    llm: mockLlm,
    log: () => {},
  };
}

describe("hiringPlay.run (mock search + mock ATS)", () => {
  it("finds one lead per company with a matching posting, each with source URLs", async () => {
    const { leads, notes } = await hiringPlay.run(ctx(30), { roles: ["Marketing Manager"] });
    expect(notes.some((n) => /job boards discovered/.test(n))).toBe(true);
    const companies = leads.map((l) => l.company).sort();
    expect(companies).toEqual(["Mock Bistro Group (MOCK)", "Mock Retail Collective (MOCK)", "Mock Venue Co (MOCK)"]);
    for (const l of leads) {
      expect(l.sourceUrls.length).toBeGreaterThanOrEqual(1);
      expect(l.sourceUrls[0]).toMatch(/^https:\/\/(job-boards|boards)\.greenhouse\.io|jobs\.ashbyhq\.com/);
      expect(l.person).toBeNull();
      expect(l.fitReason).toMatch(/Hiring ".*"/);
      expect(l.signal).toMatchObject({ kind: "job_posting", matchedRole: "Marketing Manager" });
    }
    expect(new Set(leads.map((l) => l.company)).size).toBe(leads.length);
  });
  it("respects maxLeads", async () => {
    const { leads } = await hiringPlay.run(ctx(1), { roles: ["Marketing Manager", "Community Manager"] });
    expect(leads).toHaveLength(1);
  });
  it("returns nothing when no posting matches", async () => {
    const { leads } = await hiringPlay.run(ctx(30), { roles: ["Astronaut"] });
    expect(leads).toEqual([]);
  });
});
