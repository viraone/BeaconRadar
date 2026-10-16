import type { EmailProvider, EnrichInput, EnrichResult } from "../types";
import { NOT_FOUND } from "../types";

/**
 * Deterministic stub providers for development. Rules that keep them honest:
 *  - they only answer when there is a person AND a company domain
 *  - every address is on the reserved `.example` TLD (RFC 2606): it can never
 *    reach a real inbox and is visibly fake
 *  - the outcome is a stable hash of the input, so the waterfall is testable
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function mockAddress(input: EnrichInput): string | null {
  if (!input.person || !input.companyDomain) return null;
  const parts = input.person.toLowerCase().normalize("NFKD").replace(/[^a-z\s'-]/g, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const local = parts.length === 1 ? parts[0] : `${parts[0][0]}${parts[parts.length - 1]}`;
  const base = input.companyDomain.toLowerCase().replace(/^www\./, "").split(".")[0];
  return `${local.replace(/[^a-z]/g, "")}@${base}.example`;
}

class MockProvider implements EmailProvider {
  readonly isMock = true;
  constructor(readonly name: string, private readonly outcome: (h: number) => EnrichResult["status"]) {}
  async findEmail(input: EnrichInput): Promise<EnrichResult> {
    const email = mockAddress(input);
    if (!email) return NOT_FOUND;
    const status = this.outcome(hash(`${this.name}|${email}`));
    if (status === "not_found") return NOT_FOUND;
    return { status, email, confidence: status === "verified" ? 0.95 : 0.6, sourceUrl: null };
  }
}

/** Finds something for ~2/3 of inputs: verified for 1/3, unverified for 1/3. */
export const mockA: EmailProvider = new MockProvider("mockA", (h) => (["verified", "unverified", "not_found"] as const)[h % 3]);
/** Verifies half of inputs, never returns unverified guesses. */
export const mockB: EmailProvider = new MockProvider("mockB", (h) => (h % 2 === 0 ? "verified" : "not_found"));
