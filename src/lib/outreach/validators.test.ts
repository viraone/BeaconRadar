import { describe, expect, it } from "vitest";
import { appendFooter, buildFooter, hasFooter, senderIsComplete, stripFooter } from "./footer";
import { isStageAllowed, maxTargetStage } from "./stages";
import { validateDraft, type DraftCandidate, type DraftContext } from "./validators";

const sender = { senderName: "Vee Xay", senderCompany: "TapAndLaunch", senderPostalAddress: "123 Pine St\nSeattle, WA 98101" };

const good: DraftCandidate = {
  channel: "email",
  subject: "The marketing manager hire at MockFit",
  body: "Hi Sam,\n\nSaw MockFit is hiring a community manager. Studios adding that role usually want members to hear about classes without building an app.\n\nTapAndLaunch turns your site into an installable app with push notifications in an afternoon, no developers.\n\nWorth a look for MockFit?",
  beliefStage: "problem_awareness",
  newValue: null,
};
const first: DraftContext = { leadStage: "problem_awareness", stepNumber: 1, previousBodies: [] };

describe("footer", () => {
  it("requires complete sender info", () => {
    expect(senderIsComplete(sender)).toBe(true);
    expect(senderIsComplete({ ...sender, senderPostalAddress: " " })).toBe(false);
    expect(() => buildFooter({ ...sender, senderPostalAddress: null })).toThrow(/postal address/);
  });
  it("appends identity, address and opt-out after a -- line, and strips it back off", () => {
    const full = appendFooter(good.body, sender);
    expect(full).toContain("\n--\nVee Xay, TapAndLaunch\n123 Pine St, Seattle, WA 98101\nIf you'd rather not hear from me again");
    expect(hasFooter(full)).toBe(true);
    expect(stripFooter(full)).toBe(good.body);
    expect(appendFooter(full, sender)).toBe(full); // idempotent
  });
});

describe("stages", () => {
  it("allows at most one rung up", () => {
    expect(maxTargetStage("problem_awareness")).toBe("problem_prioritization");
    expect(maxTargetStage("championship")).toBe("championship");
    expect(isStageAllowed("solution_preference", "problem_awareness")).toBe(false);
    expect(isStageAllowed("solution_preference", "problem_prioritization")).toBe(true);
  });
});

describe("validateDraft: first touch", () => {
  it("passes a short, problem-first email with one yes/no ask", () => {
    expect(validateDraft(good, first)).toEqual([]);
    expect(validateDraft({ ...good, body: appendFooter(good.body, sender) }, first)).toEqual([]);
  });
  it("blocks long emails", () => {
    const long = { ...good, body: good.body + " " + "word ".repeat(120) };
    expect(validateDraft(long, first).join(" ")).toMatch(/Too long/);
  });
  it("requires exactly one ask", () => {
    expect(validateDraft({ ...good, body: good.body.replace("?", ".") }, first).join(" ")).toMatch(/No ask/);
    expect(validateDraft({ ...good, body: good.body + " Also, is Tuesday ok?" }, first).join(" ")).toMatch(/More than one ask/);
  });
  it.each(["Got 15 minutes this week?", "Can we hop on a call?", "Here's my calendly link, free for a quick chat?", "Could you book some time?"])("blocks time asks: %s", (ask) => {
    const b = { ...good, body: good.body.replace("Worth a look for MockFit?", ask) };
    expect(validateDraft(b, first).join(" ")).toMatch(/Asks for time/);
  });
  it("blocks exclamation marks and missing subject", () => {
    expect(validateDraft({ ...good, body: good.body.replace("Hi Sam,", "Hi Sam!") }, first).join(" ")).toMatch(/exclamation/);
    expect(validateDraft({ ...good, subject: "" }, first).join(" ")).toMatch(/Missing subject/);
  });
  it("blocks a cold touch that pitches above the ladder", () => {
    const r = validateDraft({ ...good, beliefStage: "solution_preference" }, first);
    expect(r.join(" ")).toMatch(/cold first touch/);
    expect(r.join(" ")).toMatch(/highest allowed is problem_prioritization/);
  });
  it("linkedin connect notes: char limit, question optional", () => {
    const note: DraftCandidate = { channel: "linkedin_connect", subject: null, body: "Saw MockFit is hiring a community manager. Happy to connect.", beliefStage: "problem_awareness", newValue: null };
    expect(validateDraft(note, first)).toEqual([]);
    expect(validateDraft({ ...note, body: "x".repeat(301) }, first).join(" ")).toMatch(/300/);
  });
});

describe("validateDraft: follow-ups", () => {
  const prev = good.body;
  const follow: DraftCandidate = {
    channel: "email",
    subject: "Re: The marketing manager hire at MockFit",
    body: "Hi Sam,\n\nOne thing I didn't mention: a Portland gym we work with filled its Saturday classes using push reminders, 40 percent more bookings in a month.\n\nWould a 1-page writeup of how they set it up be useful?",
    beliefStage: "problem_prioritization",
    newValue: { type: "proof", detail: "Portland gym filled Saturday classes with push reminders, 40 percent more bookings" },
  };
  const ctx: DraftContext = { leadStage: "problem_awareness", stepNumber: 2, previousBodies: [prev] };

  it("passes a follow-up that adds proof", () => {
    expect(validateDraft(follow, ctx)).toEqual([]);
  });
  it.each(["Just checking in on this?", "Circling back on my note. Any update?", "Bumping this to the top of your inbox. Did you see my last email?", "Wanted to follow up on my last email. Thoughts?"])(
    'rejects "just checking in" drafts: %s',
    (body) => {
      const r = validateDraft({ ...follow, body }, ctx);
      expect(r.join(" ")).toMatch(/just checking in/);
    },
  );
  it("requires a stated new value that actually appears in the text", () => {
    expect(validateDraft({ ...follow, newValue: null }, ctx).join(" ")).toMatch(/no new value/);
    expect(validateDraft({ ...follow, newValue: { type: "resource", detail: "pricing calculator spreadsheet template" } }, ctx).join(" ")).toMatch(/doesn't appear/);
  });
  it("rejects a near-copy of an earlier message", () => {
    const copy = { ...follow, body: prev + " Still worth a look?", newValue: { type: "angle" as const, detail: "studios hiring a community manager want members to hear about classes" } };
    const r = validateDraft(copy, ctx);
    expect(r.join(" ")).toMatch(/repeats an earlier message/);
  });
});
