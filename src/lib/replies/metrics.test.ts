import { describe, expect, it } from "vitest";
import { impliedStage } from "./log";
import { computeMetrics } from "./metrics";

describe("computeMetrics", () => {
  const input = {
    contacted: [
      { leadId: "a", playType: "hiring_signal", channels: ["linkedin_connect", "email"], stepsDone: 2 },
      { leadId: "b", playType: "hiring_signal", channels: ["linkedin_connect"], stepsDone: 1 },
      { leadId: "c", playType: "local_business", channels: ["email"], stepsDone: 1 },
      { leadId: "d", playType: "hiring_signal", channels: ["email"], stepsDone: 1 },
    ],
    replies: [
      { leadId: "a", outcome: "positive", objectionType: null, channel: "email", stepsDoneAtReply: 2, leadStage: "problem_prioritization", playType: "hiring_signal" },
      { leadId: "a", outcome: "meeting_booked", objectionType: null, channel: "email", stepsDoneAtReply: 2, leadStage: "solution_preference", playType: "hiring_signal" },
      { leadId: "b", outcome: "negative", objectionType: "timing", channel: "linkedin_connect", stepsDoneAtReply: 1, leadStage: "problem_awareness", playType: "hiring_signal" },
      { leadId: "c", outcome: "opt_out", objectionType: "no_need", channel: "email", stepsDoneAtReply: null, leadStage: "problem_awareness", playType: "local_business" },
    ],
    awaitingOutcome: 3,
    target: { min: 30, max: 50 },
  };
  const m = computeMetrics(input);

  it("counts distinct leads, not rows", () => {
    expect(m.contacted).toBe(4);
    expect(m.replies).toBe(3);
    expect(m.positive).toBe(1);
    expect(m.meetings).toBe(1);
    expect(m.replyRate).toBeCloseTo(0.75);
    expect(m.positiveRate).toBeCloseTo(0.25);
    expect(m.awaitingOutcome).toBe(3);
  });
  it("tracks progress toward the 30-50 target", () => {
    expect(m.target.progress).toBeCloseTo(4 / 30);
    expect(computeMetrics({ ...input, contacted: Array.from({ length: 40 }, (_, i) => ({ leadId: `l${i}`, playType: "x", channels: [], stepsDone: 1 })) }).target.progress).toBe(1);
  });
  it("breaks down by play type, channel, step and stage", () => {
    expect(m.byPlayType).toEqual([
      { key: "hiring_signal", contacted: 3, replies: 2, positive: 1 },
      { key: "local_business", contacted: 1, replies: 1, positive: 0 },
    ]);
    expect(m.byChannel.find((b) => b.key === "email")).toEqual({ key: "email", contacted: 3, replies: 2, positive: 1 });
    expect(m.byStep.find((b) => b.key === "step 2")).toEqual({ key: "step 2", contacted: 1, replies: 1, positive: 1 });
    expect(m.byStep.find((b) => b.key === "outside a sequence")).toEqual({ key: "outside a sequence", contacted: 0, replies: 1, positive: 0 });
    expect(m.byStage.map((b) => b.key)).toContain("solution_preference");
  });
  it("counts objections and outcomes", () => {
    expect(m.objections).toEqual([{ key: "no_need", count: 1 }, { key: "timing", count: 1 }]);
    expect(m.outcomes.map((o) => o.key)).toEqual(["meeting_booked", "negative", "opt_out", "positive"]);
  });
  it("has no open-rate metric", () => {
    expect(JSON.stringify(m)).not.toMatch(/open/i);
  });
  it("handles an empty workspace", () => {
    const e = computeMetrics({ contacted: [], replies: [], awaitingOutcome: 0, target: { min: 30, max: 50 } });
    expect(e.replyRate).toBeNull();
    expect(e.target.progress).toBe(0);
  });
});

describe("impliedStage", () => {
  it("moves up one on positive, to solution preference on a meeting, never down", () => {
    expect(impliedStage("problem_awareness", "positive")).toBe("problem_prioritization");
    expect(impliedStage("problem_awareness", "meeting_booked")).toBe("solution_preference");
    expect(impliedStage("championship", "meeting_booked")).toBe("championship");
    expect(impliedStage("solution_preference", "negative")).toBe("solution_preference");
    expect(impliedStage("championship", "positive")).toBe("championship");
  });
});
