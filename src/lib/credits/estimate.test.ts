import { describe, expect, it } from "vitest";
import { effectiveRowLimit, estimatePlayCredits } from "./estimate";

describe("credit estimates", () => {
  it("caps rows at the plan limit", () => {
    expect(effectiveRowLimit(100, "free")).toBe(30);
    expect(effectiveRowLimit(10, "free")).toBe(10);
    expect(effectiveRowLimit(100, "pro")).toBe(100);
    expect(effectiveRowLimit(-5, "free")).toBe(0);
  });
  it("estimate = rows x cost per lead", () => {
    expect(estimatePlayCredits("hiring_signal", 30, "free")).toBe(30);
    expect(estimatePlayCredits("hiring_signal", 500, "free")).toBe(30);
    expect(estimatePlayCredits("hiring_signal", 200, "pro")).toBe(200);
  });
});
