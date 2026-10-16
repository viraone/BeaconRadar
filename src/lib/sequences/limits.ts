export type CompanyCapInput = {
  /** Distinct people at this company already in active or completed enrollments. */
  enrolledContacts: number;
  /** Whether this exact lead already has an enrollment in the sequence. */
  leadAlreadyEnrolled: boolean;
  maxContactsPerCompany: number;
};

export type CapDecision = { ok: true } | { ok: false; reason: string };

/** Per-company contact cap (1-2 people per company). */
export function checkCompanyCap(input: CompanyCapInput): CapDecision {
  if (input.leadAlreadyEnrolled) return { ok: false, reason: "already enrolled in this sequence" };
  if (input.enrolledContacts >= input.maxContactsPerCompany) {
    return { ok: false, reason: `company already has ${input.enrolledContacts} contact${input.enrolledContacts === 1 ? "" : "s"} in a sequence (cap ${input.maxContactsPerCompany})` };
  }
  return { ok: true };
}

/** Per-sender daily cap: sends = tasks marked done today. */
export function dailyCapacity(cap: number, doneToday: number): number {
  return Math.max(0, cap - doneToday);
}

export function checkDailyCap(cap: number, doneToday: number): CapDecision {
  return doneToday >= cap ? { ok: false, reason: `daily send cap of ${cap} reached; this task rolls to tomorrow` } : { ok: true };
}
