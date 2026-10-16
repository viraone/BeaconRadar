import { TASK_DUE_HOUR } from "@/config/outreach";

export type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

/** Calendar parts of an instant in a time zone. */
export function localParts(date: Date, timeZone: string): DateParts {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const get = (type: string) => Number(fmt.formatToParts(date).find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24, minute: get("minute") };
}

/** The instant at which a wall-clock time occurs in a time zone (DST-safe). */
export function zonedTime(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
    guess += Date.UTC(year, month - 1, day, hour, 0, 0) - asUtc;
  }
  return new Date(guess);
}

/** Local calendar date key, e.g. "2026-10-15". */
export function localDateKey(date: Date, timeZone: string): string {
  const p = localParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of the local day containing `date`. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const p = localParts(date, timeZone);
  return zonedTime(p.year, p.month, p.day, 0, timeZone);
}

/** End (exclusive) of the local day containing `date`. */
export function endOfLocalDay(date: Date, timeZone: string): Date {
  const p = localParts(date, timeZone);
  return zonedTime(p.year, p.month, p.day + 1, 0, timeZone);
}

/**
 * When the next step is due: `waitDays` calendar days after the previous step
 * was completed, at TASK_DUE_HOUR local time. waitDays 0 means right now.
 */
export function nextDueAt(completedAt: Date, waitDays: number, timeZone: string): Date {
  if (waitDays <= 0) return completedAt;
  const p = localParts(completedAt, timeZone);
  return zonedTime(p.year, p.month, p.day + waitDays, TASK_DUE_HOUR, timeZone);
}

export function isDue(dueAt: Date, now: Date, timeZone: string): boolean {
  return dueAt.getTime() < endOfLocalDay(now, timeZone).getTime();
}
