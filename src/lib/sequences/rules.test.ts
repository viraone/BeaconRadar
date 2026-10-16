import { describe, expect, it } from "vitest";
import { checkCompanyCap, checkDailyCap, dailyCapacity } from "./limits";
import { evaluateStop } from "./stop";

describe("per-company contact cap", () => {
  it("allows up to the cap, then refuses", () => {
    expect(checkCompanyCap({ enrolledContacts: 0, leadAlreadyEnrolled: false, maxContactsPerCompany: 2 })).toEqual({ ok: true });
    expect(checkCompanyCap({ enrolledContacts: 1, leadAlreadyEnrolled: false, maxContactsPerCompany: 2 })).toEqual({ ok: true });
    expect(checkCompanyCap({ enrolledContacts: 2, leadAlreadyEnrolled: false, maxContactsPerCompany: 2 }).ok).toBe(false);
    expect(checkCompanyCap({ enrolledContacts: 1, leadAlreadyEnrolled: false, maxContactsPerCompany: 1 }).ok).toBe(false);
  });
  it("refuses a lead already enrolled", () => {
    const r = checkCompanyCap({ enrolledContacts: 0, leadAlreadyEnrolled: true, maxContactsPerCompany: 2 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/already enrolled/);
  });
});

describe("daily send cap", () => {
  it("counts down and refuses at the cap", () => {
    expect(dailyCapacity(25, 0)).toBe(25);
    expect(dailyCapacity(25, 24)).toBe(1);
    expect(dailyCapacity(25, 30)).toBe(0);
    expect(checkDailyCap(25, 24)).toEqual({ ok: true });
    expect(checkDailyCap(25, 25).ok).toBe(false);
  });
});

describe("stop rules", () => {
  it("stops on reply, opt-out or suppression; opt-out wins", () => {
    expect(evaluateStop({ replied: false, optedOut: false, suppressed: false })).toBeNull();
    expect(evaluateStop({ replied: true, optedOut: false, suppressed: false })).toBe("replied");
    expect(evaluateStop({ replied: true, optedOut: true, suppressed: false })).toBe("opted_out");
    expect(evaluateStop({ replied: false, optedOut: false, suppressed: true })).toBe("suppressed");
  });
});
