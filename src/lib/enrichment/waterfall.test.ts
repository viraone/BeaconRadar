import { describe, expect, it } from "vitest";
import { planEnrichmentCharges, estimateEnrichmentCredits } from "./charges";
import { mockA, mockB, mockAddress } from "./providers/mock";
import { NOT_FOUND, type EmailProvider, type EnrichResult } from "./types";
import { enrichWithWaterfall } from "./waterfall";

const input = { company: "Acme", companyDomain: "acme.com", person: "Jane Doe", title: "VP Ops" };

function provider(name: string, result: EnrichResult | Error, calls: string[]): EmailProvider {
  return {
    name,
    isMock: true,
    async findEmail() {
      calls.push(name);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}
const verified = (email: string): EnrichResult => ({ status: "verified", email, confidence: 0.9, sourceUrl: null });
const unverified = (email: string): EnrichResult => ({ status: "unverified", email, confidence: 0.5, sourceUrl: null });

describe("enrichWithWaterfall", () => {
  it("stops at the first verified result", async () => {
    const calls: string[] = [];
    const out = await enrichWithWaterfall(input, [provider("a", verified("jane@acme.example"), calls), provider("b", verified("other@acme.example"), calls)]);
    expect(out.provider).toBe("a");
    expect(out.result.email).toBe("jane@acme.example");
    expect(calls).toEqual(["a"]);
  });
  it("continues past not_found to the next provider", async () => {
    const calls: string[] = [];
    const out = await enrichWithWaterfall(input, [provider("a", NOT_FOUND, calls), provider("b", verified("j@acme.example"), calls)]);
    expect(out.provider).toBe("b");
    expect(calls).toEqual(["a", "b"]);
    expect(out.attempts.map((a) => a.status)).toEqual(["not_found", "verified"]);
  });
  it("prefers a later verified result over an earlier unverified one, but falls back to unverified", async () => {
    const calls: string[] = [];
    const better = await enrichWithWaterfall(input, [provider("a", unverified("guess@acme.example"), calls), provider("b", verified("sure@acme.example"), calls)]);
    expect(better.result).toMatchObject({ status: "verified", email: "sure@acme.example" });
    const only = await enrichWithWaterfall(input, [provider("a", unverified("guess@acme.example"), []), provider("b", NOT_FOUND, [])]);
    expect(only.result).toMatchObject({ status: "unverified", email: "guess@acme.example" });
    expect(only.provider).toBe("a");
  });
  it("skips providers that throw and records the error", async () => {
    const out = await enrichWithWaterfall(input, [provider("a", new Error("boom"), []), provider("b", verified("j@acme.example"), [])]);
    expect(out.provider).toBe("b");
    expect(out.attempts[0]).toEqual({ provider: "a", status: "error", error: "boom" });
  });
  it("returns not_found with no calls when there is no person", async () => {
    const calls: string[] = [];
    const out = await enrichWithWaterfall({ ...input, person: null }, [provider("a", verified("x@acme.example"), calls)]);
    expect(out.result).toEqual(NOT_FOUND);
    expect(calls).toEqual([]);
  });
});

describe("mock providers", () => {
  it("only produce .example addresses and need person + domain", () => {
    expect(mockAddress(input)).toBe("jdoe@acme.example");
    expect(mockAddress({ ...input, person: "Cher" })).toBe("cher@acme.example");
    expect(mockAddress({ ...input, companyDomain: "www.Acme.co.uk" })).toBe("jdoe@acme.example");
    expect(mockAddress({ ...input, person: null })).toBeNull();
    expect(mockAddress({ ...input, companyDomain: null })).toBeNull();
  });
  it("are deterministic and never return unverified from mockB", async () => {
    const a1 = await mockA.findEmail(input);
    const a2 = await mockA.findEmail(input);
    expect(a1).toEqual(a2);
    const statuses = new Set<string>();
    for (let i = 0; i < 40; i++) statuses.add((await mockB.findEmail({ ...input, companyDomain: `c${i}.com` })).status);
    expect(statuses.has("unverified")).toBe(false);
    expect(statuses.has("verified")).toBe(true);
    expect(statuses.has("not_found")).toBe(true);
  });
  it("every mock email ends in .example", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await mockA.findEmail({ ...input, person: `Ann ${i} Lee`, companyDomain: `company${i}.com` });
      if (r.email) expect(r.email).toMatch(/@company\d+\.example$/);
    }
  });
});

describe("enrichment charges", () => {
  it("charges found + verify for verified, found only for unverified, nothing for not_found", () => {
    expect(planEnrichmentCharges("L", "Acme", verified("x@a.example")).map((c) => [c.action, c.amount])).toEqual([["enrich_found", 2], ["verify", 1]]);
    expect(planEnrichmentCharges("L", "Acme", unverified("x@a.example")).map((c) => c.action)).toEqual(["enrich_found"]);
    expect(planEnrichmentCharges("L", "Acme", NOT_FOUND)).toEqual([]);
    expect(planEnrichmentCharges("L", "Acme", verified("x@a.example"))[0].idempotencyKey).toBe("lead:L:enrich_found");
  });
  it("estimates the upper bound", () => {
    expect(estimateEnrichmentCredits(10)).toBe(30);
  });
});
