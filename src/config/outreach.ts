/** Rules for outreach drafts and sequences. Enforced in code (lib/outreach/validators.ts), not only in prompts. */

export const BELIEF_STAGES = ["problem_awareness", "problem_prioritization", "solution_preference", "commercial_agreement", "championship"] as const;
export type BeliefStage = (typeof BELIEF_STAGES)[number];

export const STAGE_LABELS: Record<BeliefStage, string> = {
  problem_awareness: "Problem awareness",
  problem_prioritization: "Problem prioritization",
  solution_preference: "Solution preference",
  commercial_agreement: "Commercial agreement",
  championship: "Championship",
};

/** Cold first touches may only target these. */
export const COLD_TOUCH_STAGES: readonly BeliefStage[] = ["problem_awareness", "problem_prioritization"];

export const LIMITS = {
  /** words in the message body, footer excluded */
  emailMaxWords: 120,
  /** characters; LinkedIn's own cap for connection notes */
  linkedinConnectMaxChars: 300,
  linkedinMessageMaxWords: 90,
  subjectMaxChars: 60,
  /** share of a follow-up's words already present in earlier steps above which it is "the same email again" */
  maxOverlapWithPrevious: 0.6,
  /** share of the new_value detail's meaningful words that must appear in the body */
  minNewValueCoverage: 0.5,
} as const;

/** Follow-ups containing any of these are rejected as "just checking in". */
export const NUDGE_PHRASES = [
  "just checking in",
  "checking in",
  "circling back",
  "bumping this",
  "bump this",
  "following up on my last",
  "following up on my previous",
  "follow up on my last",
  "any update",
  "any updates",
  "did you see my",
  "did you get my",
  "wanted to follow up",
  "touching base",
  "just following up",
  "gentle reminder",
  "friendly reminder",
  "top of your inbox",
];

/** Asks for the reader's time instead of a yes/no. */
export const TIME_ASK_PATTERNS: RegExp[] = [
  /\b\d{1,3}\s*(?:-|–)?\s*min(?:ute)?s?\b/i,
  /\bhalf an hour\b/i,
  /\b(?:quick|short|brief)\s+(?:call|chat|meeting|sync)\b/i,
  /\bhop on (?:a|the) (?:call|phone)\b/i,
  /\bjump on (?:a|the) (?:call|phone)\b/i,
  /\bbook (?:a|some) (?:time|call|meeting|slot)\b/i,
  /\bgrab (?:some )?time\b/i,
  /\bcalendly\b/i,
  /\bcal\.com\b/i,
  /\bcalendar link\b/i,
  /\bschedule (?:a|some) (?:call|time|meeting|demo)\b/i,
  /\bfree (?:for|on) (?:a call|\w+day)\b/i,
];

/** Appended to every email draft by code. {{name}}, {{company}}, {{address}} are filled from workspace settings. */
export const EMAIL_FOOTER_TEMPLATE = `--
{{name}}, {{company}}
{{address}}
If you'd rather not hear from me again, reply "unsubscribe" and I'll stop.`;

/** The line that separates message from footer (RFC 3676 signature delimiter). */
export const FOOTER_DELIMITER = "--";
