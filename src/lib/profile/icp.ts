import { z } from "zod";
import type { Icp } from "@/lib/db/schema";

/**
 * ICP parser: turns loosely structured model output (or user form input) into a
 * clean, bounded Icp. Trims, de-duplicates case-insensitively, drops empties and
 * overlong items, clamps list lengths, and maps company sizes onto fixed buckets.
 */

export const COMPANY_SIZE_BUCKETS = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;
export type CompanySizeBucket = (typeof COMPANY_SIZE_BUCKETS)[number];

export const MAX_ITEMS = 8;
export const MAX_ITEM_CHARS = 120;

/** What we ask the model for. Loose on purpose; parseIcp tightens it. */
export const rawIcpSchema = z.object({
  industries: z.array(z.string()).describe("Industries or verticals the ideal customer is in"),
  companySizes: z.array(z.string()).describe("Employee-count ranges or descriptors, e.g. '51-200', 'mid-market'"),
  geographies: z.array(z.string()).describe("Countries or regions served; empty if global/unspecified"),
  buyerTitles: z.array(z.string()).describe("Job titles of the people who buy or champion this"),
  painPoints: z.array(z.string()).describe("Problems the product solves, in the customer's words"),
  buyingSignals: z.array(z.string()).describe("Observable signs a company needs this now, e.g. 'hiring an RevOps manager'"),
  disqualifiers: z.array(z.string()).describe("Traits that make a company a poor fit"),
});
export type RawIcp = z.infer<typeof rawIcpSchema>;

export const rawCompanyProfileSchema = z.object({
  companyName: z.string().nullable().describe("The company's name exactly as written on the site, or null if unclear"),
  summary: z.string().describe("Two or three plain sentences on what the company does and for whom"),
  offering: z.string().describe("One sentence naming the product/service category"),
  icp: rawIcpSchema,
});
export type RawCompanyProfile = z.infer<typeof rawCompanyProfileSchema>;

export function parseIcp(raw: Partial<RawIcp> | null | undefined): Icp {
  const r = raw ?? {};
  return {
    industries: cleanList(r.industries),
    companySizes: normalizeSizes(r.companySizes ?? []),
    geographies: cleanList(r.geographies),
    buyerTitles: cleanList(r.buyerTitles),
    painPoints: cleanList(r.painPoints, 200),
    buyingSignals: cleanList(r.buyingSignals, 160),
    disqualifiers: cleanList(r.disqualifiers, 160),
  };
}

export function emptyIcp(): Icp {
  return parseIcp({});
}

export function cleanList(items: unknown, maxChars = MAX_ITEM_CHARS, maxItems = MAX_ITEMS): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const v = item.replace(/\s+/g, " ").replace(/^[\s\-•*–]+/, "").trim().replace(/[.;,]+$/, "");
    if (!v || v.length > maxChars) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Map free text like "SMB", "50-200 employees", "enterprise" onto fixed buckets, in order. */
export function normalizeSizes(items: unknown): CompanySizeBucket[] {
  if (!Array.isArray(items)) return [];
  const picked = new Set<CompanySizeBucket>();
  for (const raw of items) {
    if (typeof raw !== "string") continue;
    for (const b of sizeToBuckets(raw)) picked.add(b);
  }
  return COMPANY_SIZE_BUCKETS.filter((b) => picked.has(b));
}

export function sizeToBuckets(input: string): CompanySizeBucket[] {
  const s = input.toLowerCase().replace(/,/g, "").trim();
  if (!s) return [];
  if ((COMPANY_SIZE_BUCKETS as readonly string[]).includes(s)) return [s as CompanySizeBucket];

  // numeric ranges: "50-200", "50–200 employees", "200+", "under 50", "1000 or more"
  const plus = s.match(/(\d+)\s*\+|(\d+)\s*(or more|and up|and above)|over\s*(\d+)|more than\s*(\d+)/);
  if (plus) {
    const n = Number(plus[1] ?? plus[2] ?? plus[4] ?? plus[5]);
    return bucketsFrom(n, Infinity);
  }
  const under = s.match(/(under|fewer than|less than|up to|<)\s*(\d+)/);
  if (under) return bucketsFrom(1, Number(under[2]));
  const range = s.match(/(\d+)\s*(?:-|–|—|to)\s*(\d+)/);
  if (range) return bucketsFrom(Number(range[1]), Number(range[2]));
  const single = s.match(/^(\d+)\s*(employees|people|staff|seats)?$/);
  if (single) return bucketsFrom(Number(single[1]), Number(single[1]));

  // descriptors
  if (/\b(solo|freelanc|micro|very small|1-person|one-person|startups?)\b/.test(s)) return ["1-10", "11-50"];
  if (/\b(smb|small business|small|sme)\b/.test(s)) return ["11-50", "51-200"];
  if (/\b(mid-?market|mid-?size|medium|growth-stage|scale-?up)\b/.test(s)) return ["51-200", "201-1000"];
  if (/\b(enterprise|large|fortune|global 2000)\b/.test(s)) return ["1000+"];
  return [];
}

function bucketsFrom(lo: number, hi: number): CompanySizeBucket[] {
  if (Number.isNaN(lo) || Number.isNaN(hi)) return [];
  const edges: Array<[number, number, CompanySizeBucket]> = [
    [1, 10, "1-10"], [11, 50, "11-50"], [51, 200, "51-200"], [201, 1000, "201-1000"], [1001, Infinity, "1000+"],
  ];
  const a = Math.max(1, Math.min(lo, hi));
  const b = Math.max(lo, hi);
  return edges.filter(([elo, ehi]) => a <= ehi && b >= elo).map(([, , name]) => name);
}

/** For form input: one item per line. */
export function linesToList(text: string | null | undefined): string[] {
  return cleanList((text ?? "").split(/\r?\n/));
}
