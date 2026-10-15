import { describe, expect, it } from "vitest";
import { cleanList, linesToList, normalizeSizes, parseIcp, sizeToBuckets } from "./icp";

describe("cleanList", () => {
  it("trims, strips bullets and trailing punctuation, dedupes case-insensitively", () => {
    expect(cleanList(["  - Head of Sales.", "head of sales", "VP Sales;", ""])).toEqual(["Head of Sales", "VP Sales"]);
  });
  it("drops non-strings and overlong items, clamps to 8", () => {
    const long = "x".repeat(121);
    const many = Array.from({ length: 12 }, (_, i) => `item ${i}`);
    expect(cleanList([1, null, long, ...many] as unknown[])).toHaveLength(8);
  });
  it("returns [] for non-arrays", () => {
    expect(cleanList("nope")).toEqual([]);
    expect(cleanList(undefined)).toEqual([]);
  });
});

describe("sizeToBuckets", () => {
  it.each([
    ["51-200", ["51-200"]],
    ["50-200 employees", ["11-50", "51-200"]],
    ["200+", ["51-200", "201-1000", "1000+"]],
    ["1,000 or more", ["201-1000", "1000+"]],
    ["under 50", ["1-10", "11-50"]],
    ["mid-market", ["51-200", "201-1000"]],
    ["Enterprise", ["1000+"]],
    ["SMB", ["11-50", "51-200"]],
    ["startups", ["1-10", "11-50"]],
    ["25 employees", ["11-50"]],
    ["whatever", []],
    ["", []],
  ])("%s", (input, expected) => {
    expect(sizeToBuckets(input)).toEqual(expected);
  });
});

describe("normalizeSizes", () => {
  it("merges and orders buckets", () => {
    expect(normalizeSizes(["enterprise", "11-50", "mid-market", "11-50"])).toEqual(["11-50", "51-200", "201-1000", "1000+"]);
  });
  it("ignores junk", () => {
    expect(normalizeSizes([3, null, "big"] as unknown[])).toEqual([]);
  });
});

describe("parseIcp", () => {
  it("fills every field and never returns undefined", () => {
    const icp = parseIcp({ industries: ["SaaS", " saas "], companySizes: ["50-200"] });
    expect(icp).toEqual({
      industries: ["SaaS"],
      companySizes: ["11-50", "51-200"],
      geographies: [],
      buyerTitles: [],
      painPoints: [],
      buyingSignals: [],
      disqualifiers: [],
    });
  });
  it("tolerates null", () => {
    expect(parseIcp(null).industries).toEqual([]);
  });
});

describe("linesToList", () => {
  it("splits textarea input", () => {
    expect(linesToList("Head of Ops\n\n  VP Finance \r\nhead of ops")).toEqual(["Head of Ops", "VP Finance"]);
  });
});
