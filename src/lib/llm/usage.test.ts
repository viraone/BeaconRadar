import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "./usage";

describe("estimateCostUsd", () => {
  it("prices deepseek-flash at list rates", () => {
    // 1M in + 1M out = 0.30 + 1.20
    expect(estimateCostUsd("deepseek-flash", 1_000_000, 1_000_000)).toBeCloseTo(1.5, 6);
    // a typical draft: 2,000 in, 300 out
    expect(estimateCostUsd("deepseek-flash", 2000, 300)).toBeCloseTo(0.00096, 6);
  });
  it("matches by prefix for dated model ids and returns null for unknown models", () => {
    expect(estimateCostUsd("deepseek-flash-20261001", 1_000_000, 0)).toBeCloseTo(0.3, 6);
    expect(estimateCostUsd("some-other-model", 1000, 1000)).toBeNull();
    expect(estimateCostUsd("mock", 99999, 99999)).toBe(0);
  });
});
