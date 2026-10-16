import { describe, expect, it } from "vitest";
import { endOfLocalDay, isDue, localDateKey, localParts, nextDueAt, startOfLocalDay, zonedTime } from "./timing";

const LA = "America/Los_Angeles";

describe("time zone helpers", () => {
  it("reads local parts and builds zoned instants, including across DST", () => {
    // 2026-03-08 02:30 LA does not exist (spring forward); we only use whole hours so check a normal day
    const d = zonedTime(2026, 10, 15, 9, LA);
    expect(d.toISOString()).toBe("2026-10-15T16:00:00.000Z"); // PDT = UTC-7
    expect(localParts(d, LA)).toMatchObject({ year: 2026, month: 10, day: 15, hour: 9, minute: 0 });
    const winter = zonedTime(2026, 12, 1, 9, LA);
    expect(winter.toISOString()).toBe("2026-12-01T17:00:00.000Z"); // PST = UTC-8
    expect(localDateKey(new Date("2026-10-16T03:30:00Z"), LA)).toBe("2026-10-15"); // 8:30pm PDT the day before
  });
  it("day boundaries follow the zone", () => {
    const now = new Date("2026-10-16T03:30:00Z"); // 2026-10-15 20:30 PDT
    expect(startOfLocalDay(now, LA).toISOString()).toBe("2026-10-15T07:00:00.000Z");
    expect(endOfLocalDay(now, LA).toISOString()).toBe("2026-10-16T07:00:00.000Z");
  });
});

describe("nextDueAt (sequence step timing)", () => {
  const done = new Date("2026-10-15T22:45:00Z"); // 2026-10-15 15:45 PDT
  it("default 7-day wait lands on the same weekday a week later at 9am local", () => {
    const due = nextDueAt(done, 7, LA);
    expect(due.toISOString()).toBe("2026-10-22T16:00:00.000Z");
    expect(localParts(due, LA)).toMatchObject({ month: 10, day: 22, hour: 9 });
  });
  it("custom waits: 1, 3 and 14 days", () => {
    expect(localDateKey(nextDueAt(done, 1, LA), LA)).toBe("2026-10-16");
    expect(localDateKey(nextDueAt(done, 3, LA), LA)).toBe("2026-10-18");
    expect(localDateKey(nextDueAt(done, 14, LA), LA)).toBe("2026-10-29");
  });
  it("a 0-day wait is due immediately", () => {
    expect(nextDueAt(done, 0, LA)).toEqual(done);
  });
  it("counts calendar days in the workspace zone, not UTC days", () => {
    const lateNight = new Date("2026-10-16T05:30:00Z"); // still 2026-10-15 in LA
    expect(localDateKey(nextDueAt(lateNight, 7, LA), LA)).toBe("2026-10-22");
    expect(localDateKey(nextDueAt(lateNight, 7, "UTC"), "UTC")).toBe("2026-10-23");
  });
  it("crosses the DST change without drifting the hour", () => {
    const beforeDst = new Date("2026-10-28T20:00:00Z"); // Oct 28 13:00 PDT; DST ends Nov 1
    const due = nextDueAt(beforeDst, 7, LA);
    expect(localParts(due, LA)).toMatchObject({ month: 11, day: 4, hour: 9 });
    expect(due.toISOString()).toBe("2026-11-04T17:00:00.000Z"); // PST
  });
});

describe("isDue", () => {
  const now = new Date("2026-10-15T16:00:00Z"); // 9am PDT
  it("anything due before the end of today counts as due", () => {
    expect(isDue(new Date("2026-10-15T23:00:00Z"), now, LA)).toBe(true); // 4pm today
    expect(isDue(new Date("2026-10-10T00:00:00Z"), now, LA)).toBe(true); // overdue
    expect(isDue(new Date("2026-10-16T16:00:00Z"), now, LA)).toBe(false); // tomorrow 9am
  });
});
