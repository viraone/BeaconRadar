import { LIMITS, NUDGE_PHRASES, TIME_ASK_PATTERNS, type BeliefStage } from "@/config/outreach";
import { stripFooter } from "./footer";
import { isColdTouchStage, isStageAllowed, maxTargetStage } from "./stages";

export type Channel = "email" | "linkedin_connect" | "linkedin_message";
export type NewValue = { type: "angle" | "proof" | "resource"; detail: string };

export type DraftCandidate = {
  channel: Channel;
  subject: string | null;
  /** Full text; a footer after a "--" line is ignored by the checks. */
  body: string;
  beliefStage: BeliefStage;
  newValue: NewValue | null;
};

export type DraftContext = {
  /** The lead's confirmed stage. */
  leadStage: BeliefStage;
  /** Position in the sequence: 1 = first touch. */
  stepNumber: number;
  /** Bodies of earlier steps already sent/drafted to this lead. */
  previousBodies: string[];
};

const STOP = new Set("a an the and or of to in on for with at by from is are be this that it as your you we our i my me they their if so not no yes hi hello thanks thank".split(" "));

export function words(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
}
export function meaningfulWords(text: string): string[] {
  return words(text).filter((w) => w.length > 2 && !STOP.has(w));
}
export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}
export function overlapRatio(text: string, previous: string): number {
  const a = new Set(meaningfulWords(text));
  if (a.size === 0) return 0;
  const b = new Set(meaningfulWords(previous));
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / a.size;
}

/**
 * Returns the reasons a draft must be blocked. Empty array = passes.
 * Every rule is pure so the UI can explain exactly what to fix.
 */
export function validateDraft(d: DraftCandidate, ctx: DraftContext): string[] {
  const reasons: string[] = [];
  const text = stripFooter(d.body).trim();
  const lower = text.toLowerCase();

  // length
  if (d.channel === "email") {
    const n = words(text).length;
    if (n > LIMITS.emailMaxWords) reasons.push(`Too long: ${n} words, limit ${LIMITS.emailMaxWords}.`);
    if (d.subject && d.subject.length > LIMITS.subjectMaxChars) reasons.push(`Subject too long: ${d.subject.length} chars, limit ${LIMITS.subjectMaxChars}.`);
    if (!d.subject?.trim()) reasons.push("Missing subject.");
  } else if (d.channel === "linkedin_connect") {
    if (text.length > LIMITS.linkedinConnectMaxChars) reasons.push(`Connection note too long: ${text.length} chars, LinkedIn's limit is ${LIMITS.linkedinConnectMaxChars}.`);
  } else {
    const n = words(text).length;
    if (n > LIMITS.linkedinMessageMaxWords) reasons.push(`Too long: ${n} words, limit ${LIMITS.linkedinMessageMaxWords}.`);
  }
  if (!text) reasons.push("Empty message.");

  // one ask, a yes/no
  const q = countQuestions(text);
  if (d.channel !== "linkedin_connect" || q > 0) {
    if (q === 0) reasons.push("No ask: end with one yes/no question.");
    if (q > 1) reasons.push(`More than one ask (${q} questions). Keep exactly one.`);
  }
  for (const re of TIME_ASK_PATTERNS) {
    const m = text.match(re);
    if (m) {
      reasons.push(`Asks for time ("${m[0]}"). Ask a yes/no question instead.`);
      break;
    }
  }

  // tone
  if (/!/.test(text)) reasons.push("Contains an exclamation mark. Keep it calm and plain.");

  // belief stage
  if (ctx.stepNumber === 1 && !isColdTouchStage(d.beliefStage)) {
    reasons.push(`A cold first touch must target problem awareness or prioritization, not ${d.beliefStage}.`);
  }
  if (!isStageAllowed(d.beliefStage, ctx.leadStage)) {
    reasons.push(`Targets ${d.beliefStage} but this lead has only shown ${ctx.leadStage}; the highest allowed is ${maxTargetStage(ctx.leadStage)}.`);
  }

  // follow-ups must add something new
  if (ctx.stepNumber > 1) {
    const nudge = NUDGE_PHRASES.find((p) => lower.includes(p));
    if (nudge) reasons.push(`Reads as "just checking in" ("${nudge}"). Add a new angle, proof or resource instead.`);
    if (!d.newValue || !d.newValue.detail.trim()) {
      reasons.push("Follow-up has no new value (angle, proof or resource).");
    } else {
      const need = meaningfulWords(d.newValue.detail);
      const have = new Set(meaningfulWords(text));
      const covered = need.filter((w) => have.has(w)).length;
      if (need.length > 0 && covered / need.length < LIMITS.minNewValueCoverage) {
        reasons.push("The stated new value doesn't appear in the message.");
      }
    }
    for (const prev of ctx.previousBodies) {
      if (overlapRatio(text, stripFooter(prev)) > LIMITS.maxOverlapWithPrevious) {
        reasons.push("Mostly repeats an earlier message.");
        break;
      }
    }
  }

  return reasons;
}
