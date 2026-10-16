import { describe, expect, it } from "vitest";
import type { Icp } from "@/lib/db/schema";
import { mockLlm } from "@/lib/llm/llm";
import { mockRecommendations, normalizeRecommendations, recommendPlays } from "./recommend";

const icp: Icp = {
  industries: ["Restaurants and cafés", "Gyms and studios"],
  companySizes: ["1-10", "11-50"],
  geographies: ["United States"],
  buyerTitles: ["Restaurant owner", "Gym owner"],
  painPoints: ["No coding skills"],
  buyingSignals: ["Hiring a marketing or community manager", "Uses Stripe"],
  disqualifiers: [],
};

describe("mockRecommendations", () => {
  it("derives hiring roles from 'hiring ...' buying signals", () => {
    const r = mockRecommendations(icp);
    expect(r.plays[0]).toMatchObject({ type: "hiring_signal", roles: ["marketing or community manager"] });
    expect(r.plays.map((p) => p.type)).toEqual(["hiring_signal", "decision_makers", "local_business", "local_business"]);
  });
});

describe("normalizeRecommendations", () => {
  it("validates params per type, dedupes, keeps hiring first, caps at 5", () => {
    const out = normalizeRecommendations(
      {
        plays: [
          { type: "local_business", title: "Gyms in Seattle", rationale: "r", roles: [], buyerTitles: [], category: "gym", city: "Seattle" },
          { type: "hiring_signal", title: "Hiring marketers", rationale: "r", roles: ["Marketing Manager", "marketing manager"], buyerTitles: [], category: null, city: null },
          { type: "hiring_signal", title: "dup", rationale: "r", roles: ["Marketing Manager"], buyerTitles: [], category: null, city: null },
          { type: "hiring_signal", title: "empty roles", rationale: "r", roles: [], buyerTitles: [], category: null, city: null },
          { type: "decision_makers", title: "Owners", rationale: "r", roles: [], buyerTitles: [], category: null, city: null },
          { type: "local_business", title: "no category", rationale: "r", roles: [], buyerTitles: [], category: "", city: null },
          { type: "local_business", title: "Cafes", rationale: "r", roles: [], buyerTitles: [], category: "cafe", city: null },
          { type: "local_business", title: "Studios", rationale: "r", roles: [], buyerTitles: [], category: "studio", city: null },
          { type: "local_business", title: "Bars", rationale: "r", roles: [], buyerTitles: [], category: "bar", city: null },
        ],
      },
      icp,
    );
    expect(out[0]).toMatchObject({ type: "hiring_signal", params: { roles: ["Marketing Manager"] }, runnable: true });
    expect(out).toHaveLength(5);
    expect(out.find((p) => p.type === "decision_makers")?.params).toEqual({ buyerTitles: icp.buyerTitles });
    expect(out.filter((p) => p.type === "local_business").every((p) => !p.runnable)).toBe(true);
  });
  it("adds a hiring play when the model forgot one", () => {
    const out = normalizeRecommendations({ plays: [{ type: "local_business", title: "Gyms", rationale: "r", roles: [], buyerTitles: [], category: "gym", city: null }] }, icp);
    expect(out[0].type).toBe("hiring_signal");
  });
});

describe("recommendPlays with the mock provider", () => {
  it("returns 3-5 normalized plays", async () => {
    const out = await recommendPlays({ companyName: "TapAndLaunch", summary: null, offering: null, icp }, mockLlm);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThanOrEqual(5);
    expect(out[0].type).toBe("hiring_signal");
  });
});
